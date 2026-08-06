import { describe, expect, it } from "vitest";

import type { RelationshipOverride } from "./api";
import {
  type OverrideDraft,
  draftFrom,
  draftPayload,
  draftProblem,
  newDraft,
} from "./overrideDraft";

const FACT = "datavault.gold_Golden1_AllTransactions";
const DIM = "datavault.gold_DimDate";

const draft = (fields: Partial<OverrideDraft> = {}): OverrideDraft => ({
  ...newDraft(),
  entityA: FACT,
  entityB: DIM,
  pairs: [{ a: "datesk", b: "datesk" }],
  ...fields,
});

const stored = (fields: Partial<RelationshipOverride> = {}): RelationshipOverride => ({
  id: 1,
  edge_id: "ovr:1",
  source_id: "pg-datavault",
  namespace: "datavault",
  source_entity: FACT,
  source_columns: ["datesk"],
  target_entity: DIM,
  target_columns: ["datesk"],
  action: "join",
  cardinality: "many_to_one",
  note: "",
  status: "active",
  detail: "",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: "boss",
  ...fields,
});

describe("newDraft", () => {
  it("starts on one empty pair, so the form has a row to fill", () => {
    expect(newDraft().pairs).toEqual([{ a: "", b: "" }]);
    expect(newDraft().id).toBeNull();
  });
});

describe("draftFrom", () => {
  it("puts the stored referencing side in slot A, so the direction reads forwards", () => {
    const loaded = draftFrom(stored());

    expect(loaded.entityA).toBe(FACT);
    expect(loaded.entityB).toBe(DIM);
    expect(loaded.aReferencesB).toBe(true);
  });

  it("pairs the two stored column lists positionally", () => {
    const loaded = draftFrom(
      stored({ source_columns: ["datesk", "amount"], target_columns: ["datesk", "year"] }),
    );

    expect(loaded.pairs).toEqual([
      { a: "datesk", b: "datesk" },
      { a: "amount", b: "year" },
    ]);
  });

  it("gives a suppress row an empty pair to edit rather than no rows at all", () => {
    const loaded = draftFrom(
      stored({ action: "suppress", source_columns: [], target_columns: [] }),
    );

    expect(loaded.suppress).toBe(true);
    expect(loaded.pairs).toEqual([{ a: "", b: "" }]);
  });

  it("round-trips the cardinality it was not given a control for", () => {
    expect(draftFrom(stored({ cardinality: "one_to_one" })).cardinality).toBe("one_to_one");
  });
});

describe("draftPayload", () => {
  it("sends slot A as the source when A references B", () => {
    const payload = draftPayload(draft(), "pg-datavault", "datavault");

    expect(payload.source_entity).toBe(FACT);
    expect(payload.target_entity).toBe(DIM);
    expect(payload.action).toBe("join");
  });

  it("swaps the ends when B is the referencing side", () => {
    const payload = draftPayload(draft({ aReferencesB: false }), "pg-datavault", "datavault");

    expect(payload.source_entity).toBe(DIM);
    expect(payload.target_entity).toBe(FACT);
  });

  it("splits the pairs into two positionally-aligned lists", () => {
    const payload = draftPayload(
      draft({
        pairs: [
          { a: "datesk", b: "datesk" },
          { a: "amount", b: "year" },
        ],
      }),
      "pg-datavault",
      "datavault",
    );

    expect(payload.source_columns).toEqual(["datesk", "amount"]);
    expect(payload.target_columns).toEqual(["datesk", "year"]);
  });

  it("drops both column lists when suppressing, which is the only shape the service takes", () => {
    const payload = draftPayload(draft({ suppress: true }), "pg-datavault", "datavault");

    expect(payload.action).toBe("suppress");
    expect(payload.source_columns).toEqual([]);
    expect(payload.target_columns).toEqual([]);
  });

  it("trims the note, so whitespace is not stored as a justification", () => {
    expect(draftPayload(draft({ note: "  why  " }), "pg-datavault", "datavault").note).toBe(
      "why",
    );
  });
});

describe("draftProblem", () => {
  it("accepts a filled single-pair join", () => {
    expect(draftProblem(draft(), [])).toBeNull();
  });

  it("asks for both tables while either is unpicked", () => {
    expect(draftProblem(draft({ entityA: "" }), [])).toBe("Pick both tables.");
    expect(draftProblem(draft({ entityB: "" }), [])).toBe("Pick both tables.");
  });

  it("refuses a self-join", () => {
    expect(draftProblem(draft({ entityB: FACT }), [])).toBe(
      "An override joins two different tables.",
    );
  });

  it("names the override already covering this pair, in either direction", () => {
    const expected =
      "Another override already covers gold_Golden1_AllTransactions and gold_DimDate — " +
      "edit or delete that one instead.";

    expect(draftProblem(draft(), [stored({ id: 7 })])).toBe(expected);
    expect(
      draftProblem(draft(), [stored({ id: 7, source_entity: DIM, target_entity: FACT })]),
    ).toBe(expected);
  });

  it("does not count the row being edited as covering its own pair", () => {
    expect(draftProblem(draft({ id: 7 }), [stored({ id: 7 })])).toBeNull();
  });

  it("stops at the covering row before looking at columns", () => {
    expect(draftProblem(draft({ pairs: [] }), [stored({ id: 7 })])).toMatch(
      /^Another override already covers/,
    );
  });

  it("accepts a suppress without looking at its columns at all", () => {
    expect(draftProblem(draft({ suppress: true, pairs: [] }), [])).toBeNull();
  });

  it("needs at least one column pair for a join", () => {
    expect(draftProblem(draft({ pairs: [] }), [])).toBe("A join needs at least one column pair.");
  });

  it("needs every pair filled on both sides", () => {
    const expected = "Every column pair needs a column on both sides.";

    expect(draftProblem(draft({ pairs: [{ a: "datesk", b: "" }] }), [])).toBe(expected);
    expect(draftProblem(draft({ pairs: [{ a: "", b: "datesk" }] }), [])).toBe(expected);
  });

  it("refuses a column pair repeated verbatim", () => {
    expect(
      draftProblem(
        draft({
          pairs: [
            { a: "datesk", b: "datesk" },
            { a: "datesk", b: "datesk" },
          ],
        }),
        [],
      ),
    ).toBe("This column pair is already listed.");
  });

  it("spots the repeat across a difference in case, as the service does", () => {
    expect(
      draftProblem(
        draft({
          pairs: [
            { a: "datesk", b: "datesk" },
            { a: "DateSK", b: "DATESK" },
          ],
        }),
        [],
      ),
    ).toBe("This column pair is already listed.");
  });

  it("accepts a composite join whose pairs genuinely differ", () => {
    expect(
      draftProblem(
        draft({
          pairs: [
            { a: "datesk", b: "datesk" },
            { a: "amount", b: "year" },
          ],
        }),
        [],
      ),
    ).toBeNull();
  });

  it("does not treat a reused column on one side alone as a repeat", () => {
    expect(
      draftProblem(
        draft({
          pairs: [
            { a: "datesk", b: "datesk" },
            { a: "datesk", b: "year" },
          ],
        }),
        [],
      ),
    ).toBeNull();
  });

  it("does not let a column containing the key separator collide with another pair", () => {
    expect(
      draftProblem(
        draft({
          pairs: [
            { a: 'we"ird', b: "plain" },
            { a: "we", b: 'ird","plain' },
          ],
        }),
        [],
      ),
    ).toBeNull();
  });
});
