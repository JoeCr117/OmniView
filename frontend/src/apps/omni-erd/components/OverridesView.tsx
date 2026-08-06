"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ErrorState, Loading } from "@/components/common/AsyncState";
import { RefreshBar } from "@/components/common/progress";
import { TableSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { invalidateResource, useResource } from "@/lib/useResource";
import { serverMessage } from "@/lib/serverMessage";

import {
  SOURCES_KEY,
  type RelationshipOverride,
  createOverride,
  deleteOverride,
  fetchGraph,
  fetchOverrides,
  fetchSources,
  graphKey,
  overridesKey,
  updateOverride,
} from "../lib/api";
import { type OverrideDraft, draftFrom, draftPayload, newDraft } from "../lib/overrideDraft";
import { OverridesEditor } from "./OverridesEditor";
import { OverridesTable } from "./OverridesTable";
import { SourcePicker, type SourceSelection } from "./SourcePicker";

/**
 * The Relationships tab: every override standing against one diagram, and the
 * form that writes them.
 *
 * The graph is read under the *same* cache key the Diagram tab uses, so the
 * table and column pickers offer exactly the names that diagram draws, and a
 * write invalidating that key repaints the canvas rather than leaving it on a
 * stale graph.
 *
 * This page owns its scrolling. The app layout hands its child a definite
 * height and does not scroll - correct for a canvas that pans, and it would
 * clip a list of any length.
 */

/** Honest about propagation: `services.invalidate_graph` clears Django's
 *  LocMemCache, which is per process, so under gunicorn the other workers keep
 *  serving the previous graph until the 60s TTL runs out. */
const SAVED_NOTICE =
  "Saved. Diagrams already open elsewhere can take up to a minute to pick this up — " +
  "the graph is cached per server worker.";

export function OverridesView() {
  const sources = useResource(SOURCES_KEY, fetchSources);
  const [selected, setSelected] = useState<SourceSelection | null>(null);

  const [draft, setDraft] = useState<OverrideDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Land on the first selectable source, exactly as the Diagram tab does, so
  // both tabs agree on what "the current diagram" means.
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
    useCallback(() => fetchGraph(selected!.sourceId, selected!.namespace), [selected]),
  );
  const overrides = useResource(
    selected ? overridesKey(selected.sourceId, selected.namespace) : null,
    useCallback(() => fetchOverrides(selected!.sourceId, selected!.namespace), [selected]),
  );

  const rows = overrides.data ?? [];
  const refetchOverrides = overrides.refetch;

  const selectSource = (selection: SourceSelection) => {
    setSelected(selection);
    setDraft(null);
    setNotice(null);
    setListError(null);
  };

  const openDraft = (next: OverrideDraft) => {
    setDraft(next);
    setFormError(null);
    setNotice(null);
    setListError(null);
  };

  /** The graph the Diagram tab is holding no longer matches the stored
   *  overrides, and neither does this list. */
  const afterWrite = useCallback(() => {
    if (!selected) return;
    invalidateResource(graphKey(selected.sourceId, selected.namespace));
    refetchOverrides();
    setNotice(SAVED_NOTICE);
  }, [selected, refetchOverrides]);

  const save = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    setFormError(null);
    const payload = draftPayload(draft, selected.sourceId, selected.namespace);
    try {
      await (draft.id === null ? createOverride(payload) : updateOverride(draft.id, payload));
      setDraft(null);
      afterWrite();
    } catch (error) {
      setFormError(serverMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (override: RelationshipOverride) => {
    if (!selected) return;
    setDeletingId(override.id);
    setListError(null);
    try {
      await deleteOverride(override.id, selected.sourceId, selected.namespace);
      // The row being edited is the row that just stopped existing; leaving the
      // form open would offer a Save that can only 404.
      if (draft?.id === override.id) setDraft(null);
      afterWrite();
    } catch (error) {
      setListError(serverMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {sources.data && (
        <SourcePicker sources={sources.data} selected={selected} onSelect={selectSource} />
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Relationships</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Correct what the catalog cannot say. An override outranks a declared
                constraint and anything inferred from column naming, and applies to
                everyone who opens this diagram.
              </p>
            </div>
            <Button
              type="button"
              disabled={!graph.data || draft !== null}
              onClick={() => openDraft(newDraft())}
            >
              <Plus />
              New override
            </Button>
          </header>

          {sources.status === "error" && (
            <ErrorState message="Could not load the source list." onRetry={sources.refetch} />
          )}

          {graph.status === "error" && (
            <ErrorState
              // A 503 means the source is real but unreadable. The list is
              // derived against that same catalog, so it fails with it.
              message={serverMessage(graph.error)}
              onRetry={graph.refetch}
            />
          )}

          {draft !== null && graph.data && (
            <OverridesEditor
              draft={draft}
              entities={graph.data.entities}
              existing={rows}
              serverError={formError}
              saving={saving}
              onChange={setDraft}
              onSave={() => void save()}
              onCancel={() => setDraft(null)}
            />
          )}

          <div
            role="status"
            className={cn(
              "min-h-11 rounded-lg border px-4 py-2.5 text-sm transition-colors",
              notice !== null
                ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                : "border-transparent",
            )}
          >
            {notice}
          </div>

          {listError !== null && (
            <p role="alert" className="text-sm text-destructive">
              Delete failed: {listError}
            </p>
          )}

          <RefreshBar active={overrides.isValidating && overrides.data !== undefined} />

          {sources.status === "loading" && <Loading label="Reading the catalog…" />}

          {overrides.status === "loading" && sources.status !== "loading" && (
            <TableSkeleton rows={4} />
          )}

          {overrides.status === "error" && (
            <ErrorState message={serverMessage(overrides.error)} onRetry={refetchOverrides} />
          )}

          {overrides.data && (
            <OverridesTable
              overrides={rows}
              deletingId={deletingId}
              onEdit={(override) => openDraft(draftFrom(override))}
              onDelete={(override) => void remove(override)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
