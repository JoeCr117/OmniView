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

    /** Tabulator fires this once built; until then setData corrupts it. */
    fireBuilt() {
      this.handlers.tableBuilt?.();
    }

    /** Tabulator's rowClick, which hands over the event and a row component. */
    fireRowClick(rowData: object) {
      this.handlers.rowClick?.(new MouseEvent("click"), { getData: () => rowData });
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
});
