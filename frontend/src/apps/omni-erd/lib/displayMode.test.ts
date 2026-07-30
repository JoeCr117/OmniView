import { describe, expect, it } from "vitest";

import {
  COLUMN_MODES,
  DEFAULT_VIEW_STATE,
  type ViewState,
  cycleNodeMode,
  effectiveMode,
  isKeyColumn,
  fromWire,
  nextMode,
  setDefaultMode,
  setNodeMode,
  toWire,
} from "./displayMode";
import type { Column } from "./types";

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

describe("effectiveMode", () => {
  it("falls back to the default mode", () => {
    expect(effectiveMode({ defaultMode: "keys", overrides: {} }, "a")).toBe("keys");
  });

  it("prefers a per-node override", () => {
    expect(effectiveMode({ defaultMode: "keys", overrides: { a: "all" } }, "a")).toBe("all");
  });
});

describe("isKeyColumn", () => {
  it("counts a primary key", () => {
    expect(isKeyColumn(column("id", { is_primary_key: true }), new Set())).toBe(true);
  });

  it("counts a foreign key", () => {
    expect(isKeyColumn(column("user_id", { is_foreign_key: true }), new Set())).toBe(true);
  });

  // The datavault case: no declared constraints anywhere, so the inferred
  // relationship columns are the only thing making the schema an ERD at all.
  it("counts a column that participates in a drawn relationship", () => {
    expect(isKeyColumn(column("datesk"), new Set(["datesk"]))).toBe(true);
  });

  it("rejects an ordinary column", () => {
    expect(isKeyColumn(column("amount"), new Set(["datesk"]))).toBe(false);
  });
});

describe("setDefaultMode", () => {
  it("clears every override, so the control cannot lie about what it did", () => {
    const state: ViewState = { defaultMode: "keys", overrides: { a: "none", b: "all" } };

    expect(setDefaultMode(state, "all")).toEqual({ defaultMode: "all", overrides: {} });
  });
});

describe("setNodeMode", () => {
  it("records an override that differs from the default mode", () => {
    const next = setNodeMode({ defaultMode: "keys", overrides: {} }, "a", "none");
    expect(next.overrides).toEqual({ a: "none" });
  });

  it("drops the override when it matches the default mode again", () => {
    // Otherwise a later change to the default would leave this node stranded behind an
    // override the user has no way of knowing is still there.
    const next = setNodeMode({ defaultMode: "keys", overrides: { a: "none" } }, "a", "keys");
    expect(next.overrides).toEqual({});
  });

  it("leaves other nodes alone", () => {
    const next = setNodeMode({ defaultMode: "keys", overrides: { b: "all" } }, "a", "none");
    expect(next.overrides).toEqual({ a: "none", b: "all" });
  });

  it("does not mutate the input", () => {
    const state: ViewState = { defaultMode: "keys", overrides: { a: "all" } };
    setNodeMode(state, "b", "none");
    expect(state.overrides).toEqual({ a: "all" });
  });
});

describe("cycleNodeMode", () => {
  it("walks all -> keys -> none -> all", () => {
    let state: ViewState = { defaultMode: "all", overrides: {} };
    const seen = [effectiveMode(state, "a")];

    for (let i = 0; i < 3; i += 1) {
      state = cycleNodeMode(state, "a");
      seen.push(effectiveMode(state, "a"));
    }

    expect(seen).toEqual(["all", "keys", "none", "all"]);
  });

  it("returns to the default mode after a full cycle, leaving no override behind", () => {
    let state: ViewState = { defaultMode: "keys", overrides: {} };
    for (let i = 0; i < COLUMN_MODES.length; i += 1) state = cycleNodeMode(state, "a");

    expect(state.overrides).toEqual({});
  });
});

describe("nextMode", () => {
  it("wraps around", () => {
    expect(nextMode("none")).toBe("all");
  });
});

// Note the snake_case keys throughout: this function's whole job is to read the
// *wire* shape, so a test written in the camelCase internal shape would pass
// while proving nothing.
describe("fromWire", () => {
  it("defaults to keys, the compact view", () => {
    expect(fromWire(undefined)).toEqual(DEFAULT_VIEW_STATE);
    expect(DEFAULT_VIEW_STATE.defaultMode).toBe("keys");
  });

  // view_state is a JSONField, so an old row or a hand-edited blob can hold
  // anything. Refusing to draw the diagram over a bad preference would be a far
  // worse failure than falling back.
  it.each([null, 42, "keys", [], {}, { default_mode: "sideways" }])(
    "falls back rather than throwing on %p",
    (raw) => {
      expect(fromWire(raw).defaultMode).toBe("keys");
    },
  );

  it("ignores the camelCase spelling, which is not what the wire carries", () => {
    expect(fromWire({ defaultMode: "all", overrides: {} }).defaultMode).toBe("keys");
  });

  it("keeps a valid default mode and valid overrides", () => {
    expect(fromWire({ default_mode: "all", overrides: { a: "none" } })).toEqual({
      defaultMode: "all",
      overrides: { a: "none" },
    });
  });

  it("drops invalid override values but keeps the good ones", () => {
    const state = fromWire({ default_mode: "all", overrides: { a: "none", b: "wat" } });
    expect(state.overrides).toEqual({ a: "none" });
  });

  it("drops overrides that merely restate the default mode", () => {
    const state = fromWire({ default_mode: "all", overrides: { a: "all", b: "none" } });
    expect(state.overrides).toEqual({ b: "none" });
  });

  it("survives a non-object overrides field", () => {
    expect(fromWire({ default_mode: "none", overrides: "nope" })).toEqual({
      defaultMode: "none",
      overrides: {},
    });
  });
});

describe("toWire", () => {
  it("round-trips through fromWire", () => {
    const state: ViewState = { defaultMode: "none", overrides: { a: "all" } };
    expect(fromWire(toWire(state))).toEqual(state);
  });
});
