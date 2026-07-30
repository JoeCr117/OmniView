"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { getApp } from "@/apps/registry";
import { useTabs } from "@/lib/tabs";
import { cn } from "@/lib/utils";

/**
 * The open apps, as tabs across the top of the viewport.
 *
 * Browser-tab semantics: selecting an app already open focuses its tab (and
 * lands you back where you left it - see hrefFor in lib/tabs); the × closes
 * one; and they can be dragged into whatever order you want.
 *
 * Reordering is plain HTML5 drag-and-drop rather than a dnd library: with a
 * handful of same-size tabs in a single row there is nothing to measure and
 * nothing to animate, so a library would be ~40KB to replace ten lines. Drag is
 * mouse-only by nature, so Ctrl+Shift+Arrow does the same thing from the
 * keyboard.
 */
export function TabBar() {
  const { tabs, activeAppId, close, move } = useTabs();
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  if (tabs.length === 0) return null;

  const onDrop = (to: number) => {
    if (dragging !== null) move(dragging, to);
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <div
      role="tablist"
      aria-label="Open apps"
      aria-orientation="horizontal"
      className="flex shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted/30 px-2 pt-1.5"
    >
      {tabs.map((tab, index) => {
        const app = getApp(tab.appId);
        if (!app) return null;
        const active = tab.appId === activeAppId;

        return (
          <div
            key={tab.appId}
            draggable
            onDragStart={() => setDragging(index)}
            onDragOver={(e) => {
              e.preventDefault(); // Required, or the drop never fires.
              setDropTarget(index);
            }}
            onDrop={() => onDrop(index)}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onKeyDown={(e) => {
              if (!e.ctrlKey || !e.shiftKey) return;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(index, index - 1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                move(index, index + 1);
              }
            }}
            className={cn(
              "group flex items-center rounded-t-md border border-b-0 text-sm transition-colors",
              active
                ? "border-border bg-background font-medium"
                : "border-transparent text-muted-foreground hover:bg-background/60",
              dragging === index && "opacity-50",
              dropTarget === index && dragging !== null && dragging !== index && "ring-2 ring-primary/50",
            )}
          >
            <Link
              href={tab.href}
              role="tab"
              aria-selected={active}
              className="flex items-center gap-2 py-1.5 pr-1 pl-3 outline-none"
            >
              <app.icon className="size-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{app.name}</span>
            </Link>
            <button
              type="button"
              aria-label={`Close ${app.name}`}
              onClick={() => close(tab.appId)}
              className="mr-1.5 ml-0.5 rounded-sm p-0.5 text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
