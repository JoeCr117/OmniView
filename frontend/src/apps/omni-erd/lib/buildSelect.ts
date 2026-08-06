import { type Quoter, quoterFor } from "./dialect";
import { type BridgeCandidate, analyzeJoins, joinColumns } from "./joinGraph";
import type { Entity, Relationship, SchemaGraph } from "./types";

/**
 * A runnable `SELECT` over an ordered multi-selection of tables.
 *
 * Omni-ERD never executes this - the user pastes it into their own SQL tool -
 * which is exactly why the result is structured rather than a bare string. The
 * interesting cases are the ones where a string alone would be a lie by
 * omission: a table nobody can join to is silently absent from a statement that
 * still looks complete.
 *
 * What it does not do:
 *  - **No override logic.** `infer.py` returns relationships most authoritative
 *    first - overrides, then declared, then inferred - deduplicated by unordered
 *    pair. Taking the *first* usable relationship joining a pair therefore
 *    already means "the admin's override if there is one, otherwise the computed
 *    edge". Re-deriving that precedence here would be a second copy of a rule
 *    that lives on the backend.
 *  - **No `LIMIT`.** Silently bounding a query the user is going to run
 *    elsewhere changes what it means.
 *  - **No `LEFT JOIN` and no cartesian product.** An inner join is what the
 *    diagram claims; a comma-join or `CROSS JOIN` of unrelated tables is a
 *    result nobody asked for.
 *
 * Two decisions worth knowing about:
 *  - **The first pick roots the statement, even when it is the isolated one.**
 *    Picks 2 and 3 joining each other does not re-root the query onto them; the
 *    output is `t1` alone and both are excluded. Pick order is the user's stated
 *    intent, and a query that quietly reorganises itself around a different
 *    table is less predictable than one that reports what it left out. What has
 *    changed is the *reporting* around that decision: excluded picks are
 *    reported as the join groups they form (`joinGraph.ts`), so two picks the
 *    diagram draws an edge between are never described as unrelated merely
 *    because the query cannot reach them.
 *  - **Growing the join chain takes repeated passes.** A single pass over the
 *    picks is not enough: with picks A, C, B where C only joins B, C is reached
 *    only after B is in. Each pass adds every pick that can attach to what is
 *    included by the time it is reached, and passes repeat until one adds
 *    nothing.
 *
 * Duplicates in `selectedIds` are collapsed to their first occurrence here,
 * rather than trusted to be absent - a repeat would otherwise leave the
 * second occurrence "unreached" while still describing it as part of the
 * query it was deduped out of.
 *
 * Quoting is not cosmetic here. dbt-postgres quotes relation names but not
 * column identifiers, so `datavault` holds CamelCase relations with lowercase
 * columns - `gold_DimDate` has a `datesk`, not a `DateSK`. Every identifier that
 * came from the catalog is quoted verbatim in the spelling the graph reports,
 * because re-casing it, or deciding per identifier whether quoting is "needed",
 * is how a generated query stops running. The `t1`..`tn` aliases are ours rather
 * than the catalog's, so they stay unquoted.
 */

export type SelectWarningCode = "empty_selection" | "unknown_entity" | "disconnected";

export interface SelectWarning {
  code: SelectWarningCode;
  /** A complete sentence, shown as-is. */
  message: string;
  entityIds: string[];
}

export interface GeneratedSelect {
  /** `null` when there is nothing runnable to show. */
  sql: string | null;
  warnings: SelectWarning[];
  /** Entity ids in the `FROM`/`JOIN` chain, in emitted order - which is also
   *  alias order, `t1` first. */
  included: string[];
  /** Picked ids that did not make it into the statement, for any reason. */
  excluded: string[];
  /** The picks split into sets that join each other, in pick order. The first
   *  group is the same set as `included`; every later group is excluded rows
   *  that join one another even though the query cannot reach them, which is
   *  what a row label has to say instead of "not joined". Empty when nothing
   *  picked is in the diagram. */
  joinGroups: string[][];
  /** Unpicked tables that would connect two or more `joinGroups` if added to
   *  the selection, best first. Empty is the common answer - most selections
   *  have no single-table bridge - and means suggest nothing. */
  suggestedBridges: BridgeCandidate[];
  /** The one bridge the `disconnected` warning offers, and the only one a UI
   *  may put behind an "add it" control. `null` means there is no remedy: the
   *  best bridge does not touch the group the statement is rooted on, so adding
   *  it would leave the SQL byte-identical. Reading this rather than
   *  `suggestedBridges[0]` is what stops the offer contradicting the sentence
   *  that describes it. */
  remedyBridge: BridgeCandidate | null;
}

