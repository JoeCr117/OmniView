import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "./DataTable";

/**
 * Tabulator is loaded with a dynamic `import()` so its ~250KB stays out of the
 * initial chunk, and it then initializes asynchronously on top of that. Both
 * gaps are races, and the component's pending-data queue and cancellation guard
 * exist to survive them:
 *
 * - data can arrive before the chunk lands, and again before "tableBuilt" fires;
 *   calling setData in either window corrupts Tabulator's internal layout state.
 * - the component can unmount while the chunk is still in flight, which must not
 *   build a table into a detached node.
 *
 * None of that is observable through the rendered DOM - the component renders a
 * bare div - so these assert against a fake Tabulator. `mock.load()` is what
 * makes the chunk's arrival controllable: in "manual" mode the module promise
 * stays pending until the test releases it.
 */

const mock = vi.hoisted(() => {
  const instances: FakeTable[] = [];
  let mode: "immediate" | "manual" = "immediate";
  let release: (() => void) | null = null;

  class FakeTable {
    setData = vi.fn();
    destroy = vi.fn();
    /** One header element per column, so class syncing is observable. */
    readonly headerElements = new Map<string, HTMLElement>();
    private handlers: Record<string, (...args: unknown[]) => void> = {};

    constructor(
      readonly element: HTMLElement,
      readonly options: Record<string, unknown>,
    ) {
      instances.push(this);
    }

    on(event: string, callback: (...args: unknown[]) => void) {
      this.handlers[event] = callback;
    }

    /** Tabulator's column components, as `headerClassNames` walks them. */
    getColumns() {
      const fields = (this.options.columns as { field: string }[]) ?? [];
      return fields.map((column) => ({
        getField: () => column.field,
        getElement: () => {
          const existing = this.headerElements.get(column.field);
          if (existing) return existing;
          const created = document.createElement("div");
          this.headerElements.set(column.field, created);
          return created;
        },
      }));
    }

    /** Tabulator fires this once built; until then setData corrupts it. */
    fireBuilt() {
      this.handlers.tableBuilt?.();
    }

    /** Tabulator's rowClick, which hands over the event and a row component. */
    fireRowClick(rowData: object) {
      this.handlers.rowClick?.(new MouseEvent("click"), { getData: () => rowData });
    }

    /** Tabulator's headerClick, which hands over the event and a column. */
    fireHeaderClick(field: string, init: MouseEventInit = {}) {
      this.handlers.headerClick?.(new MouseEvent("click", init), { getField: () => field });
    }
  }

  return {
    instances,
    setMode: (next: "immediate" | "manual") => {
      mode = next;
    },
    releaseChunk: () => release?.(),
    load: () =>
      mode === "immediate"
        ? Promise.resolve({ TabulatorFull: FakeTable })
        : new Promise<{ TabulatorFull: typeof FakeTable }>((resolve) => {
            release = () => resolve({ TabulatorFull: FakeTable });
          }),
  };
});

vi.mock("tabulator-tables", () => mock.load());

const COLUMNS = [{ title: "Name", field: "name" }];

afterEach(() => {
  mock.instances.length = 0;
  mock.setMode("immediate");
});

