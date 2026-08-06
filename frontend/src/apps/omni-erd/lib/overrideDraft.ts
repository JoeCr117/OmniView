/**
 * The override form's state, and every rule that decides whether it may be
 * saved.
 *
 * React-free on purpose: each rule here mirrors one the service enforces, and a
 * mirror that can only be exercised through a mounted form is a mirror nobody
 * checks. `services._require_valid_ends` is the authority; this is the fast
 * feedback.
 */

import type {
  OverrideCardinality,
  RelationshipOverride,
  RelationshipOverrideInput,
} from "./api";
import { relationName } from "./overrideText";

/** One equality in the join condition, in the order the two entity pickers sit. */
export interface ColumnPair {
  a: string;
  b: string;
}

export const emptyPair = (): ColumnPair => ({ a: "", b: "" });

/** The form's own state: the two ends as the admin sees them, plus which one
 *  references the other. `draftPayload` turns that into the directed
 *  source/target the wire wants. */
export interface OverrideDraft {
  /** null while creating; the row id while editing one. */
  id: number | null;
  entityA: string;
  entityB: string;
  pairs: ColumnPair[];
  /** True when the first table holds the foreign key. */
  aReferencesB: boolean;
  suppress: boolean;
  note: string;
  /** Round-tripped, not edited. The form offers no control for it, and an edit
   *  must not silently turn a one_to_one override into a many_to_one one. */
  cardinality: OverrideCardinality;
}

export const newDraft = (): OverrideDraft => ({
  id: null,
  entityA: "",
  entityB: "",
  pairs: [emptyPair()],
  aReferencesB: true,
  suppress: false,
  note: "",
  cardinality: "many_to_one",
});

/** An existing row as the form holds it. The stored `source` end is the
 *  referencing side, so it lands in slot A and the direction reads forwards. */
export function draftFrom(override: RelationshipOverride): OverrideDraft {
  const pairs = override.source_columns.map((column, index) => ({
    a: column,
    b: override.target_columns[index] ?? "",
  }));
  return {
    id: override.id,
    entityA: override.source_entity,
    entityB: override.target_entity,
    pairs: pairs.length > 0 ? pairs : [emptyPair()],
    aReferencesB: true,
    suppress: override.action === "suppress",
    note: override.note,
    cardinality: override.cardinality,
  };
}

function orderedEnds(draft: OverrideDraft) {
  const a = { entity: draft.entityA, columns: draft.pairs.map((pair) => pair.a) };
  const b = { entity: draft.entityB, columns: draft.pairs.map((pair) => pair.b) };
  return draft.aReferencesB ? { source: a, target: b } : { source: b, target: a };
}

export function draftPayload(
  draft: OverrideDraft,
  sourceId: string,
  namespace: string,
): RelationshipOverrideInput {
  const { source, target } = orderedEnds(draft);
  const joining = !draft.suppress;
  return {
    source_id: sourceId,
    namespace,
    source_entity: source.entity,
    source_columns: joining ? source.columns : [],
    target_entity: target.entity,
    target_columns: joining ? target.columns : [],
    action: joining ? "join" : "suppress",
    cardinality: draft.cardinality,
    note: draft.note.trim(),
  };
}

const coversSamePair = (row: RelationshipOverride, draft: OverrideDraft) =>
  (row.source_entity === draft.entityA && row.target_entity === draft.entityB) ||
  (row.source_entity === draft.entityB && row.target_entity === draft.entityA);

/** One pair's identity for comparison. Case-insensitive, the way `infer.py`
 *  resolves columns - `datavault` holds CamelCase relations with lowercase
 *  columns - and JSON so that a column name containing the separator cannot
 *  make two different pairs collide. */
const pairKey = (pair: ColumnPair) =>
  JSON.stringify([pair.a.toLowerCase(), pair.b.toLowerCase()]);

/** What still stops this draft from being a legal assertion, or null. Each case
 *  mirrors a rule `services._require_valid_ends` (or `update_override`)
 *  enforces. */
export function draftProblem(
  draft: OverrideDraft,
  existing: readonly RelationshipOverride[],
): string | null {
  if (draft.entityA === "" || draft.entityB === "") return "Pick both tables.";
  if (draft.entityA === draft.entityB) return "An override joins two different tables.";
  if (existing.some((row) => row.id !== draft.id && coversSamePair(row, draft))) {
    return `Another override already covers ${relationName(draft.entityA)} and ${relationName(
      draft.entityB,
    )} — edit or delete that one instead.`;
  }
  if (draft.suppress) return null;
  if (draft.pairs.length === 0) return "A join needs at least one column pair.";
  if (draft.pairs.some((pair) => pair.a === "" || pair.b === "")) {
    return "Every column pair needs a column on both sides.";
  }
  const keys = draft.pairs.map(pairKey);
  if (new Set(keys).size !== keys.length) return "This column pair is already listed.";
  return null;
}
