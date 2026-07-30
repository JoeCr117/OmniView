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

/** Cache keys for `useResource`. Graph and layout are fetched separately because
 *  they change on completely different schedules: the graph on a rebuild, the
 *  layout every time someone drags a table. */
export const graphKey = (sourceId: string, namespace: string) =>
  `omni-erd:graph:${sourceId}:${namespace}`;
export const layoutKey = (sourceId: string, namespace: string) =>
  `omni-erd:layout:${sourceId}:${namespace}`;
export const SOURCES_KEY = "omni-erd:sources";