/** One table joined onto the chain, and what it joined on. */
interface JoinStep {
  entityId: string;
  /** Index into `included` of the table this one joins - always already emitted,
   *  so the `ON` reads `<already-included> = <newly-joined>`. */
  anchorIndex: number;
  anchorColumns: string[];
  joinedColumns: string[];
}

interface JoinPlan {
  included: string[];
  steps: JoinStep[];
  /** Picks no chain of joins reaches from the first pick. */
  unreached: string[];
}

export function buildSelect(graph: SchemaGraph, selectedIds: readonly string[]): GeneratedSelect {
  const byId = new Map(graph.entities.map((entity) => [entity.id, entity]));
  const picked = dedupe(selectedIds.filter((id) => byId.has(id)));
  const missing = selectedIds.filter((id) => !byId.has(id));

  const warnings: SelectWarning[] = [];
  if (selectedIds.length === 0) {
    warnings.push({
      code: "empty_selection",
      message: "Pick at least one table to generate a query.",
      entityIds: [],
    });
  }
  if (missing.length > 0) warnings.push(unknownWarning(missing));

  if (picked.length === 0) {
    return {
      sql: null,
      warnings,
      included: [],
      excluded: [...selectedIds],
      joinGroups: [],
      suggestedBridges: [],
      remedyBridge: null,
    };
  }

  const { included, steps, unreached } = planJoins(graph.relationships, picked);
  const { groups, bridges, remedy } = analyzeJoins(graph, picked);
  if (unreached.length > 0) {
    warnings.push(disconnectedWarning(byId, included[0], groups.slice(1), unreached, remedy));
  }

  return {
    sql: renderSelect(byId, quoterFor(graph.source.dialect), included, steps),
    warnings,
    included,
    excluded: selectedIds.filter((id) => !included.includes(id)),
    joinGroups: groups,
    suggestedBridges: bridges,
    remedyBridge: remedy,
  };
}

/** `ids` with repeats collapsed to their first occurrence, order preserved. */
function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Which picks the statement can reach, and how.
 *
 * The first pick is the `FROM`. Everything else has to earn its way in by
 * joining something already included, which is what keeps a disconnected pick
 * out of the query instead of turning it into a cartesian product.
 */
function planJoins(relationships: readonly Relationship[], picked: readonly string[]): JoinPlan {
  const included = [picked[0]];
  const steps: JoinStep[] = [];
  let remaining = picked.slice(1);

  let progressed = true;
  while (progressed) {
    progressed = false;
    const stillOut: string[] = [];
    for (const candidate of remaining) {
      const step = attach(relationships, included, candidate);
      if (step) {
        included.push(candidate);
        steps.push(step);
        progressed = true;
      } else {
        stillOut.push(candidate);
      }
    }
    remaining = stillOut;
  }

  return { included, steps, unreached: remaining };
}

/** The earliest already-included table this candidate can join, if any. */
function attach(
  relationships: readonly Relationship[],
  included: readonly string[],
  candidate: string,
): JoinStep | null {
  for (const [anchorIndex, anchorId] of included.entries()) {
    const columns = joinColumns(relationships, anchorId, candidate);
    if (columns) {
      return {
        entityId: candidate,
        anchorIndex,
        anchorColumns: columns.anchor,
        joinedColumns: columns.joined,
      };
    }
  }
  return null;
}

function renderSelect(
  byId: ReadonlyMap<string, Entity>,
  quote: Quoter,
  included: readonly string[],
  steps: readonly JoinStep[],
): string {
  const relation = (entityId: string) => qualifiedName(byId.get(entityId)!, quote);
  const lines = ["SELECT *", `FROM ${relation(included[0])} t1`];

  steps.forEach((step, position) => {
    const alias = `t${position + 2}`;
    const anchorAlias = `t${step.anchorIndex + 1}`;
    const on = step.anchorColumns
      .map(
        (column, index) =>
          `${anchorAlias}.${quote(column)} = ${alias}.${quote(step.joinedColumns[index])}`,
      )
      .join(" AND ");
    lines.push(`JOIN ${relation(step.entityId)} ${alias} ON ${on}`);
  });

  return lines.join("\n");
}

