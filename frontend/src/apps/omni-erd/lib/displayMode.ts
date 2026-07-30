import type { Column } from "./types";

/**
 * How much of a table a card shows.
 *
 * One default setting plus per-node overrides, kept apart from React Flow's node
 * state so it can be persisted, unit-tested and reasoned about without mounting
 * a canvas.
 *
 * `defaultMode` rather than `global`: `global` is a Python keyword, and this
 * shape crosses the wire to `ErdLayout.view_state`. Matching names on both sides
 * beats aliasing - django-ninja's alias support needs a model config override,
 * and `class Config(Schema.Config)` does not exist under Pydantic v2.
 */

export type ColumnMode = "all" | "keys" | "none";

/** Widest to narrowest. The per-node toggle cycles in this order. */
export const COLUMN_MODES = ["all", "keys", "none"] as const;

export interface ViewState {
  defaultMode: ColumnMode;
  /** Entity id -> mode. Only holds entries that differ from `defaultMode`. */
  overrides: Record<string, ColumnMode>;
}

/**
 * Why `keys` and not `all`.
 *
 * `datavault`'s widest relations carry 20+ columns and the schema is a star, so
 * opening on every column reproduces exactly the several-thousand-pixel column
 * that the old `MAX_VISIBLE_COLUMNS` cap existed to prevent. Keys mode is the
 * compact default that cap was approximating, except it collapses on *meaning*
 * (what participates in a relationship) rather than on an arbitrary count.
 *
 * `all` is one click away and, once chosen, persists.
 */
export const DEFAULT_VIEW_STATE: ViewState = { defaultMode: "keys", overrides: {} };

export function isColumnMode(value: unknown): value is ColumnMode {
  return typeof value === "string" && (COLUMN_MODES as readonly string[]).includes(value);
}

export function effectiveMode(state: ViewState, entityId: string): ColumnMode {
  return state.overrides[entityId] ?? state.defaultMode;
}

/**
 * Whether a column is a "key" for display purposes.
 *
 * **Participating in a relationship counts.** This is not a nicety - it is what
 * keeps the feature from being useless on the schema it matters most for.
 * `datavault` declares no primary keys at all (dbt builds via CTAS, which
 * carries no constraints), so a literal reading of "hide non-key columns" would
 * empty all 22 cards and detach all 17 inferred edges. The `*SK` columns those
 * edges hang off are precisely what an ERD of that schema is *about*.
 */
export function isKeyColumn(column: Column, connected: ReadonlySet<string>): boolean {
  return column.is_primary_key || column.is_foreign_key || connected.has(column.name);
}

/**
 * Set the default mode, clearing every override.
 *
 * Clearing is deliberate. If a card left on "none" stayed collapsed after the
 * user picked "All columns", the control would be lying about what it does, and
 * the only fix would be hunting down each overridden card by hand.
 */
export function setDefaultMode(state: ViewState, mode: ColumnMode): ViewState {
  return { defaultMode: mode, overrides: {} };
}

export function setNodeMode(state: ViewState, entityId: string, mode: ColumnMode): ViewState {
  const overrides = { ...state.overrides };
  if (mode === state.defaultMode) {
    // Back in step with the default, so stop recording an exception - otherwise
    // a later change to the default would leave this node stranded.
    delete overrides[entityId];
  } else {
    overrides[entityId] = mode;
  }
  return { defaultMode: state.defaultMode, overrides };
}

export function nextMode(mode: ColumnMode): ColumnMode {
  return COLUMN_MODES[(COLUMN_MODES.indexOf(mode) + 1) % COLUMN_MODES.length];
}

export function cycleNodeMode(state: ViewState, entityId: string): ViewState {
  return setNodeMode(state, entityId, nextMode(effectiveMode(state, entityId)));
}

/** The wire shape, which is snake_case to match every other OmniView payload. */
export interface ViewStateWire {
  default_mode: ColumnMode;
  overrides: Record<string, ColumnMode>;
}

export function toWire(state: ViewState): ViewStateWire {
  return { default_mode: state.defaultMode, overrides: state.overrides };
}

/**
 * Coerce whatever came back from the server into a usable `ViewState`.
 *
 * `view_state` is a JSONField, so anything could be in there - a row written by
 * an older build, a hand-edited blob, or a shape from a future version. A
 * diagram that refuses to render because a preference is malformed would be a
 * far worse failure than one that quietly falls back to the default.
 */
export function fromWire(raw: unknown): ViewState {
  if (!raw || typeof raw !== "object") return DEFAULT_VIEW_STATE;
  const candidate = raw as { default_mode?: unknown; overrides?: unknown };

  const defaultMode = isColumnMode(candidate.default_mode)
    ? candidate.default_mode
    : DEFAULT_VIEW_STATE.defaultMode;

  const overrides: Record<string, ColumnMode> = {};
  if (candidate.overrides && typeof candidate.overrides === "object") {
    for (const [id, mode] of Object.entries(candidate.overrides as Record<string, unknown>)) {
      // Drop entries equal to the default mode as well as invalid ones: they are
      // redundant, and keeping them would grow the stored blob forever.
      if (isColumnMode(mode) && mode !== defaultMode) overrides[id] = mode;
    }
  }
  return { defaultMode, overrides };
}
