import { ReactFlowProvider } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Column, Entity, Relationship, SchemaGraph } from "../lib/types";
import { SelectionFlyout } from "./SelectionFlyout";

function column(name: string, overrides: Partial<Column> = {}): Column {
  return {
    name,
    position: 1,
    type: { raw: "integer", base: "integer" },
    nullable: true,
    default: null,
    comment: null,
    is_primary_key: false,
    is_foreign_key: false,
    ...overrides,
  };
}

function entity(name: string, columns: Column[], overrides: Partial<Entity> = {}): Entity {
  return {
    id: `app.${name}`,
    namespace: "app",
    name,
    kind: "table",
    comment: null,
    columns,
    primary_key: null,
    unique: [],
    ...overrides,
  };
}

function relationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: "rel-1",
    source: { entity: "app.a", columns: ["a_id"] },
    target: { entity: "app.b", columns: ["id"] },
    cardinality: "many_to_one",
    origin: "declared",
    confidence: 1,
    note: null,
    ...overrides,
  };
}

function graph(entities: Entity[], relationships: Relationship[] = []): SchemaGraph {
  return {
    version: "1",
    source: {
      id: "pg-omniview",
      dialect: "postgres",
      label: "OmniView",
      captured_at: "2026-07-20T00:00:00Z",
      container: { namespace: "app" },
    },
    entities,
    relationships,
  };
}

// Same topology as the headline regression in joinGraph.test.ts and
// buildSelect.test.ts: auth_group_permissions - the bridge that would let a
// SELECT rooted at auth_group reach auth_permission and django_content_type -
// is left unpicked. auth_permission and django_content_type still join each
// other directly, with an edge the canvas draws, and rawdata_rawfile is
// genuinely isolated.
const AUTH_GROUP = entity("auth_group", [column("id")]);
const AUTH_GROUP_PERMISSIONS = entity("auth_group_permissions", [
  column("group_id"),
  column("permission_id"),
]);
const AUTH_PERMISSION = entity("auth_permission", [column("id"), column("content_type_id")]);
const DJANGO_CONTENT_TYPE = entity("django_content_type", [column("id")]);
const RAWDATA_RAWFILE = entity("rawdata_rawfile", [column("id")]);

const GROUP_TO_BRIDGE = relationship({
  id: "rel-group-bridge",
  source: { entity: "app.auth_group_permissions", columns: ["group_id"] },
  target: { entity: "app.auth_group", columns: ["id"] },
});
const PERMISSION_TO_BRIDGE = relationship({
  id: "rel-permission-bridge",
  source: { entity: "app.auth_group_permissions", columns: ["permission_id"] },
  target: { entity: "app.auth_permission", columns: ["id"] },
});
const PERMISSION_TO_CONTENT_TYPE = relationship({
  id: "rel-permission-contenttype",
  source: { entity: "app.auth_permission", columns: ["content_type_id"] },
  target: { entity: "app.django_content_type", columns: ["id"] },
});

const AUTH_GRAPH = graph(
  [AUTH_GROUP, AUTH_GROUP_PERMISSIONS, AUTH_PERMISSION, DJANGO_CONTENT_TYPE, RAWDATA_RAWFILE],
  [GROUP_TO_BRIDGE, PERMISSION_TO_BRIDGE, PERMISSION_TO_CONTENT_TYPE],
);

const AUTH_PICKS = ["app.auth_group", "app.auth_permission", "app.django_content_type", "app.rawdata_rawfile"];

function renderFlyout(overrides: Partial<Parameters<typeof SelectionFlyout>[0]> = {}) {
  const props = {
    graph: AUTH_GRAPH,
    selectedIds: AUTH_PICKS,
    onClose: vi.fn(),
    onRemove: vi.fn(),
    onSelect: vi.fn(),
    onAddBridge: vi.fn(),
    ...overrides,
  };
  render(
    <ReactFlowProvider>
      <SelectionFlyout {...props} />
    </ReactFlowProvider>,
  );
  return props;
}

function rowFor(entityName: string) {
  return screen.getByText(entityName).closest("li")!;
}

describe("SelectionFlyout", () => {
  it("does not label a genuinely joined pair 'not joined', while a truly isolated pick still is", () => {
    // This is the assertion that would have caught the original bug: the old
    // chain-from-first-pick behaviour labelled auth_permission and
    // django_content_type "not joined" because neither is reachable from
    // auth_group without the unpicked bridge, even though the canvas draws a
    // real edge between them.
    renderFlyout();

    expect(rowFor("auth_permission")).not.toHaveTextContent("not joined");
    expect(rowFor("django_content_type")).not.toHaveTextContent("not joined");
    expect(rowFor("rawdata_rawfile")).toHaveTextContent("not joined");
  });

  it("shows the suggested bridge control and adds it on click", async () => {
    const user = userEvent.setup();
    const props = renderFlyout();

    const addBridge = screen.getByRole("button", { name: "Add auth_group_permissions" });
    await user.click(addBridge);

    expect(props.onAddBridge).toHaveBeenCalledWith("app.auth_group_permissions");
  });

  it("renders no bridge control when there is nothing to suggest", () => {
    renderFlyout({
      graph: graph([AUTH_GROUP], []),
      selectedIds: ["app.auth_group"],
    });

    expect(screen.queryByRole("button", { name: /^Add /i })).not.toBeInTheDocument();
  });

  it("marks the copy control aria-disabled with an explanatory title when there is nothing runnable", () => {
    renderFlyout({
      graph: graph([AUTH_GROUP, RAWDATA_RAWFILE], []),
      selectedIds: ["app.gone"],
    });

    const copy = screen.getByRole("button", { name: "Copy query" });
    expect(copy).toHaveAttribute("aria-disabled", "true");
    expect(copy).toHaveAttribute("title", "No joinable query for this selection");
    expect(copy).not.toBeDisabled();
  });

  it("leaves the copy control enabled with no title when there is a runnable query", () => {
    renderFlyout({
      graph: graph([AUTH_GROUP], []),
      selectedIds: ["app.auth_group"],
    });

    const copy = screen.getByRole("button", { name: "Copy query" });
    expect(copy).toHaveAttribute("aria-disabled", "false");
    expect(copy).not.toHaveAttribute("title");
  });
});
