import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthConfig, AuthUser } from "@/lib/auth";

import ShellLayout from "./layout";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/apps/expense-tracker/check-book",
}));

const mockAuth: {
  user: AuthUser | null;
  config: AuthConfig | null;
  loading: boolean;
} = { user: null, config: null, loading: false };

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({ ...actual.useAuth(), ...mockAuth }),
  };
});

function renderShell() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ShellLayout>
        <div data-testid="app-content">app content</div>
      </ShellLayout>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  mockAuth.user = null;
  mockAuth.config = null;
  mockAuth.loading = false;
});

describe("ShellLayout auth gate", () => {
  it("shows a skeleton while the session probe is loading", () => {
    mockAuth.loading = true;
    renderShell();
    expect(screen.getByTestId("shell-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();
  });

  it("replaces to /login?next=... when auth is required and nobody is signed in", () => {
    mockAuth.config = { auth_required: true, azure_enabled: false, azure_auto_login: false, sso_managed: false };
    renderShell();
    expect(replace).toHaveBeenCalledWith(
      "/login?next=%2Fapps%2Fexpense-tracker%2Fcheck-book",
    );
    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();
  });

  it("renders the app when signed in", () => {
    mockAuth.config = { auth_required: true, azure_enabled: false, azure_auto_login: false, sso_managed: false };
    mockAuth.user = {
      username: "joseph",
      email: "",
      first_name: "",
      last_name: "",
      is_staff: true,
      app_ids: [],
    };
    renderShell();
    expect(screen.getByTestId("app-content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders the app anonymously when auth is not required", () => {
    mockAuth.config = { auth_required: false, azure_enabled: false, azure_auto_login: false, sso_managed: false };
    renderShell();
    expect(screen.getByTestId("app-content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
