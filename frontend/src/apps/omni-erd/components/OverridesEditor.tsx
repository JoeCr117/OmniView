"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { RelationshipOverride } from "../lib/api";
import { type OverrideDraft, draftProblem } from "../lib/overrideDraft";
import { relationName } from "../lib/overrideText";
import type { Entity } from "../lib/types";
import { OverridesColumnPairs } from "./OverridesColumnPairs";
import { type ComboboxOption, OverridesCombobox } from "./OverridesCombobox";

/**
 * The one place an override is written.
 *
 * Inline above the list rather than a modal: this shell has no dialog
 * primitive, and on a full-width page the form and the row it came from should
 * be readable at the same time.
 *
 * The form is built to make the service's 422s unreachable rather than to
 * report them - the second table cannot be the first, columns come only from
 * the catalog, a suppress sends no columns at all, and the two sides of a join
 * are one list of pairs so their counts cannot differ. `draftProblem` names
 * whatever is still missing and Save stays disabled until nothing is. A server
 * error is still shown: the client is not the authority.
 *
 * The draft itself and its rules live in `lib/overrideDraft` so they can be
 * tested without mounting this form.
 */

const columnsOf = (entities: readonly Entity[], entityId: string): string[] =>
  entities.find((entity) => entity.id === entityId)?.columns.map((column) => column.name) ?? [];

/** Every table except the one already picked on the other side - which is what
 *  makes "X cannot be joined to itself" unreachable. */
const tableOptions = (entities: readonly Entity[], exclude: string): ComboboxOption[] =>
  entities
    .filter((entity) => entity.id !== exclude)
    .map((entity) => ({ value: entity.id, label: entity.name }));

const HINT_ID = "override-hint";

export function OverridesEditor({
  draft,
  entities,
  existing,
  serverError,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: OverrideDraft;
  entities: readonly Entity[];
  existing: readonly RelationshipOverride[];
  serverError: string | null;
  saving: boolean;
  onChange: (draft: OverrideDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const problem = draftProblem(draft, existing);
  const bothChosen = draft.entityA !== "" && draft.entityB !== "";
  const nameA = relationName(draft.entityA);
  const nameB = relationName(draft.entityB);

  // Switching a table invalidates the columns picked from the old one, so that
  // side's picks are cleared rather than left pointing at a column the new
  // table does not have.
  const chooseA = (entityA: string) => {
    if (entityA === draft.entityA) return;
    onChange({ ...draft, entityA, pairs: draft.pairs.map((pair) => ({ ...pair, a: "" })) });
  };
  const chooseB = (entityB: string) => {
    if (entityB === draft.entityB) return;
    onChange({ ...draft, entityB, pairs: draft.pairs.map((pair) => ({ ...pair, b: "" })) });
  };

  return (
    <Card data-testid="override-editor">
      <CardHeader className="border-b">
        <CardTitle>{draft.id === null ? "New override" : "Edit override"}</CardTitle>
        <CardDescription>
          State how these two tables really join. An override outranks both a declared
          constraint and anything inferred from column naming.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start gap-3">
          <OverridesCombobox
            caption="First table"
            value={draft.entityA}
            options={tableOptions(entities, draft.entityB)}
            placeholder="Pick a table"
            onChange={chooseA}
          />
          <OverridesCombobox
            caption="Second table"
            value={draft.entityB}
            options={tableOptions(entities, draft.entityA)}
            placeholder="Pick a table"
            onChange={chooseB}
          />
        </div>

        <div className="flex items-start gap-3 rounded-lg border p-3">
          <Switch
            id="override-suppress"
            checked={draft.suppress}
            onCheckedChange={(suppress) => onChange({ ...draft, suppress })}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="override-suppress">
              These tables are not related — hide any inferred edge
            </Label>
            <span className="text-xs text-muted-foreground">
              A suppressed pair names no columns, and no other tier may claim it.
            </span>
          </div>
        </div>

        {bothChosen && !draft.suppress && (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Which table holds the foreign key</legend>
              <div className="flex flex-wrap gap-2">
                <DirectionButton
                  selected={draft.aReferencesB}
                  onSelect={() => onChange({ ...draft, aReferencesB: true })}
                >
                  {nameA} references {nameB}
                </DirectionButton>
                <DirectionButton
                  selected={!draft.aReferencesB}
                  onSelect={() => onChange({ ...draft, aReferencesB: false })}
                >
                  {nameB} references {nameA}
                </DirectionButton>
              </div>
              <span className="text-xs text-muted-foreground">
                The referencing table is the many end; the arrow on the diagram points away
                from it.
              </span>
            </fieldset>

            <OverridesColumnPairs
              nameA={nameA}
              nameB={nameB}
              columnsA={columnsOf(entities, draft.entityA)}
              columnsB={columnsOf(entities, draft.entityB)}
              pairs={draft.pairs}
              onChange={(pairs) => onChange({ ...draft, pairs })}
            />
          </>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="override-note">Why (optional)</Label>
          <Input
            id="override-note"
            value={draft.note}
            placeholder="Shown on the edge in the diagram"
            onChange={(event) => onChange({ ...draft, note: event.target.value })}
          />
        </div>

        {serverError !== null && (
          <p role="alert" className="text-sm text-destructive">
            The server refused this override: {serverError}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="flex items-center gap-2">
          {problem !== null && (
            <p id={HINT_ID} className="text-xs text-muted-foreground">
              {problem}
            </p>
          )}
          <Button
            type="button"
            disabled={problem !== null || saving}
            aria-describedby={problem === null ? undefined : HINT_ID}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save override"}
          </Button>
        </span>
      </CardFooter>
    </Card>
  );
}

function DirectionButton({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      size="sm"
      aria-pressed={selected}
      onClick={onSelect}
      className="font-mono text-xs"
    >
      {children}
    </Button>
  );
}
