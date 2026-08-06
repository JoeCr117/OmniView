import { apiFetch } from "@/lib/http";

import { type ViewState, type ViewStateWire, fromWire, toWire } from "./displayMode";
import type { ErdSource, LayoutPositions, SchemaGraph } from "./types";

/** Positions and how tall the cards were when they were chosen. Fetched and
 *  saved together because restoring one without the other hands back an
 *  overlapping diagram. */
export interface StoredLayout {
  positions: LayoutPositions;
  view: ViewState;
}

const BASE = "/api/omni-erd";

export function fetchSources(): Promise<ErdSource[]> {
  return apiFetch<ErdSource[]>(`${BASE}/sources`);
}

export function fetchGraph(sourceId: string, namespace: string): Promise<SchemaGraph> {
  return apiFetch<SchemaGraph>(
    `${BASE}/sources/${encodeURIComponent(sourceId)}/graph?namespace=${encodeURIComponent(namespace)}`,
  );
}

export function fetchLayout(sourceId: string, namespace: string): Promise<StoredLayout> {
  return apiFetch<{ positions: LayoutPositions; view_state: ViewStateWire }>(
    `${BASE}/layouts/${encodeURIComponent(sourceId)}/${encodeURIComponent(namespace)}`,
  ).then((response) => ({
    positions: response.positions,
    // Never trusted as-is: `view_state` is a JSONField and could hold a shape
    // from an older build. fromWire falls back rather than letting a bad
    // preference stop the diagram rendering.
    view: fromWire(response.view_state),
  }));
}

export function saveLayout(
  sourceId: string,
  namespace: string,
  positions: LayoutPositions,
  view?: ViewState,
): Promise<void> {
  return apiFetch<void>(
    `${BASE}/layouts/${encodeURIComponent(sourceId)}/${encodeURIComponent(namespace)}`,
    {
      method: "PUT",
      // Omitted, not null, when unchanged - the backend reads absent as "leave
      // the stored one alone", so a plain drag cannot reset how the user had
      // collapsed their cards.
      body: JSON.stringify(view ? { positions, view_state: toWire(view) } : { positions }),
    },
  );
}

/** What an admin may assert about a pair of entities. Mirrors
 *  `schemas.py:OverrideAction`. */
export type OverrideAction = "join" | "suppress";

export type OverrideCardinality = "many_to_one" | "one_to_one";

/** 'active', or why the stored override no longer fits the catalog. Derived by
 *  the backend on every read, never stored. */
export type OverrideStatus = "active" | "unknown_entity" | "unknown_column" | "self_pair";

/** One stored override, as `schemas.py:RelationshipOverrideOut` emits it.
 *  Directed, not canonical: `source` is the referencing (many) side the admin
 *  chose. */
export interface RelationshipOverride {
  id: number;
  /** The `ovr:<id>` this override draws as in the graph, so a row here can be
   *  matched to the edge on the canvas. */
  edge_id: string;
  source_id: string;
  namespace: string;
  source_entity: string;
  source_columns: string[];
  target_entity: string;
  target_columns: string[];
  action: OverrideAction;
  cardinality: OverrideCardinality;
  note: string;
  status: OverrideStatus;
  /** '' when active; otherwise names what is missing, verbatim. */
  detail: string;
  updated_at: string;
  /** null when written with auth off, or when that user has since been deleted. */
  updated_by: string | null;
}

/** An admin's assertion as they make it, per `schemas.py:RelationshipOverrideIn`.
 *  The service orders the pair and validates the column pairing; nothing is
 *  normalised here. */
export interface RelationshipOverrideInput {
  source_id: string;
  /** Omitted means the source's first namespace, which the backend resolves. */
  namespace?: string;
  /** The referencing (many) side. */
  source_entity: string;
  /** Paired positionally with `target_columns`; both empty when suppressing. */
  source_columns: string[];
  /** The referenced (one) side. */
  target_entity: string;
  target_columns: string[];
  action: OverrideAction;
  cardinality: OverrideCardinality;
  note: string;
}

/** Which row a write landed on - all a write can honestly say, since `status`
 *  is only derivable against a live catalog. Refetch the list after writing. */
export interface OverrideId {
  id: number;
}

const overridesQuery = (sourceId: string, namespace?: string) =>
  `source_id=${encodeURIComponent(sourceId)}` +
  (namespace ? `&namespace=${encodeURIComponent(namespace)}` : "");

export function fetchOverrides(
  sourceId: string,
  namespace?: string,
): Promise<RelationshipOverride[]> {
  return apiFetch<RelationshipOverride[]>(
    `${BASE}/admin/overrides?${overridesQuery(sourceId, namespace)}`,
  );
}

export function createOverride(payload: RelationshipOverrideInput): Promise<OverrideId> {
  return apiFetch<OverrideId>(`${BASE}/admin/overrides`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOverride(
  overrideId: number,
  payload: RelationshipOverrideInput,
): Promise<OverrideId> {
  return apiFetch<OverrideId>(`${BASE}/admin/overrides/${encodeURIComponent(overrideId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Source and namespace ride in the query string, not a body - that is how
 *  `admin_api.remove_relationship_override` binds them. */
export function deleteOverride(
  overrideId: number,
  sourceId: string,
  namespace?: string,
): Promise<void> {
  return apiFetch<void>(
    `${BASE}/admin/overrides/${encodeURIComponent(overrideId)}?${overridesQuery(sourceId, namespace)}`,
    { method: "DELETE" },
  );
}

/** Cache keys for `useResource`. Graph and layout are fetched separately because
 *  they change on completely different schedules: the graph on a rebuild, the
 *  layout every time someone drags a table. */
export const graphKey = (sourceId: string, namespace: string) =>
  `omni-erd:graph:${sourceId}:${namespace}`;
export const layoutKey = (sourceId: string, namespace: string) =>
  `omni-erd:layout:${sourceId}:${namespace}`;
export const overridesKey = (sourceId: string, namespace: string) =>
  `omni-erd:overrides:${sourceId}:${namespace}`;
export const SOURCES_KEY = "omni-erd:sources";
