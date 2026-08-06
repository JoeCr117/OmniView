import type { Relationship, SchemaGraph } from "./types";

/**
 * Which of a set of tables can join which, under the diagram's relationships.
 *
 * `joinColumns` is the single home of the predicate "can these two join?", and
 * everything else here - and the `SELECT` builder next door - asks it rather
 * than re-deciding. Two copies of that rule is how the UI ends up offering a
 * bridging table the SQL builder then refuses to use, or labelling a pair
 * unrelated while the canvas draws an edge between them: a relationship whose
 * two column arrays are empty or of unequal length is drawn, but cannot produce
 * an `ON` clause, so only one predicate may decide.
 *
 * Grouping is deliberately over the *picked* tables alone. A path through a
 * table the user did not pick is not a join this query can make - it is a
 * suggestion, which is what `bridgeCandidates` is for.
 */

/** An unpicked table that would merge two or more join groups if the user
 *  added it to the selection. */
export interface BridgeCandidate {
  entityId: string;
  /** The entity's own name, for prose - a flyout shows names, not ids. */
  name: string;
  /** Indices into the `groups` of the `JoinAnalysis` this came from, ascending.
   *  Always two or more. */
  connectsGroups: number[];
}

/**
 * Everything one selection's join structure implies, derived together.
 *
 * `groups` and `bridges` ship as one value because a bridge's `connectsGroups`
 * is meaningless against any other group list: computing the two from separate
 * calls is how a caller ends up naming the wrong tables with nothing to catch
 * it. `remedy` is here for the same reason - the offer and the sentence
 * describing it read one answer rather than two call sites re-deciding.
 */
export interface JoinAnalysis {
  /** As `joinGroups`. */
  groups: string[][];
  /** As `bridgeCandidates`, best first. */
  bridges: BridgeCandidate[];
  /** The single bridge worth offering: the best-ranked one that touches group
   *  0. `null` when none does - a bridge that misses the group the statement is
   *  rooted on adds a table the query still cannot reach, so there is no
   *  remedy to offer rather than a lesser one. */
  remedy: BridgeCandidate | null;
}

/** The first usable relationship joining these two entities, read from the
 *  anchor's side. `null` when the pair has no relationship at all. */
export function joinColumns(
  relationships: readonly Relationship[],
  anchorId: string,
  joinedId: string,
): { anchor: string[]; joined: string[] } | null {
  for (const { source, target } of relationships) {
    const forward = source.entity === anchorId && target.entity === joinedId;
    const backward = source.entity === joinedId && target.entity === anchorId;
    if (!forward && !backward) continue;

    const anchor = forward ? source.columns : target.columns;
    const joined = forward ? target.columns : source.columns;
    // The two ends pair positionally, so a mismatched or empty pair cannot
    // produce an ON clause. Skipping it leaves the table on the ordinary
    // disconnected path rather than emitting `ON undefined = undefined`.
    if (anchor.length > 0 && anchor.length === joined.length) return { anchor, joined };
  }
  return null;
}

/**
 * The picked ids partitioned into sets that can reach each other by joins
 * between picked tables.
 *
 * Order is part of the contract because the result is rendered: members follow
 * their position in `picked`, and groups follow their first member's, so the
 * group holding `picked[0]` - the one a statement rooted there can actually
 * emit - is always first.
 */
export function joinGroups(
  relationships: readonly Relationship[],
  picked: readonly string[],
): string[][] {
  const grouped = new Set<string>();
  const groups: string[][] = [];

  for (const start of picked) {
    if (grouped.has(start)) continue;

    const members = new Set([start]);
    grouped.add(start);
    let grew = true;
    while (grew) {
      grew = false;
      for (const candidate of picked) {
        if (grouped.has(candidate)) continue;
        if (!joinsAny(relationships, members, candidate)) continue;
        members.add(candidate);
        grouped.add(candidate);
        grew = true;
      }
    }

    groups.push(picked.filter((id) => members.has(id)));
  }

  return groups;
}

/** The whole picture for one selection: its join groups, the bridges ranked
 *  against those groups, and the one bridge that is actually a remedy. */
export function analyzeJoins(graph: SchemaGraph, picked: readonly string[]): JoinAnalysis {
  const groups = joinGroups(graph.relationships, picked);
  const bridges = rankBridges(graph, groups, picked);
  return { groups, bridges, remedy: bridges.find(touchesRootGroup) ?? null };
}

/**
 * Tables outside the selection that would connect two or more of its join
 * groups, best first.
 *
 * The ranking alone; prefer `analyzeJoins`, which hands back the groups these
 * candidates were ranked against and the one of them worth offering.
 *
 * An empty result is the common answer, not a failure: a selection can need two
 * hops, or have no bridge at all, and saying nothing beats guessing.
 */
export function bridgeCandidates(
  graph: SchemaGraph,
  picked: readonly string[],
): BridgeCandidate[] {
  return analyzeJoins(graph, picked).bridges;
}

/** Ranked by how many groups they would merge, then by whether they touch group
 *  0, then by id, so the list is stable between renders. */
function rankBridges(
  graph: SchemaGraph,
  groups: readonly string[][],
  picked: readonly string[],
): BridgeCandidate[] {
  if (groups.length < 2) return [];

  const isPicked = new Set(picked);
  return graph.entities
    .filter((entity) => !isPicked.has(entity.id))
    .map((entity) => ({
      entityId: entity.id,
      name: entity.name,
      connectsGroups: groups.flatMap((group, index) =>
        joinsAny(graph.relationships, group, entity.id) ? [index] : [],
      ),
    }))
    .filter((candidate) => candidate.connectsGroups.length > 1)
    .sort(byMostUseful);
}

function joinsAny(
  relationships: readonly Relationship[],
  members: Iterable<string>,
  candidate: string,
): boolean {
  for (const member of members) {
    if (joinColumns(relationships, member, candidate)) return true;
  }
  return false;
}

function touchesRootGroup(candidate: BridgeCandidate): boolean {
  return candidate.connectsGroups.includes(0);
}

function byMostUseful(a: BridgeCandidate, b: BridgeCandidate): number {
  if (a.connectsGroups.length !== b.connectsGroups.length) {
    return b.connectsGroups.length - a.connectsGroups.length;
  }
  return (
    Number(touchesRootGroup(b)) - Number(touchesRootGroup(a)) ||
    (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0)
  );
}
