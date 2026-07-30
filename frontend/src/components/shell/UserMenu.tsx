"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { type AuthUser, useAuth } from "@/lib/auth";

function initials(user: AuthUser): string {
  const fromName = `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.trim();
  return (fromName || user.username.slice(0, 2)).toUpperCase();
}

/**
 * The upper-right profile flyout: the signed-in identity (initials avatar,
 * username/email, sign out) and the permanent dark-mode toggle. Signed out /
 * auth-not-required shows the local-user placeholder.
 */
export function UserMenu() {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, config, logout } = useAuth();
  // Behind a platform-managed sign-in (Databricks), signing out of the app
  // is meaningless - the front door would immediately sign the user back in.
  const canSignOut = !(config?.sso_managed ?? false);
  // resolvedTheme is unknowable server-side; render a stable default until
  // mounted so hydration matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Open user menu">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-semibold">
              {user ? initials(user) : "OV"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {user ? (
            <>
              <span className="block">{user.username}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {user.email || "No email on file"}
              </span>
            </>
          ) : (
            <>
              <span className="block">Local user</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Not signed in
              </span>
            </>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          // The whole row is the control; preventDefault keeps the menu open
          // so the switch's state change is visible in place.
          onSelect={(event) => {
            event.preventDefault();
            setTheme(isDark ? "light" : "dark");
          }}
        >
          {isDark ? <Sun /> : <Moon />}
          Dark mode
          <Switch
            checked={isDark}
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none ml-auto"
          />
        </DropdownMenuItem>
        {user && canSignOut && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
