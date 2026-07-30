"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { visibleApps } from "@/apps/access";
import { appIdFromPath, getApp } from "@/apps/registry";
import { useAuth } from "@/lib/auth";

/**
 * Which apps are open, in what order, and where you were in each.
 *
 * OmniView's apps behave like browser tabs: opening one you already have open
 * takes you back to the page you left it on rather than to its front door;
 * closing one falls through to its neighbour; and tabs can be dragged into the
 * order you want.
 *
 * The URL stays the source of truth for the *focused* tab - it is derived from
 * the pathname, never the other way round. That keeps deep links, refreshes,
 * the back button, and Django's URL-based staff gate on /apps/admin-portal all
 * working exactly as they did. The tab list is the only thing this context
 * actually owns.
 */

export interface OpenTab {
  appId: string;
  /** The last URL visited inside this app - what re-focusing the tab returns to. */
  href: string;
}

interface TabsValue {
  tabs: OpenTab[];
  activeAppId: string | null;
  /** Where clicking this app in the rail should go: back where you were, else its front door. */
  hrefFor: (appId: string) => string;
  close: (appId: string) => void;
  move: (from: number, to: number) => void;
}

const STORAGE_KEY = "omniview:tabs";

const TabsContext = createContext<TabsValue>({
  tabs: [],
  activeAppId: null,
  hrefFor: (appId) => getApp(appId)?.basePath ?? "/",
  close: () => {},
  move: () => {},
});

export function useTabs(): TabsValue {
  return useContext(TabsContext);
}

function readStored(): OpenTab[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is OpenTab =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as OpenTab).appId === "string" &&
        typeof (t as OpenTab).href === "string",
    );
  } catch {
    return []; // Storage disabled or corrupt - tabs are a convenience, never a blocker.
  }
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, config } = useAuth();

  const [stored, setStored] = useState<OpenTab[]>([]);
  const activeAppId = appIdFromPath(pathname);

  // Restored after mount, not during render: the static export is prerendered
  // HTML, so reading localStorage on the first render would hydration-mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting browser state on mount; there is no render-time way to read it safely here.
  useEffect(() => setStored(readStored()), []);

  // A tab may only exist for an app the user is actually allowed to see. Access
  // is revocable and sessions change, so this is applied on *read* rather than
  // pruned into state: a tab left behind by a previous user, or by a grant that
  // has since been revoked, simply stops existing rather than 403ing later.
  const allowed = useMemo(
    () => new Set(visibleApps(user, config).map((app) => app.id)),
    [user, config],
  );
  const tabs = useMemo(
    () => stored.filter((tab) => allowed.has(tab.appId)),
    [stored, allowed],
  );

  // The URL opens tabs, not the other way round: navigating anywhere inside an
  // app ensures its tab exists and records exactly where you are, so re-focusing
  // it later comes back to this page rather than the app's front door.
  useEffect(() => {
    if (!activeAppId || !pathname || !allowed.has(activeAppId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the tab list tracks an external system (the URL). There is nothing to derive it from at render time: the list is a history of where you have been, not a function of where you are.
    setStored((current) => {
      const existing = current.find((t) => t.appId === activeAppId);
      if (existing?.href === pathname) return current;
      if (existing) {
        return current.map((t) => (t.appId === activeAppId ? { ...t, href: pathname } : t));
      }
      return [...current, { appId: activeAppId, href: pathname }];
    });
  }, [activeAppId, pathname, allowed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      // Non-fatal: the tab bar just won't survive a reload.
    }
  }, [tabs]);

  // close/move take positions in the list the user can actually see, so they
  // operate on `tabs`, not on `stored` - the two differ whenever storage still
  // holds a tab for an app this session isn't allowed. Writing the result back
  // wholesale also drops those leftovers, so the mismatch self-heals.
  const close = useCallback(
    (appId: string) => {
      const index = tabs.findIndex((t) => t.appId === appId);
      if (index === -1) return;
      const next = tabs.filter((t) => t.appId !== appId);
      setStored(next);
      // Closing the tab you're looking at has to take you somewhere: the tab
      // that slid into its place, else the one before it, else home.
      if (appId === activeAppId) {
        const successor = next[index] ?? next[index - 1];
        router.push(successor ? successor.href : "/");
      }
    },
    [tabs, activeAppId, router],
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return;
      const next = [...tabs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setStored(next);
    },
    [tabs],
  );

  const hrefFor = useCallback(
    (appId: string) =>
      tabs.find((t) => t.appId === appId)?.href ?? getApp(appId)?.basePath ?? "/",
    [tabs],
  );

  const value = useMemo(
    () => ({ tabs, activeAppId, hrefFor, close, move }),
    [tabs, activeAppId, hrefFor, close, move],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}
