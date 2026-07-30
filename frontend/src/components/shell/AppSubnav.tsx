"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { getApp } from "@/apps/registry";
import { cn } from "@/lib/utils";

/**
 * An app's local tab bar, generated from its registry navItems. Rendered by
 * the app's own nested layout inside the viewport - shell chrome (header,
 * sidebar) stays app-agnostic.
 */
export function AppSubnav({ appId }: { appId: string }) {
  const pathname = usePathname();
  const app = getApp(appId);
  if (!app) return null;

  return (
    <nav aria-label={`${app.name} navigation`} className="flex gap-1 border-b px-6 pt-3">
      {app.navItems.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px rounded-t-md border px-3.5 py-2 text-sm",
              active
                ? "border-border border-b-background bg-background font-semibold"
                : "border-transparent hover:bg-muted",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
