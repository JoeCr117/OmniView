"use client";

import { useCallback, useEffect, useState } from "react";

import { ErrorState, Loading } from "@/components/common/AsyncState";
import { useResource } from "@/lib/useResource";

import {
  SOURCES_KEY,
  fetchGraph,
  fetchLayout,
  fetchSources,
  graphKey,
  layoutKey,
  saveLayout,
} from "../lib/api";
import { DEFAULT_VIEW_STATE, type ViewState } from "../lib/displayMode";
import type { LayoutPositions } from "../lib/types";
import { LazyErdCanvas } from "./LazyErdCanvas";
import { SourcePicker, type SourceSelection } from "./SourcePicker";

/**
 * The Diagram tab: pick a schema, draw it, remember where you put things.
 *
 * Graph and layout are separate resources because they change on completely
 * different schedules - the graph when someone rebuilds the warehouse, the
 * layout every time a table is dragged. Sharing a key would mean a drag
 * invalidating the schema read.
 */
export function DiagramView() {
  const sources = useResource(SOURCES_KEY, fetchSources);
  const [selected, setSelected] = useState<SourceSelection | null>(null);

  // Land on the first selectable source rather than an empty canvas. Runs once
  // sources arrive; the guard keeps a later refetch from stealing the user's
  // choice back.
  useEffect(() => {
    if (selected || !sources.data) return;
    const first = sources.data.find((source) => source.namespaces.length > 0);
    if (first) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting the default selection once the source list lands; it isn't knowable during render.
      setSelected({ sourceId: first.id, namespace: first.namespaces[0] });
    }
  }, [sources.data, selected]);

  const graph = useResource(
    selected ? graphKey(selected.sourceId, selected.namespace) : null,
    useCallback(
      () => fetchGraph(selected!.sourceId, selected!.namespace),
      [selected],
    ),
  );
  const layout = useResource(
    selected ? layoutKey(selected.sourceId, selected.namespace) : null,
    useCallback(
      () => fetchLayout(selected!.sourceId, selected!.namespace),
      [selected],
    ),
  );

  const persist = useCallback(
    (positions: LayoutPositions, view?: ViewState) => {
      if (!selected) return;
      // Fire-and-forget: a failed layout save must never interrupt the diagram.
      // The positions are still on the canvas either way; only the memory of
      // them is lost, and the next drag tries again.
      void saveLayout(selected.sourceId, selected.namespace, positions, view).catch(() => {});
    },
    [selected],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {sources.data && (
        <SourcePicker sources={sources.data} selected={selected} onSelect={setSelected} />
      )}

      <div className="relative min-h-0 flex-1">
        {(sources.status === "loading" || graph.status === "loading") && (
          <Loading label="Reading the catalog…" />
        )}

        {sources.status === "error" && (
          <ErrorState message="Could not load the source list." onRetry={sources.refetch} />
        )}

        {graph.status === "error" && (
          <ErrorState
            message={
              // A 503 here means the source is real but unreadable (an
              // unconfigured catalog), which is worth saying plainly rather
              // than reporting as a failure.
              (graph.error as { message?: string })?.message ??
              "Could not read that schema."
            }
            onRetry={graph.refetch}
          />
        )}

        {graph.data && graph.data.entities.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            That schema holds no tables or views.
          </div>
        )}

        {/* Held back until the layout call has settled, not merely until the
            graph has. The canvas seeds its column-display state from
            `savedView` once, at mount, so mounting before that has arrived
            would open every card in the default mode and then never correct
            itself. A failed layout fetch still renders - `layout.data` is
            undefined and the defaults apply, which is the honest outcome. */}
        {graph.data && graph.data.entities.length > 0 && layout.status !== "loading" && (
          <LazyErdCanvas
            // Remount on a source switch: React Flow keeps node state
            // internally, and a fresh store is cheaper to reason about than
            // reconciling one schema's nodes into another's.
            key={`${selected?.sourceId}:${selected?.namespace}`}
            graph={graph.data}
            savedPositions={layout.data?.positions ?? {}}
            savedView={layout.data?.view ?? DEFAULT_VIEW_STATE}
            onPersist={persist}
          />
        )}
      </div>
    </div>
  );
}
