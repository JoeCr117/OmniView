"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { canSeeAdminOnly } from "@/apps/access";
import { getApp } from "@/apps/registry";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * An app's local tab bar, generated from its registry navItems. Rendered by
 * the app's own nested layout inside the viewport - shell chrome (header,
 * sidebar) stays app-agnostic.
 */
export function AppSubnav({ appId }: { appId: string }) {
  const pathname = usePathname();
  const { user, config } = useAuth();
  const app = getApp(appId);
  if (!app) return null;

  // Hiding a tab is cosmetic, not access control: the page behind an adminOnly
  // item calls endpoints that carry AdminAuth, and those 403 a granted
  // non-admin regardless of what this nav renders.
  //
  // While auth is still settling `user` is null, so an admin item appears a
  // beat late. That flicker errs towards hiding, and a loading branch here
  // would delay the tab bar for every user to spare admins a blink.
  const navItems = app.navItems.filter(
    (item) => !item.adminOnly || canSeeAdminOnly(user, config),
  );

  return (
    <nav aria-label={`${app.name} navigation`} className="flex gap-1 border-b px-6 pt-3">
      {navItems.map((item) => {
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
