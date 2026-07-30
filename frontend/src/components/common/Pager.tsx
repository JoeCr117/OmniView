"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Offset/limit pagination controls, for any app with a paged list. */
export function Pager({
  offset,
  limit,
  count,
  onOffsetChange,
}: {
  offset: number;
  limit: number;
  count: number;
  onOffsetChange: (offset: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(count / limit));
  const hasPrev = offset > 0;
  const hasNext = offset + limit < count;

  return (
    <div className="mt-3 flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={!hasPrev}
        onClick={() => onOffsetChange(Math.max(0, offset - limit))}
      >
        <ChevronLeft />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pageCount} ({count} total)
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={() => onOffsetChange(offset + limit)}
      >
        Next
        <ChevronRight />
      </Button>
    </div>
  );
}
