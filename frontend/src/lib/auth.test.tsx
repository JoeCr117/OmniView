import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, SKIP_SSO_AUTO_LOGIN_KEY, useAuth } from "./auth";
import { UNAUTHORIZED_EVENT } from "./http";

const replace = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
}));

interface RouteConfig {
  authRequired?: boolean;
  loggedIn?: boolean;
}

/** fetch stub answering the auth endpoints; records call order by path. */
function mockAuthFetch({ authRequired = true, loggedIn = false }: RouteConfig = {}) {
  const calls: string[] = [];
  const state = { loggedIn };
  const me = {
    username: "joseph",
    email: "joseph@example.com",
    first_name: "",
    last_name: "",
    is_staff: true,
    app_ids: [],
  };
  const config = {
    auth_required: authRequired,
    azure_enabled: false,
    azure_auto_login: false,
    sso_managed: false,
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
    // The shell now probes /session once (config + user + csrf cookie) instead
    // of the old /config -> /csrf -> /me waterfall.
    const text = async (): Promise<string> => "";
    if (url === "/api/auth/session") {
      return {
        ok: true,
        status: 200,
        json: async (): Promise<unknown> => ({ config, user: state.loggedIn ? me : null }),
        text,
      };
    }
    if (url === "/api/auth/login") {
      state.loggedIn = true;
      return { ok: true, status: 200, json: async (): Promise<unknown> => me, text };
    }
    if (url === "/api/auth/logout") {
      state.loggedIn = false;
      return { ok: true, status: 204, json: async (): Promise<unknown> => undefined, text };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

function Probe() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="who">{loading ? "loading" : (user?.username ?? "anon")}</span>
      <button onClick={() => void login("joseph", "pw")}>do-login</button>
      <button onClick={() => void logout()}>do-logout</button>
    </div>
  );
}

async function renderProvider(routes?: RouteConfig) {
  const { calls } = mockAuthFetch(routes);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  // Let the single mount probe (/session) settle.
  await screen.findByText(/anon|joseph/);
  return { calls };
}

beforeEach(() => {
  replace.mockClear();
  pathname = "/";
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthProvider", () => {
  it("settles anonymous from a single /session probe (no waterfall)", async () => {
    const { calls } = await renderProvider({ authRequired: false });
    expect(screen.getByTestId("who")).toHaveTextContent("anon");
    // One round-trip, not the old three (config -> csrf -> me).
    expect(calls).toEqual(["GET /api/auth/session"]);
  });

  it("exposes the signed-in user from the session probe", async () => {
    await renderProvider({ loggedIn: true });
    expect(screen.getByTestId("who")).toHaveTextContent("joseph");
  });

  it("re-probes /session after login (token rotation)", async () => {
    pathname = "/login";
    const { calls } = await renderProvider();
    calls.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "do-login" }));
    await screen.findByText("joseph");
    expect(calls).toEqual(["POST /api/auth/login", "GET /api/auth/session"]);
  });

  it("logout clears the user, re-probes /session, and routes to /login", async () => {
    const { calls } = await renderProvider({ loggedIn: true });
    calls.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "do-logout" }));
    await screen.findByText("anon");
    expect(calls).toEqual(["POST /api/auth/logout", "GET /api/auth/session"]);
    expect(replace).toHaveBeenCalledWith("/login");
    // SSO auto-login loop protection: the login page must not bounce the
    // user straight back into the Microsoft flow after a deliberate logout.
    expect(window.sessionStorage.getItem(SKIP_SSO_AUTO_LOGIN_KEY)).toBe("1");
  });

  it("routes to /login?next=... on the unauthorized event when auth is required", async () => {
    pathname = "/apps/expense-tracker/check-book";
    await renderProvider({ loggedIn: true });
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    expect(screen.getByTestId("who")).toHaveTextContent("anon");
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fapps%2Fexpense-tracker%2Fcheck-book");
  });

  it("ignores the unauthorized event when auth is not required or already on /login", async () => {
    await renderProvider({ authRequired: false });
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
