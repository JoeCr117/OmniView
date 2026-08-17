"use client";

import { useEffect, useRef } from "react";
import type { Options, TabulatorFull } from "tabulator-tables";

/**
 * The one data grid, for every app (Tabulator under the hood).
 *
 * Was `TabulatorTable` inside the ExpenseTracker package even though nothing
 * about it is ExpenseTracker-specific; it lives here so a second app can use a
 * grid without reaching into another app's code.
 *
 * Tabulator (~250KB) is loaded with a dynamic `import()` inside the mount
 * effect rather than a static import, so it stays out of the initial JS chunk:
 * the login page, the launcher and the Admin Portal's KPI screens - none of
 * which render a grid - don't download it. The type-only import above is erased
 * at build time and costs nothing.
 */
export function DataTable({
  data,
  columns,
  options,
  onRowClick,
  className,
  placeholder = "No rows to show.",
}: {
  data: object[];
  columns: Options["columns"];
  options?: Omit<Options, "data" | "columns">;
  /**
   * Classes for the element Tabulator builds into. A grid told to fill its
   * parent (`options.height: "100%"`) needs this to be a flex child with a
   * definite height, or Tabulator resolves 100% against nothing.
   */
  className?: string;
  /**
   * Row clicks, if the grid wants them. Tabulator 6 moved `rowClick` out of the
   * options object into its event system, so it cannot be passed through
   * `options`; it is registered once at build and dispatched through a ref, so
   * a handler closing over React state never goes stale. The originating event
   * comes with it, because modifier-clicks mean something to some callers.
   */
  onRowClick?: (rowData: object, event: UIEvent) => void;
  /** Shown by Tabulator when `data` is empty - every grid should say *something*. */
  placeholder?: string;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<TabulatorFull | null>(null);
  const rowClickRef = useRef(onRowClick);
  useEffect(() => {
    rowClickRef.current = onRowClick;
  });
  // Tabulator initializes asynchronously - calling setData before its
  // "tableBuilt" event fires corrupts internal layout state (Tabulator logs
  // "Table Not Initialized" and throws null-reference errors on interaction
  // afterward). Queue data changes that arrive before that event. The library
  // itself now also loads asynchronously (dynamic import), which the same
  // pending-data queue and the cancellation guard below both account for.
  const builtRef = useRef(false);
  const pendingDataRef = useRef<object[] | null>(null);

  useEffect(() => {
    if (!holderRef.current) return;
    builtRef.current = false;
    let cancelled = false;

    void import("tabulator-tables").then(({ TabulatorFull: Tabulator }) => {
      // The component unmounted (or re-ran) before the chunk arrived; don't
      // build into a detached node.
      if (cancelled || !holderRef.current) return;
      const table = new Tabulator(holderRef.current, {
        data,
        columns,
        layout: "fitColumns",
        placeholder,
        ...options,
      });
      table.on("tableBuilt", () => {
        builtRef.current = true;
        if (pendingDataRef.current) {
          table.setData(pendingDataRef.current);
          pendingDataRef.current = null;
        }
      });
      table.on("rowClick", (event, row) => rowClickRef.current?.(row.getData(), event));
      tableRef.current = table;
    });

    return () => {
      cancelled = true;
      builtRef.current = false;
      pendingDataRef.current = null;
      try {
        tableRef.current?.destroy();
      } catch {
        // Can throw if unmounted mid-initialization (before tableBuilt); safe to ignore.
      }
      tableRef.current = null;
    };
    // Built once, deliberately: Tabulator owns its DOM imperatively, so
    // rebuilding it whenever `columns`/`options` change identity would throw
    // away the user's sort, filter and scroll state. Data flows in via setData.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The table may not exist yet (chunk still loading) or may not be built
    // yet; both cases queue the data for the tableBuilt handler to apply.
    if (tableRef.current && builtRef.current) {
      tableRef.current.setData(data);
    } else {
      pendingDataRef.current = data;
    }
  }, [data]);

  return <div ref={holderRef} className={className} />;
}
