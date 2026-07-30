"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { EyeOff, KeyRound, List } from "lucide-react";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

import { COLUMN_MODES, type ColumnMode } from "../lib/displayMode";

/**
 * The three-state column control.
 *
 * Radix `ToggleGroup` rather than three buttons, because it brings roving
 * tabindex and arrow-key movement - a segmented control that cannot be driven
 * from the keyboard is a common and avoidable failure.
 *
 * The selected state is a single indicator that *slides*, not three backgrounds
 * cross-fading. That is what makes it read as one control with a position
 * rather than as three independent buttons, and it costs one transform.
 */

export const MODE_META: Record<
  ColumnMode,
  { label: string; hint: string; Icon: typeof List }
> = {
  all: { label: "All", hint: "Every column", Icon: List },
  keys: { label: "Keys", hint: "Keys and related columns only", Icon: KeyRound },
  none: { label: "None", hint: "Table names only", Icon: EyeOff },
};

export function ModePills({
  value,
  onChange,
  className,
}: {
  value: ColumnMode;
  onChange: (mode: ColumnMode) => void;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const index = COLUMN_MODES.indexOf(value);

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      // Radix clears the value when the active item is re-pressed. This control
      // has no "off" state, so an empty string means "unchanged" and is ignored.
      onValueChange={(next) => next && onChange(next as ColumnMode)}
      aria-label="Column display"
      className={cn(
        "relative grid grid-cols-3 gap-0 rounded-md bg-muted p-0.5",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[5px] bg-background shadow-sm",
          // Width is a third of the track minus its padding, so the indicator
          // lines up with the item under it at any container width.
          "w-[calc((100%-0.25rem)/3)]",
          !reducedMotion && "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
        style={{ transform: `translateX(${index * 100}%)` }}
      />

      {COLUMN_MODES.map((mode) => {
        const { label, hint, Icon } = MODE_META[mode];
        return (
          <ToggleGroupPrimitive.Item
            key={mode}
            value={mode}
            title={hint}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-[5px] px-2 py-1.5 text-xs font-medium",
              "text-muted-foreground data-[state=on]:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              !reducedMotion && "transition-colors duration-200",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {label}
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}
