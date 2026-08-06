"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { type ColumnPair, emptyPair } from "../lib/overrideDraft";
import { type ComboboxOption, OverridesCombobox } from "./OverridesCombobox";

/**
 * The join condition, one column pair per line.
 *
 * The backend pairs columns *positionally*, so a composite key is a list of
 * (left, right) pairs and never two independent lists - which is also what
 * makes the "both sides need the same count" 422 unreachable from this form.
 */

const asOptions = (columns: readonly string[]): ComboboxOption[] =>
  columns.map((column) => ({ value: column, label: column }));

export function OverridesColumnPairs({
  nameA,
  nameB,
  columnsA,
  columnsB,
  pairs,
  onChange,
}: {
  nameA: string;
  nameB: string;
  columnsA: readonly string[];
  columnsB: readonly string[];
  pairs: readonly ColumnPair[];
  onChange: (pairs: ColumnPair[]) => void;
}) {
  const optionsA = asOptions(columnsA);
  const optionsB = asOptions(columnsB);

  const replace = (index: number, pair: ColumnPair) =>
    onChange(pairs.map((existing, at) => (at === index ? pair : existing)));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">Join on</legend>

      {pairs.map((pair, index) => {
        const incomplete = pair.a === "" || pair.b === "";
        return (
          <div
            key={index}
            className={cn(
              "flex items-end gap-2 rounded-md border border-transparent p-1.5",
              incomplete && "border-amber-500/40 bg-amber-500/5",
            )}
          >
            <OverridesCombobox
              caption={`${nameA} column`}
              captionHidden={index > 0}
              value={pair.a}
              options={optionsA}
              placeholder="Pick a column"
              onChange={(column) => replace(index, { ...pair, a: column })}
            />
            <span className="pb-2 text-sm text-muted-foreground" aria-hidden>
              =
            </span>
            <OverridesCombobox
              caption={`${nameB} column`}
              captionHidden={index > 0}
              value={pair.b}
              options={optionsB}
              placeholder="Pick a column"
              onChange={(column) => replace(index, { ...pair, b: column })}
            />
            {incomplete && (
              <span className="pb-2 text-xs whitespace-nowrap text-amber-700 dark:text-amber-500">
                Incomplete
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove column pair ${index + 1}`}
              onClick={() => onChange(pairs.filter((_, at) => at !== index))}
            >
              <X />
            </Button>
          </div>
        );
      })}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...pairs, emptyPair()])}
        >
          <Plus />
          Add column pair
        </Button>
      </div>
    </fieldset>
  );
}
