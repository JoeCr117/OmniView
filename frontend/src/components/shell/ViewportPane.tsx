"use client";

import { useEffect, useRef } from "react";

import { useTabs } from "@/lib/tabs";

/**
 * The scrolling area the focused app is drawn into, and the memory of where you
 * had scrolled to in each one.
 *
 * A note on what this deliberately is *not*. The obvious way to make tabs feel
 * like browser tabs is to keep every open app mounted and merely hide the
 * inactive ones. That is not possible here: the `children` a client layout gets
 * from the App Router is not a snapshot of a tree, it is a live slot that
 * resolves to whichever route is current. Cache it and render it later and you
 * get a second copy of the *current* page, not the old one - which is exactly
 * what happened when we tried (both panes rendered "Users & Access").
 *
 * So Next stays the single renderer, a backgrounded app does unmount, and we
 * close the gap from the other side: the tab remembers the page you left it on
 * (lib/tabs), the resource cache serves its data without a refetch (QOL5), and
 * this restores your scroll position. What is still lost on a switch is a
 * table's own sort/filter state - the one thing only true keep-alive would fix.
 */
export function ViewportPane({ children }: { children: React.ReactNode }) {
  const { activeAppId } = useTabs();
  const ref = useRef<HTMLDivElement>(null);
  const scrollTops = useRef<Map<string, number>>(new Map());
  const key = activeAppId ?? "\0home";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Restore after paint: the pane has just been re-created, so its content
    // needs to exist before there is anything to scroll.
    const restore = requestAnimationFrame(() => {
      el.scrollTop = scrollTops.current.get(key) ?? 0;
    });

    const remember = () => scrollTops.current.set(key, el.scrollTop);
    el.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(restore);
      remember(); // Last position wins, even if the switch beats the scroll event.
      el.removeEventListener("scroll", remember);
    };
  }, [key]);

  return (
    <div ref={ref} data-tab-pane={key === "\0home" ? "home" : key} className="min-h-0 flex-1 overflow-auto">
      {children}
    </div>
  );
}
