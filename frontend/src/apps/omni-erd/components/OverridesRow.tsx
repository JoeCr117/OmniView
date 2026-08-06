"use client";

import { ArrowRight, Pencil } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { RelationshipOverride } from "../lib/api";
import { joinCondition, relationName } from "../lib/overrideText";
import { OverridesDeleteButton } from "./OverridesDeleteButton";
import { OverridesStatusBadge } from "./OverridesStatusBadge";

const CELL = "px-4 py-3 align-top";

export function OverridesRow({
  override,
  deleting,
  onEdit,
  onDelete,
}: {
  override: RelationshipOverride;
  deleting: boolean;
  onEdit: (override: RelationshipOverride) => void;
  onDelete: (override: RelationshipOverride) => void;
}) {
  const pair = `${relationName(override.source_entity)} → ${relationName(override.target_entity)}`;
  const [confirming, setConfirming] = useState(false);

  return (
    <tr className="border-t">
      <td className={CELL}>
        <span className="flex items-center gap-1.5 font-mono text-xs">
          <span title={override.source_entity}>{relationName(override.source_entity)}</span>
          <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <span title={override.target_entity}>{relationName(override.target_entity)}</span>
        </span>
        {override.note !== "" && (
          <span className="mt-1 block text-xs text-muted-foreground">{override.note}</span>
        )}
      </td>

      <td className={CELL}>
        {override.action === "suppress" ? (
          <span className="text-xs text-muted-foreground italic">no edge is drawn</span>
        ) : (
          <code className="font-mono text-xs">
            {joinCondition(
              override.source_entity,
              override.source_columns,
              override.target_entity,
              override.target_columns,
            )}
          </code>
        )}
      </td>

      <td className={CELL}>{override.action === "suppress" ? "Suppressed" : "Join"}</td>

      <td className={CELL}>
        <OverridesStatusBadge status={override.status} detail={override.detail} />
      </td>

      <td className={CELL}>
        {override.updated_by !== null && (
          <span className="block text-xs">{override.updated_by}</span>
        )}
        <span className="block text-xs text-muted-foreground">
          {new Date(override.updated_at).toLocaleString()}
        </span>
      </td>

      <td className={CELL}>
        <span className="flex items-center justify-end gap-1">
          {!confirming && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Edit override for ${pair}`}
              onClick={() => onEdit(override)}
            >
              <Pencil />
              Edit
            </Button>
          )}
          <OverridesDeleteButton
            label={pair}
            busy={deleting}
            confirming={confirming}
            onArm={() => setConfirming(true)}
            onDisarm={() => setConfirming(false)}
            onConfirm={() => onDelete(override)}
          />
        </span>
      </td>
    </tr>
  );
}
