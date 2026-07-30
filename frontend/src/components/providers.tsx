"use client";

import { ThemeProvider } from "next-themes";

import { AuthProvider } from "@/lib/auth";
import { TabsProvider } from "@/lib/tabs";

/**
 * Client-side context providers wrapped around the whole app. The root layout
 * stays a server component (it owns metadata/fonts); this is its single
 * client boundary. next-themes toggles the `dark` class on <html> (and the
 * matching color-scheme), persisting the choice in localStorage - "system"
 * follows the OS until the user explicitly picks a theme. AuthProvider probes
 * /api/auth/{config,csrf,me} on mount and owns login/logout.
 *
 * TabsProvider sits inside AuthProvider because which apps may be open depends
 * on who is signed in: a tab for an app the user can no longer see gets dropped.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <TabsProvider>{children}</TabsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
