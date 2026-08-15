import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SchemaGraph } from "../lib/types";
import { SearchBar } from "./SearchBar";

/**
 * The bar collapses to an icon and expands in place. Filtering is ours, not
 * cmdk's, and the component's own docstring records the bug that made it so:
 * the first version capped the item list *before* filtering, so any column past
 * the 40th in catalog order was unreachable no matter what you typed. The
 * "reaches a column far down the catalog" case below is that regression.
 */

function column(name: string, position: number) {
  return {
    name,
    position,
    type: { raw: "integer", base: "integer" },
    nullable: false,
    default: null,
    comment: null,
    is_primary_key: false,
    is_foreign_key: false,
  };
}

function graphWith(columnNames: string[]): SchemaGraph {
  return {
    version: "1",
    source: {
      id: "pg-datavault",
      dialect: "postgres",
      label: "datavault",
      captured_at: "2026-01-01T00:00:00Z",
      container: {},
    },
    entities: [
      {
        id: "datavault.gold_DimDate",
        namespace: "datavault",
        name: "gold_DimDate",
        kind: "table",
        comment: null,
        columns: columnNames.map((name, i) => column(name, i + 1)),
        primary_key: null,
        unique: [],
      },
    ],
    relationships: [],
  } as unknown as SchemaGraph;
}

const SIMPLE = graphWith(["datesk", "calendardate"]);

describe("collapsed", () => {
  it("shows only a labelled toggle", () => {
    render(<SearchBar graph={SIMPLE} onPick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Find a table or column" })).toBeInTheDocument();
    expect(screen.queryByTestId("erd-search")).not.toBeInTheDocument();
  });

  it("expands to a field when clicked", async () => {
    render(<SearchBar graph={SIMPLE} onPick={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Find a table or column" }));

    expect(screen.getByTestId("erd-search")).toBeInTheDocument();
  });
});

describe("expanded", () => {
  async function expand() {
    const onPick = vi.fn();
    render(<SearchBar graph={SIMPLE} onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "Find a table or column" }));
    return { onPick, input: screen.getByTestId("erd-search") };
  }

  it("shows no result list until something is typed", async () => {
    await expand();

    expect(screen.queryByText("gold_DimDate")).not.toBeInTheDocument();
  });

  it("finds a table by name", async () => {
    const { input } = await expand();

    await userEvent.type(input, "dimdate");

    expect(screen.getByText("gold_DimDate")).toBeInTheDocument();
  });

  it("finds a column by name", async () => {
    const { input } = await expand();

    await userEvent.type(input, "calendardate");

    expect(screen.getByText("calendardate")).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    const { input } = await expand();

    await userEvent.type(input, "zzzznope");

    expect(screen.getByText("Nothing matches that.")).toBeInTheDocument();
  });

  it("collapses on Escape", async () => {
    const { input } = await expand();

    await userEvent.type(input, "{Escape}");

    expect(screen.queryByTestId("erd-search")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find a table or column" })).toBeInTheDocument();
  });

  it("hands the picked entry back and closes, so the diagram is not covered", async () => {
    const { onPick, input } = await expand();

    await userEvent.type(input, "dimdate");
    await userEvent.click(screen.getByText("gold_DimDate"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ kind: "table", entityName: "gold_DimDate" });
    expect(screen.queryByTestId("erd-search")).not.toBeInTheDocument();
  });
});

describe("filtering happens before any cap", () => {
  it("reaches a column far down the catalog", async () => {
    // The regression the docstring records: with the cap applied first, only the
    // first 40 columns were ever searchable and this returned nothing.
    const names = Array.from({ length: 60 }, (_, i) => `col_${i}`);
    names[55] = "needle_column";
    render(<SearchBar graph={graphWith(names)} onPick={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Find a table or column" }));
    await userEvent.type(screen.getByTestId("erd-search"), "needle");

    expect(screen.getByText("needle_column")).toBeInTheDocument();
  });
});
