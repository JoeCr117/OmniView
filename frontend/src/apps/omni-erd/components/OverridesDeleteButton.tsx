"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Delete, asked twice.
 *
 * The confirmation is inline rather than a modal because there is no dialog
 * primitive in this shell - and because an override is one row of admin
 * bookkeeping, not a destructive operation worth stealing focus for. The second
 * click is only there so a mis-aimed first one costs nothing.
 *
 * `confirming` is controlled by the caller (`OverridesRow`) rather than owned
 * here, so the row can hide its Edit button for the same span the confirm pair
 * is shown - a same-width swap instead of the confirm pair growing the row
 * past the card.
 */
export function OverridesDeleteButton({
  label,
  busy,
  confirming,
  onArm,
  onDisarm,
  onConfirm,
}: {
  /** What is about to be deleted, for the button's accessible name. */
  label: string;
  busy: boolean;
  confirming: boolean;
  onArm: () => void;
  onDisarm: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        aria-label={`Delete override for ${label}`}
        onClick={onArm}
      >
        <Trash2 />
        Delete
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={busy}
        aria-label={`Confirm deleting the override for ${label}`}
        onClick={onConfirm}
      >
        {busy ? "Deleting…" : "Delete"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDisarm}>
        Cancel
      </Button>
    </span>
  );
}
