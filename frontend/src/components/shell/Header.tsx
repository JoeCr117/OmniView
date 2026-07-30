"use client";

import { LayoutGrid, Maximize2, Minimize2, PanelLeft, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { UserMenu } from "./UserMenu";

export function Header({
  isFullscreen,
  onToggleFullscreen,
  railCollapsed,
  onToggleRail,
}: {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  railCollapsed: boolean;
  onToggleRail: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      {/* The rail is always on screen now, so this collapses it to icons rather
          than opening it - there is nothing to open. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
        aria-expanded={!railCollapsed}
        onClick={onToggleRail}
      >
        <PanelLeft />
      </Button>
      <Link href="/" className="flex items-center gap-2 px-1" aria-label="OmniView home">
        <LayoutGrid className="size-5 text-primary" />
        <span className="text-base font-semibold tracking-tight max-sm:hidden">OmniView</span>
      </Link>
      <div className="mx-auto flex w-full max-w-md items-center gap-1">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            readOnly
            placeholder="Search (coming soon)"
            aria-label="Search (not yet functional)"
            className="pl-8"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
          title={isFullscreen ? "Exit full screen" : "Maximize the app viewport"}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </div>
      <UserMenu />
    </header>
  );
}