describe("DataTable", () => {
  it("builds one table with the given columns and placeholder", async () => {
    render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} placeholder="Nothing here." />);

    await waitFor(() => expect(mock.instances).toHaveLength(1));
    expect(mock.instances[0].options).toMatchObject({
      columns: COLUMNS,
      layout: "fitColumns",
      placeholder: "Nothing here.",
    });
  });

  it("holds data back until tableBuilt, then applies it", async () => {
    render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} />);
    await waitFor(() => expect(mock.instances).toHaveLength(1));

    // The data effect ran before the chunk landed, so nothing may be pushed yet.
    expect(mock.instances[0].setData).not.toHaveBeenCalled();

    mock.instances[0].fireBuilt();

    expect(mock.instances[0].setData).toHaveBeenCalledWith([{ name: "a" }]);
  });

  it("pushes later data straight through once built", async () => {
    const view = render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} />);
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    mock.instances[0].fireBuilt();
    mock.instances[0].setData.mockClear();

    view.rerender(<DataTable data={[{ name: "b" }]} columns={COLUMNS} />);

    expect(mock.instances[0].setData).toHaveBeenCalledWith([{ name: "b" }]);
  });

  it("keeps only the newest data when it changes before the table is built", async () => {
    const view = render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} />);
    await waitFor(() => expect(mock.instances).toHaveLength(1));

    view.rerender(<DataTable data={[{ name: "b" }]} columns={COLUMNS} />);
    expect(mock.instances[0].setData).not.toHaveBeenCalled();

    mock.instances[0].fireBuilt();

    // The queue holds one slot: the latest data wins, and only once.
    expect(mock.instances[0].setData).toHaveBeenCalledTimes(1);
    expect(mock.instances[0].setData).toHaveBeenCalledWith([{ name: "b" }]);
  });

  it("does not build into a detached node when unmounted mid-load", async () => {
    mock.setMode("manual");
    const view = render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} />);

    view.unmount();
    mock.releaseChunk();
    await Promise.resolve();
    await Promise.resolve();

    expect(mock.instances).toHaveLength(0);
  });

  it("destroys the table on unmount", async () => {
    const view = render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} />);
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    mock.instances[0].fireBuilt();

    view.unmount();

    expect(mock.instances[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("survives destroy() throwing, which Tabulator does if it never finished building", async () => {
    const view = render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} />);
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    mock.instances[0].destroy.mockImplementation(() => {
      throw new Error("Table Not Initialized");
    });

    expect(() => view.unmount()).not.toThrow();
  });

  it("reports row clicks with the row's data", async () => {
    const onRowClick = vi.fn();
    render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} onRowClick={onRowClick} />);
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    mock.instances[0].fireBuilt();

    mock.instances[0].fireRowClick({ name: "a" });

    // The originating event comes with the row: modifier-clicks mean something
    // to some callers.
    expect(onRowClick).toHaveBeenCalledWith({ name: "a" }, expect.any(MouseEvent));
  });

  it("calls the newest row-click handler, not the one captured when the table was built", async () => {
    // The table is built once, so a handler closing over component state would
    // be frozen at its first value - the bug the ref indirection prevents.
    const stale = vi.fn();
    const fresh = vi.fn();
    const view = render(
      <DataTable data={[{ name: "a" }]} columns={COLUMNS} onRowClick={stale} />,
    );
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    mock.instances[0].fireBuilt();

    view.rerender(<DataTable data={[{ name: "a" }]} columns={COLUMNS} onRowClick={fresh} />);
    mock.instances[0].fireRowClick({ name: "a" });

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild when columns change identity, so sort and scroll survive", async () => {
    const view = render(<DataTable data={[{ name: "a" }]} columns={COLUMNS} />);
    await waitFor(() => expect(mock.instances).toHaveLength(1));

    view.rerender(<DataTable data={[{ name: "a" }]} columns={[{ title: "Name", field: "name" }]} />);

    expect(mock.instances).toHaveLength(1);
  });

  it("reports header clicks with the field and the originating event", async () => {
    const onHeaderClick = vi.fn();
    render(<DataTable data={[]} columns={COLUMNS} onHeaderClick={onHeaderClick} />);
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    mock.instances[0].fireBuilt();

    mock.instances[0].fireHeaderClick("name", { ctrlKey: true });

    // The event has to come with it: Tabulator spends the plain header click on
    // sorting, so a caller wanting a second meaning reads the modifier off this.
    const [field, event] = onHeaderClick.mock.calls[0] as [string, MouseEvent];
    expect(field).toBe("name");
    expect(event.ctrlKey).toBe(true);
  });

  describe("headerClassNames", () => {
    const TWO = [
      { title: "Name", field: "name" },
      { title: "Age", field: "age" },
    ];

    function headerClass(field: string) {
      return mock.instances[0].headerElements.get(field)?.className ?? "";
    }

    async function built(headerClassNames?: Record<string, string>) {
      const view = render(
        <DataTable data={[]} columns={TWO} headerClassNames={headerClassNames} />,
      );
      await waitFor(() => expect(mock.instances).toHaveLength(1));
      mock.instances[0].fireBuilt();
      return view;
    }

    it("marks the named column's header, and leaves the others alone", async () => {
      await built({ name: "picked" });
      expect(headerClass("name")).toBe("picked");
      expect(headerClass("age")).toBe("");
    });

    it("applies a class asked for before the table finished building", async () => {
      // tableBuilt does not re-render, so an effect alone would never see it -
      // the class would be requested and silently never land.
      render(<DataTable data={[]} columns={TWO} headerClassNames={{ name: "picked" }} />);
      await waitFor(() => expect(mock.instances).toHaveLength(1));
      expect(headerClass("name")).toBe("");

      mock.instances[0].fireBuilt();

      expect(headerClass("name")).toBe("picked");
    });

    it("unmarks it again, so deselecting actually deselects", async () => {
      const view = await built({ name: "picked" });
      view.rerender(<DataTable data={[]} columns={TWO} headerClassNames={{}} />);
      await waitFor(() => expect(headerClass("name")).toBe(""));
    });

    it("keeps classes Tabulator itself put on the header", async () => {
      const view = await built({ name: "picked" });
      mock.instances[0].headerElements.get("name")?.classList.add("tabulator-sortable");

      view.rerender(<DataTable data={[]} columns={TWO} headerClassNames={{}} />);

      await waitFor(() => expect(headerClass("name")).toBe("tabulator-sortable"));
    });

    it("never rebuilds the table to apply a class", async () => {
      const view = await built({});
      view.rerender(<DataTable data={[]} columns={TWO} headerClassNames={{ name: "picked" }} />);

      // The whole point of the prop: cssClass on a column definition would mean
      // remounting, and remounting costs the reader their sort and scroll.
      expect(mock.instances).toHaveLength(1);
    });
  });
});
