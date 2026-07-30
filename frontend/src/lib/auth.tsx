"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { apiFetch, UNAUTHORIZED_EVENT } from "@/lib/http";

/**
 * Set (in sessionStorage) by logout so the login page's Entra ID auto-login
 * does not immediately sign the user back in; cleared when the user clicks
 * "Sign in with Microsoft" deliberately. Session-scoped on purpose: a fresh
 * tab should auto-login again.
 */
export const SKIP_SSO_AUTO_LOGIN_KEY = "omniview:skip-sso-auto-login";

export interface AuthUser {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  /** Dashboard apps this user has been granted (deny-by-default; staff see
   * every app regardless - see src/apps/access.ts). */
  app_ids: string[];
}

export interface AuthConfig {
  auth_required: boolean;
  azure_enabled: boolean;
  azure_auto_login: boolean;
  /** Sign-in managed entirely outside the app (Databricks identity headers):
   * hide Sign out - the platform would immediately sign the user back in. */
  sso_managed: boolean;
}

/** The single /api/auth/session payload: config + the current user (or null). */
interface SessionResponse {
  config: AuthConfig;
  user: AuthUser | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  config: AuthConfig | null;
  /** True until the initial config + session probe has settled. */
  loading: boolean;
  /** Throws ApiError (401 on bad credentials); resolves once the session is live. */
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Fallback for components rendered without the provider (isolated tests):
// behaves like the signed-out, auth-not-required state.
const FALLBACK: AuthContextValue = {
  user: null,
  config: null,
  loading: false,
  login: async () => {
    throw new Error("AuthProvider is not mounted");
  },
  logout: async () => {
    throw new Error("AuthProvider is not mounted");
  },
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? FALLBACK;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // The unauthorized listener needs current values without re-subscribing.
  // Mirrored in an effect rather than assigned during render: writing a ref
  // mid-render is a side effect React may discard or replay. Both are only ever
  // read from the event handler below, which runs long after commit, so the
  // one-commit delay is not observable.
  const configRef = useRef(config);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    configRef.current = config;
    pathnameRef.current = pathname;
  }, [config, pathname]);

  // One round-trip: /session returns config + user (null when signed out) AND
  // sets the csrftoken cookie via @ensure_csrf_cookie. This replaces the old
  // strictly-serial /config -> /csrf -> /me waterfall (three round-trips before
  // the shell could paint). Django rotates the CSRF token on login and logout,
  // so re-calling this afterwards refreshes the cookie as well as the user.
  const refreshSession = useCallback(async () => {
    try {
      const s = await apiFetch<SessionResponse>("/api/auth/session");
      setConfig(s.config);
      setUser(s.user);
    } catch {
      // A failed probe leaves us signed-out; config stays whatever it was.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSession();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      if (!configRef.current?.auth_required) return;
      const current = pathnameRef.current ?? "/";
      if (current.startsWith("/login")) return;
      router.replace(`/login?next=${encodeURIComponent(current)}`);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  const login = useCallback(
    async (username: string, password: string) => {
      await apiFetch<AuthUser>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      // Login rotated the CSRF token; re-fetch it (and the user) before the
      // app makes any further write.
      await refreshSession();
    },
    [refreshSession],
  );

  const logout = useCallback(async () => {
    // Loop protection: without this, azure_auto_login would bounce the user
    // straight back into Microsoft SSO from the login page they land on.
    window.sessionStorage.setItem(SKIP_SSO_AUTO_LOGIN_KEY, "1");
    await apiFetch<void>("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    // Logout rotated the CSRF token; refreshSession re-fetches it (and confirms
    // the now-null user) in the same call.
    await refreshSession();
    router.replace("/login");
  }, [refreshSession, router]);

  return (
    <AuthContext.Provider value={{ user, config, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
