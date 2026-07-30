"use client";

import { LayoutGrid } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SKIP_SSO_AUTO_LOGIN_KEY, useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { hardNavigate } from "@/lib/navigation";

/** Only same-app absolute paths may be redirect targets (no open redirects). */
function sanitizeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "Invalid username or password.";
  }
  if (error instanceof ApiError && error.status === 403) {
    return "Session check failed - reload the page and try again.";
  }
  return "Sign-in failed - is the server reachable?";
}

function LoginForm() {
  const { user, config, loading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get("next"));
  // django-allauth's server-side redirect flow; it honors ?next= through the
  // OAuth state, so the deep link survives the Microsoft round-trip.
  const microsoftHref = `/accounts/microsoft/login/?next=${encodeURIComponent(next)}`;
  const autoLoginDisabled = searchParams.get("auto") === "0";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Already signed in (e.g. navigated here manually): straight through.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, router, next]);

  // Entra ID auto-login: bounce straight into the Microsoft flow unless the
  // user just logged out (sessionStorage flag) or opted out with ?auto=0.
  useEffect(() => {
    if (loading || user) return;
    if (!config?.azure_enabled || !config.azure_auto_login) return;
    if (autoLoginDisabled) return;
    if (window.sessionStorage.getItem(SKIP_SSO_AUTO_LOGIN_KEY)) return;
    setRedirecting(true);
    hardNavigate(microsoftHref);
  }, [loading, user, config, autoLoginDisabled, microsoftHref]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      router.replace(next);
    } catch (err) {
      setError(loginErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <LayoutGrid className="mb-2 size-8 text-primary" aria-hidden />
        <CardTitle>Sign in to OmniView</CardTitle>
        <CardDescription>Use your OmniView account credentials.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        {config?.azure_enabled && (
          <>
            <div className="my-4 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            {/* Server-side redirect flow (django-allauth) - a plain anchor,
                not a client navigation. A deliberate click re-arms auto-login
                after a logout suppressed it. */}
            <Button variant="outline" className="w-full" asChild>
              <a
                href={microsoftHref}
                onClick={() =>
                  window.sessionStorage.removeItem(SKIP_SSO_AUTO_LOGIN_KEY)
                }
              >
                Sign in with Microsoft
              </a>
            </Button>
            {redirecting && (
              <p role="status" className="mt-3 text-center text-sm text-muted-foreground">
                Redirecting to Microsoft sign-in...
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * useSearchParams requires a Suspense boundary under the app router (the
 * subtree client-renders after hydration; see Next's use-search-params doc).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
