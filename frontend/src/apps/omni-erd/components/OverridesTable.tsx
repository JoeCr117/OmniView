"use client";

import type { RelationshipOverride } from "../lib/api";
import { OverridesRow } from "./OverridesRow";

/**
 * Every override standing against one diagram.
 *
 * A plain semantic table, not the shared `DataTable`: this list is five to
 * twenty rows with no sorting, filtering or paging to earn Tabulator's ~250KB
 * dynamic import - which Omni-ERD does not otherwise load at all.
 */

const HEADINGS = ["Tables", "Join condition", "Action", "Status", "Last changed"] as const;

export function OverridesTable({
  overrides,
  deletingId,
  onEdit,
  onDelete,
}: {
  overrides: readonly RelationshipOverride[];
  deletingId: number | null;
  onEdit: (override: RelationshipOverride) => void;
  onDelete: (override: RelationshipOverride) => void;
}) {
  if (overrides.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        No overrides on this diagram. Every edge it draws comes from a declared
        constraint or from column naming.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            {HEADINGS.map((heading) => (
              <th key={heading} className="px-4 py-3 font-medium">
                {heading}
              </th>
            ))}
            <th className="px-4 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {overrides.map((override) => (
            <OverridesRow
              key={override.id}
              override={override}
              deleting={deletingId === override.id}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
