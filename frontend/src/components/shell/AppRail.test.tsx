import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APPS } from "@/apps/registry";
import type { AuthConfig, AuthUser } from "@/lib/auth";

import { AppRail } from "./AppRail";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const mockAuth: { user: AuthUser | null; config: AuthConfig | null } = {
  user: null,
  config: null,
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({ ...actual.useAuth(), ...mockAuth }),
  };
});

// The default TabsContext value (no provider) sends every app to its front
// door, which is exactly the "nothing open yet" case.
const CONFIG_ON: AuthConfig = {
  auth_required: true,
  azure_enabled: false,
  azure_auto_login: false,
  sso_managed: false,
};

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    username: "u",
    email: "",
    first_name: "",
    last_name: "",
    is_staff: false,
    app_ids: [],
    ...overrides,
  };
}

describe("AppRail", () => {
  beforeEach(() => {
    mockAuth.user = null;
    mockAuth.config = null;
    pathname = "/";
  });

  it("lists Home plus every app for staff, without needing to be opened", () => {
    mockAuth.config = CONFIG_ON;
    mockAuth.user = user({ is_staff: true });
    render(<AppRail collapsed={false} />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    for (const app of APPS) {
      expect(screen.getByRole("link", { name: app.name })).toHaveAttribute("href", app.basePath);
    }
  });

  it("shows only granted apps to regular users (no Admin Portal)", () => {
    mockAuth.config = CONFIG_ON;
    mockAuth.user = user({ app_ids: ["expense-tracker"] });
    render(<AppRail collapsed={false} />);

    expect(screen.getByRole("link", { name: "Expense Tracker" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin Portal" })).not.toBeInTheDocument();
  });

  it("tells an ungranted user why the rail is empty", () => {
    mockAuth.config = CONFIG_ON;
    mockAuth.user = user({});
    render(<AppRail collapsed={false} />);

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Expense Tracker" })).not.toBeInTheDocument();
    expect(screen.getByText(/No apps granted yet/)).toBeInTheDocument();
  });

  it("shows every app when auth is not required (open mode)", () => {
    mockAuth.config = { ...CONFIG_ON, auth_required: false };
    render(<AppRail collapsed={false} />);
    for (const app of APPS) {
      expect(screen.getByRole("link", { name: app.name })).toBeInTheDocument();
    }
  });

  it("marks the app you are in as current", () => {
    mockAuth.config = CONFIG_ON;
    mockAuth.user = user({ is_staff: true });
    pathname = "/apps/admin-portal/costs";
    render(<AppRail collapsed={false} />);

    expect(screen.getByRole("link", { name: "Admin Portal" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Expense Tracker" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the names reachable as tooltips when collapsed to icons", () => {
    mockAuth.config = CONFIG_ON;
    mockAuth.user = user({ is_staff: true });
    render(<AppRail collapsed />);

    expect(screen.getByTitle("Expense Tracker")).toBeInTheDocument();
  });
});
