"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOverlayContainer } from "@/hooks/useOverlayContainer";
import { cn } from "@/lib/utils";

/**
 * Pick one name out of a fixed list. The only way a table or column name gets
 * into an override.
 *
 * Typing filters the list; it never becomes the value. That is the point:
 * `datavault` holds CamelCase relations with lowercase columns, so a hand-typed
 * `AccountSK` would be stored as an assertion the catalog cannot resolve, and
 * the override would silently stop drawing after the next rebuild.
 *
 * A value that is *not* among the options is still shown, flagged. An override
 * whose table was dropped has to stay legible in the form - blanking the field
 * would hide the very thing the admin came here to correct.
 */

export interface ComboboxOption {
  /** What gets stored - an entity id or a column name, in catalog spelling. */
  value: string;
  label: string;
}

export function OverridesCombobox({
  caption,
  captionHidden = false,
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}: {
  caption: string;
  /** Hide the caption visually but keep it as the control's accessible name -
   *  for a repeated row where printing it again would only add noise. */
  captionHidden?: boolean;
  value: string;
  options: readonly ComboboxOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useOverlayContainer();

  const chosen = options.find((option) => option.value === value);
  const missing = value !== "" && chosen === undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {!captionHidden && (
        <span className="text-xs font-medium text-muted-foreground">{caption}</span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="lg"
            role="combobox"
            aria-expanded={open}
            aria-label={caption}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-mono text-xs",
              missing && "border-amber-500/60 text-amber-700 dark:text-amber-500",
            )}
            title={value || undefined}
          >
            <span className={cn("truncate", !value && "font-sans text-muted-foreground")}>
              {chosen?.label ?? (value || placeholder)}
            </span>
            <ChevronsUpDown className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent container={container} className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput placeholder={`Filter ${caption.toLowerCase()}…`} />
            <CommandList className="max-h-64">
              <CommandEmpty>Nothing matches that.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    // cmdk lowercases the argument it hands `onSelect`, so the
                    // option's own value is used instead. Casing is the whole
                    // reason this control exists.
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("size-3.5", option.value === value ? "" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="truncate font-mono text-xs">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {missing && (
        <span className="text-xs text-amber-700 dark:text-amber-500">
          Not in this diagram any more — pick a replacement.
        </span>
      )}
    </div>
  );
}
