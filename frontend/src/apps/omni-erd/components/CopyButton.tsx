"use client";

import { Check, Copy } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Copy-to-clipboard for a block of generated text, with the fallback the
 * Clipboard API forces on us.
 *
 * `navigator.clipboard` exists only in a secure context, so it is simply absent
 * over plain http on a LAN address - a normal way to reach the dev container.
 * When the write fails, the text itself is selected instead, which leaves the
 * user one Ctrl-C away and says so out loud rather than looking like a dead
 * button.
 *
 * The outcome is spoken by a live region, not by the icon swap alone: a tick
 * replacing a clipboard is invisible to a screen reader and to anyone not
 * watching that corner.
 *
 * `text` is nullable: the caller has nothing runnable when the selection
 * doesn't join, and a control that renders disabled is a better answer than
 * one that appears and disappears as the selection changes.
 *
 * Disabled state is `aria-disabled`, not the native `disabled` attribute.
 * `buttonVariants` sets `disabled:pointer-events-none`, which would make the
 * explanatory `title` unreachable by hover - the one time a disabled button's
 * tooltip actually matters. Styled to look disabled and left focusable and
 * hoverable instead; the click stays a no-op because `copy` returns early
 * when `text` is null.
 */

const RESET_MS = 2000;

type CopyStatus = "idle" | "copied" | "selected" | "failed";

const MESSAGE: Record<CopyStatus, string> = {
  idle: "",
  copied: "Copied.",
  selected: "Clipboard unavailable - the text is selected, press Ctrl-C.",
  failed: "Copy failed - select the text and press Ctrl-C.",
};

function selectContents(element: HTMLElement | null): boolean {
  const selection = element?.ownerDocument.defaultView?.getSelection();
  if (!element || !selection) return false;

  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

const DISABLED_TITLE = "No joinable query for this selection";

export function CopyButton({
  text,
  label,
  fallbackRef,
}: {
  /** `null` when the current selection has nothing runnable to copy. */
  text: string | null;
  /** Announced as the button's name, e.g. "Copy query". */
  label: string;
  /** The element holding `text`, selected when the clipboard write fails. */
  fallbackRef: RefObject<HTMLElement | null>;
}) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const disabled = text === null;

  // Only the success tick times out; a fallback message has to outlive the
  // keystroke it is asking for.
  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus(selectContents(fallbackRef.current) ? "selected" : "failed");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="default"
        onClick={copy}
        aria-disabled={disabled}
        title={disabled ? DISABLED_TITLE : undefined}
        aria-label={label}
        className={cn(disabled && "pointer-events-auto opacity-50")}
      >
        {status === "copied" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {status === "copied" ? "Copied" : "Copy"}
      </Button>
      <p
        role="status"
        aria-live="polite"
        className={
          status === "copied" || status === "idle"
            ? "text-[11px] text-muted-foreground"
            : "text-[11px] text-amber-600 dark:text-amber-500"
        }
      >
        {MESSAGE[status]}
      </p>
    </div>
  );
}
