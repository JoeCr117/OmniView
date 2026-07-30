"use client";

import { Minimize2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppRail } from "@/components/shell/AppRail";
import { Header } from "@/components/shell/Header";
import { TabBar } from "@/components/shell/TabBar";
import { ViewportPane } from "@/components/shell/ViewportPane";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useAuth } from "@/lib/auth";

/**
 * The dashboard chrome: header across the top, the app rail down the left, and
 * the viewport filling the rest.
 *
 * The viewport holds the tab bar and the open apps, and is the fullscreen target
 * ("maximize like a video") - so fullscreening keeps your tabs and loses only the
 * chrome. It needs an explicit bg-background because fullscreened elements sit on
 * a black backdrop, and since the header goes off-screen a floating exit button
 * renders inside it (Esc works natively too).
 *
 * Also the client-side auth gate: while the session probe runs it shows a
 * skeleton, and if auth is required but nobody is signed in it replaces to
 * /login (Django's frontend_view already covers direct/full-page hits; this
 * covers client navigations and session expiry).
 */

const RAIL_COLLAPSED_KEY = "omniview:rail-collapsed";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const { ref, isFullscreen, toggle, exit } = useFullscreen<HTMLDivElement>();
  const { user, config, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Read after mount, never during render: this is a prerendered static export,
  // so reading storage on the first render would hydration-mismatch.
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting browser state on mount; reading storage during render would hydration-mismatch the prerendered HTML.
    setRailCollapsed(window.localStorage.getItem(RAIL_COLLAPSED_KEY) === "1");
  }, []);

  const toggleRail = useCallback(() => {
    setRailCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(RAIL_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Non-fatal: the rail just won't remember across reloads.
      }
      return next;
    });
  }, []);

  const needsLogin = !loading && config?.auth_required === true && user === null;

  useEffect(() => {
    if (needsLogin) {
      router.replace(`/login?next=${encodeURIComponent(pathname ?? "/")}`);
    }
  }, [needsLogin, router, pathname]);

  if (loading || needsLogin) {
    return (
      <div className="flex h-dvh flex-col" data-testid="shell-skeleton">
        <div className="flex h-14 items-center gap-4 border-b px-4">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mx-auto h-8 w-full max-w-md" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="flex min-h-0 flex-1">
          <Skeleton className="m-2 w-52 shrink-0 rounded-md max-sm:hidden" />
          <div className="flex-1 p-6">
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <Header
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
        railCollapsed={railCollapsed}
        onToggleRail={toggleRail}
      />
      <div className="flex min-h-0 flex-1">
        <AppRail collapsed={railCollapsed} />
        <div
          ref={ref}
          id="app-viewport"
          data-fullscreen={isFullscreen ? "true" : undefined}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
        >
          <TabBar />
          <ViewportPane>{children}</ViewportPane>
          {isFullscreen && (
            <Button
              variant="secondary"
              size="sm"
              onClick={exit}
              className="fixed right-4 bottom-4 z-50 shadow-lg"
            >
              <Minimize2 />
              Exit full screen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
