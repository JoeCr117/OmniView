import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthConfig, AuthUser } from "@/lib/auth";

import { UserMenu } from "./UserMenu";

const logout = vi.fn(async () => {});
const mockAuth: { user: AuthUser | null; config: AuthConfig | null; logout: typeof logout } = {
  user: null,
  config: null,
  logout,
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({ ...actual.useAuth(), ...mockAuth }),
  };
});

function renderMenu() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <UserMenu />
    </ThemeProvider>,
  );
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "Open user menu" }));
  return screen.findByRole("menu");
}

describe("UserMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
    logout.mockClear();
    mockAuth.user = null;
    mockAuth.config = null;
  });

  it("opens the profile flyout", async () => {
    renderMenu();
    await openMenu();
    expect(screen.getByRole("menuitem", { name: /dark mode/i })).toBeInTheDocument();
  });

  it("toggles dark mode from the menu item and persists it", async () => {
    renderMenu();
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /dark mode/i }));
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("toggles back to light on a second activation", async () => {
    renderMenu();
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /dark mode/i }));
    // onSelect preventDefault keeps the menu open for the second click.
    await userEvent.click(screen.getByRole("menuitem", { name: /dark mode/i }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("shows the signed-out placeholder without a sign-out item", async () => {
    renderMenu();
    await openMenu();
    expect(screen.getByText("Local user")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("shows the signed-in identity with initials and email", async () => {
    mockAuth.user = {
      username: "joseph",
      email: "joseph@example.com",
      first_name: "Joseph",
      last_name: "Crawford",
      is_staff: true,
      app_ids: [],
    };
    renderMenu();
    expect(screen.getByText("JC")).toBeInTheDocument(); // avatar initials
    await openMenu();
    expect(screen.getByText("joseph")).toBeInTheDocument();
    expect(screen.getByText("joseph@example.com")).toBeInTheDocument();
  });

  it("falls back to username initials and offers sign out", async () => {
    mockAuth.user = {
      username: "joseph",
      email: "",
      first_name: "",
      last_name: "",
      is_staff: false,
      app_ids: [],
    };
    renderMenu();
    expect(screen.getByText("JO")).toBeInTheDocument();
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("hides sign out when sign-in is platform-managed (sso_managed)", async () => {
    mockAuth.user = {
      username: "joseph",
      email: "joseph@example.com",
      first_name: "",
      last_name: "",
      is_staff: false,
      app_ids: [],
    };
    mockAuth.config = {
      auth_required: true,
      azure_enabled: false,
      azure_auto_login: false,
      sso_managed: true,
    };
    renderMenu();
    await openMenu();
    expect(screen.getByText("joseph@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /sign out/i })).not.toBeInTheDocument();
  });
});
