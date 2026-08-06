import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { __clearResourceCache } from "@/lib/useResource";

import type { RelationshipOverride } from "../lib/api";
import { OverridesView } from "./OverridesView";

const graph = {
  version: "1",
  source: { id: "omniview", dialect: "postgres", label: "OmniView", captured_at: "", container: {} },
  entities: [
    {
      id: "datavault.Gold_Foo",
      namespace: "datavault",
      name: "Gold_Foo",
      kind: "table",
      comment: null,
      columns: [
        {
          name: "accountsk",
          position: 1,
          type: { raw: "int", base: "integer" },
          nullable: false,
          default: null,
          comment: null,
          is_primary_key: true,
          is_foreign_key: false,
        },
      ],
      primary_key: null,
      unique: [],
    },
    {
      id: "datavault.Gold_Bar",
      namespace: "datavault",
      name: "Gold_Bar",
      kind: "table",
      comment: null,
      columns: [
        {
          name: "accountsk",
          position: 1,
          type: { raw: "int", base: "integer" },
          nullable: false,
          default: null,
          comment: null,
          is_primary_key: false,
          is_foreign_key: true,
        },
      ],
      primary_key: null,
      unique: [],
    },
  ],
  relationships: [],
};

const stale: RelationshipOverride = {
  id: 7,
  edge_id: "ovr:7",
  source_id: "omniview",
  namespace: "datavault",
  source_entity: "datavault.Gold_Gone",
  source_columns: ["accountsk"],
  target_entity: "datavault.Gold_Foo",
  target_columns: ["accountsk"],
  action: "join",
  cardinality: "many_to_one",
  note: "hand-asserted",
  status: "unknown_entity",
  detail: "datavault.Gold_Gone is not in this diagram",
  updated_at: "2026-07-31T10:00:00Z",
  updated_by: "joe",
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { is_staff: true }, config: { auth_required: true }, loading: false }),
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    fetchSources: vi.fn(async () => [
      {
        id: "omniview",
        label: "OmniView",
        dialect: "postgres",
        description: "",
        namespaces: ["datavault"],
      },
    ]),
    fetchGraph: vi.fn(async () => graph),
    fetchOverrides: vi.fn(async () => [stale]),
  };
});

/**
 * The page renders the button before it can be used: the source list, the graph
 * and the overrides load one after another, and `New override` stays disabled
 * until the graph lands because the pickers have nothing to offer without it.
 * Clicking the moment it exists is a no-op, so wait for it to be usable - which
 * is all an admin can do too.
 */
async function openEditor(user: UserEvent) {
  const open = await screen.findByRole("button", { name: "New override" });
  await waitFor(() => expect(open).toBeEnabled());
  await user.click(open);
  return screen.findByTestId("override-editor");
}

/** Pick from the popover list, not from anything merely bearing that text: the
 *  overrides row below prints the same table names, so only the `option` role
 *  identifies the choice being made. */
async function choose(user: UserEvent, combobox: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: combobox }));
  await user.click(await screen.findByRole("option", { name: option }));
}

async function pickBothTables(user: UserEvent) {
  await choose(user, "First table", "Gold_Foo");
  await choose(user, "Second table", "Gold_Bar");
}

describe("OverridesView", () => {
  beforeEach(() => __clearResourceCache());

  it("renders the list with the backend's stale detail verbatim", async () => {
    render(<OverridesView />);
    expect(await screen.findByText("Missing table")).toBeInTheDocument();
    expect(
      screen.getByText("datavault.Gold_Gone is not in this diagram"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Gold_Gone\.accountsk = Gold_Foo\.accountsk/)).toBeInTheDocument();
  });

  it("opens the editor and gates Save behind the missing picks", async () => {
    const user = userEvent.setup();
    render(<OverridesView />);
    await openEditor(user);

    const save = screen.getByRole("button", { name: "Save override" });
    expect(save).toBeDisabled();
    expect(screen.getByText("Pick both tables.")).toBeInTheDocument();

    await pickBothTables(user);

    await waitFor(() =>
      expect(screen.getByText("Every column pair needs a column on both sides.")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Gold_Foo references Gold_Bar" }),
    ).toHaveAttribute("aria-pressed", "true");

    await choose(user, "Gold_Foo column", "accountsk");
    await choose(user, "Gold_Bar column", "accountsk");

    await waitFor(() => expect(screen.getByRole("button", { name: "Save override" })).toBeEnabled());
  });

  it("suppress hides the column pairs", async () => {
    const user = userEvent.setup();
    render(<OverridesView />);
    await openEditor(user);
    await pickBothTables(user);

    expect(screen.getByText("Join on")).toBeInTheDocument();
    await user.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.queryByText("Join on")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save override" })).toBeEnabled();
  });
});
