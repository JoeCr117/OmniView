"use client";

import { Panel } from "@xyflow/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

/**
 * The shared shell both inspectors float in: a React Flow `<Panel>` pinned
 * top-right on the popover surface, with a header (title + close), a scrolling
 * body, and an optional footer.
 *
 * Extracted from `DetailFlyout` so the multi-select `SelectionFlyout` gets the
 * exact same frame, geometry and entry animation for free - and so the
 * single-table flyout's look is unchanged by the refactor.
 *
 * A plain `<Panel>`, deliberately not a Radix Sheet/portal. Two properties
 * follow, both of them bugs avoided:
 *  - It floats *inside* the canvas, so nothing has to be taught about
 *    `#app-viewport` to survive fullscreen - it is already a child of it.
 *  - It unmounts outright rather than through a Radix `Presence`, so it cannot
 *    get stranded mounted-and-opaque over the canvas when an exit animation is
 *    interrupted.
 */

// Floats inset from the right, clear of the top, stopping short of the minimap.
// MAX_HEIGHT is measured from the panel's own top edge; the extra 2rem covers
// the top margin so it ends above the ~150px minimap bottom-right.
const TOP_GAP = "!mt-8";
const MAX_HEIGHT = "calc(100% - 14rem)";

export function FlyoutPanel({
  ariaLabel,
  header,
  footer,
  onClose,
  closeLabel,
  children,
}: {
  ariaLabel: string;
  /** The title block, rendered left of the close button. */
  header: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <Panel
      position="top-right"
      className={cn(
        "!m-4 flex w-[19rem] flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
        TOP_GAP,
        !reducedMotion && "animate-in fade-in slide-in-from-right-4 duration-200",
      )}
      style={{ maxHeight: MAX_HEIGHT }}
      aria-label={ariaLabel}
    >
      <header className="flex items-start justify-between gap-2 border-b px-3 py-2.5">
        <div className="min-w-0">{header}</div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={closeLabel}>
          <X />
        </Button>
      </header>

      {/* The scrolling middle. `min-h-0` is what lets it actually scroll inside a
          flex column instead of pushing the footer out of the panel. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      {footer && <footer className="border-t px-3 py-2.5">{footer}</footer>}
    </Panel>
  );
}