/** Namespace-qualified, because a diagram can span schemas and the user's
 *  session is set to none of them in particular. For Databricks sources, this
 *  emits only `schema.relation`; the catalog level is held on the introspector
 *  alone, not on SourceInfo, so full qualification requires catalog on the wire. */
function qualifiedName(entity: Entity, quote: Quoter): string {
  return `${quote(entity.namespace)}.${quote(entity.name)}`;
}

function unknownWarning(entityIds: string[]): SelectWarning {
  const subject = entityIds.length === 1 ? `${entityIds[0]} is` : `${nameList(entityIds)} are`;
  const object = entityIds.length === 1 ? "it" : "them";
  return {
    code: "unknown_entity",
    message: `${subject} no longer in this diagram, so the query leaves ${object} out.`,
    entityIds,
  };
}

/**
 * The one warning that covers everything the statement could not reach.
 *
 * Group-aware on purpose: excluded picks that join *each other* are said to do
 * so, because calling them unrelated contradicts the edge the diagram is
 * drawing between them. The remedy is named when there is one; when there is
 * none, that is said plainly rather than left to be guessed at. Which bridge is
 * the remedy is decided upstream, in `analyzeJoins`, so this sentence and any
 * control offering it cannot pick differently.
 *
 * `entityIds` stays exactly the excluded picks - the flyout keys its rows off
 * it - and there is exactly one of these however many groups it describes.
 */
function disconnectedWarning(
  byId: ReadonlyMap<string, Entity>,
  rootId: string,
  excludedGroups: readonly string[][],
  entityIds: string[],
  bridge: BridgeCandidate | null,
): SelectWarning {
  const name = (entityId: string) => displayName(byId, entityId);
  const root = name(rootId);
  const clusters = excludedGroups.filter((group) => group.length > 1);
  const loners = excludedGroups.filter((group) => group.length === 1).map((group) => group[0]);

  const clauses = clusters.map(
    (group) => `${nameList(group.map(name))} join each other but not ${root}`,
  );
  if (loners.length === 1) {
    clauses.push(`${name(loners[0])} has no relationship to the tables in this query`);
  } else if (loners.length > 1) {
    clauses.push(`${nameList(loners.map(name))} have no relationship to the tables in this query`);
  }

  const subject = entityIds.length === 1 ? "it is" : "they are";
  const remedy = bridge
    ? remedySentence(bridge, excludedGroups, entityIds.length, name)
    : ` No single table in this diagram would connect ${pronoun(entityIds.length)} to ${root}.`;

  return {
    code: "disconnected",
    message: `${clauses.join("; ")}, so ${subject} left out.${remedy}`,
    entityIds,
  };
}

/** What to add, and what it reconnects. A bridge that merges only some of the
 *  excluded groups must not be described as reconnecting all of them. */
function remedySentence(
  bridge: BridgeCandidate,
  excludedGroups: readonly string[][],
  excludedCount: number,
  name: (entityId: string) => string,
): string {
  const reconnected = bridge.connectsGroups
    .filter((index) => index > 0)
    .flatMap((index) => excludedGroups[index - 1]);
  const target =
    reconnected.length === excludedCount ? pronoun(excludedCount) : nameList(reconnected.map(name));
  return ` Add ${name(bridge.entityId)} to connect ${target}.`;
}

function pronoun(excludedCount: number): string {
  return excludedCount === 1 ? "it" : "them";
}

/** The catalog spelling used in prose: namespace-qualified, because a diagram
 *  can span schemas and two of them can hold a table of the same name. Falls
 *  back to the id for an entity that has left the diagram. */
function displayName(byId: ReadonlyMap<string, Entity>, entityId: string): string {
  const entity = byId.get(entityId);
  return entity ? `${entity.namespace}.${entity.name}` : entityId;
}

function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
