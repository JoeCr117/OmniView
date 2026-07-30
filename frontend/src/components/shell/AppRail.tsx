"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { visibleApps } from "@/apps/access";
import { appIdFromPath } from "@/apps/registry";
import { useAuth } from "@/lib/auth";
import { useTabs } from "@/lib/tabs";
import { cn } from "@/lib/utils";

/**
 * The persistent app rail: OmniView's primary navigation.
 *
 * Narrow on purpose - wide enough for an app's name and no wider. It replaced
 * an off-canvas sheet that had to be opened before it could tell you anything,
 * including where you already were.
 *
 * Each entry links to `hrefFor(app)`, not the app's front door, so clicking an
 * app you already have open returns you to the page you left it on.
 */
export function AppRail({ collapsed }: { collapsed: boolean }) {
  const { user, config } = useAuth();
  const pathname = usePathname();
  const { hrefFor } = useTabs();

  const apps = visibleApps(user, config);
  const activeAppId = appIdFromPath(pathname);
  const atHome = pathname === "/";

  return (
    <nav
      aria-label="Main navigation"
      data-collapsed={collapsed ? "true" : undefined}
      className={cn(
        "flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-sidebar p-2 text-sidebar-foreground transition-[width] duration-150",
        collapsed ? "w-13" : "w-52",
      )}
    >
      <RailLink
        href="/"
        label="Home"
        active={atHome}
        collapsed={collapsed}
        icon={<Home className="size-4 shrink-0" aria-hidden />}
      />

      {apps.map((app, i) => (
        <div key={app.id} className="contents">
          {/* A hairline between apps: enough to read them as separate things,
              not enough to look like a table. */}
          {i === 0 && <div className="mx-1 my-1.5 border-t border-sidebar-border/60" aria-hidden />}
          <RailLink
            href={hrefFor(app.id)}
            label={app.name}
            active={app.id === activeAppId}
            collapsed={collapsed}
            icon={<app.icon className="size-4 shrink-0" aria-hidden />}
          />
          {i < apps.length - 1 && (
            <div className="mx-1 my-1.5 border-t border-sidebar-border/60" aria-hidden />
          )}
        </div>
      ))}

      {apps.length === 0 && !collapsed && (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          No apps granted yet — contact an administrator.
        </p>
      )}
    </nav>
  );
}

function RailLink({
  href,
  label,
  active,
  collapsed,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        // The 2px bar on the left is the active marker; inactive links reserve
        // the same space with a transparent border so nothing shifts on click.
        "flex items-center gap-2 rounded-md border-l-2 py-2 pr-2 pl-1.5 text-sm transition-colors",
        active
          ? "border-l-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "border-l-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        collapsed && "justify-center pr-1.5",
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
