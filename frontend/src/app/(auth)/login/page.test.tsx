import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SKIP_SSO_AUTO_LOGIN_KEY, type AuthConfig, type AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/http";

import LoginPage from "./page";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

const login = vi.fn<(username: string, password: string) => Promise<void>>();
const mockAuth: {
  user: AuthUser | null;
  config: AuthConfig | null;
  loading: boolean;
  login: typeof login;
  logout: () => Promise<void>;
} = {
  user: null,
  config: { auth_required: true, azure_enabled: false, azure_auto_login: false, sso_managed: false },
  loading: false,
  login,
  logout: async () => {},
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, useAuth: () => mockAuth };
});

// jsdom's window.location is unforgeable, hence the seam module.
const hardNavigate = vi.fn<(url: string) => void>();
vi.mock("@/lib/navigation", () => ({
  hardNavigate: (url: string) => hardNavigate(url),
}));

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Username"), "joseph");
  await userEvent.type(screen.getByLabelText("Password"), "hunter2");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  replace.mockClear();
  login.mockReset();
  hardNavigate.mockClear();
  window.sessionStorage.clear();
  search = "";
  mockAuth.user = null;
  mockAuth.config = { auth_required: true, azure_enabled: false, azure_auto_login: false, sso_managed: false };
});

describe("LoginPage", () => {
  it("renders the credentials form", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("submits credentials and routes to the sanitized next target", async () => {
    search = "next=/apps/expense-tracker/check-book";
    login.mockResolvedValue(undefined);
    render(<LoginPage />);
    await fillAndSubmit();
    expect(login).toHaveBeenCalledWith("joseph", "hunter2");
    expect(replace).toHaveBeenCalledWith("/apps/expense-tracker/check-book");
  });

  it("falls back to / for absolute or protocol-relative next targets", async () => {
    search = "next=//evil.example.com/phish";
    login.mockResolvedValue(undefined);
    render(<LoginPage />);
    await fillAndSubmit();
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("shows the invalid-credentials error on 401 and re-enables the form", async () => {
    login.mockRejectedValue(new ApiError(401, "API /api/auth/login failed: 401"));
    render(<LoginPage />);
    await fillAndSubmit();
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid username or password.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects immediately when already signed in", () => {
    search = "next=/apps/expense-tracker/daily-trends";
    mockAuth.user = {
      username: "joseph",
      email: "",
      first_name: "",
      last_name: "",
      is_staff: true,
      app_ids: [],
    };
    render(<LoginPage />);
    expect(replace).toHaveBeenCalledWith("/apps/expense-tracker/daily-trends");
  });

  it("hides the Microsoft button until azure is enabled", () => {
    const { unmount } = render(<LoginPage />);
    expect(screen.queryByText("Sign in with Microsoft")).not.toBeInTheDocument();
    unmount();

    mockAuth.config = { auth_required: true, azure_enabled: true, azure_auto_login: false, sso_managed: false };
    render(<LoginPage />);
    expect(screen.getByText("Sign in with Microsoft")).toHaveAttribute(
      "href",
      "/accounts/microsoft/login/?next=%2F",
    );
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("carries the sanitized next target on the Microsoft anchor", () => {
    search = "next=/apps/expense-tracker/check-book";
    mockAuth.config = { auth_required: true, azure_enabled: true, azure_auto_login: false, sso_managed: false };
    render(<LoginPage />);
    expect(screen.getByText("Sign in with Microsoft")).toHaveAttribute(
      "href",
      "/accounts/microsoft/login/?next=%2Fapps%2Fexpense-tracker%2Fcheck-book",
    );
  });

  it("auto-navigates into the Microsoft flow when azure_auto_login is on", () => {
    search = "next=/apps/expense-tracker/check-book";
    mockAuth.config = { auth_required: true, azure_enabled: true, azure_auto_login: true, sso_managed: false };
    render(<LoginPage />);
    expect(hardNavigate).toHaveBeenCalledWith(
      "/accounts/microsoft/login/?next=%2Fapps%2Fexpense-tracker%2Fcheck-book",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Redirecting to Microsoft sign-in...",
    );
  });

  it("skips auto-login when ?auto=0", () => {
    search = "auto=0";
    mockAuth.config = { auth_required: true, azure_enabled: true, azure_auto_login: true, sso_managed: false };
    render(<LoginPage />);
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("skips auto-login right after a logout (sessionStorage flag)", () => {
    window.sessionStorage.setItem(SKIP_SSO_AUTO_LOGIN_KEY, "1");
    mockAuth.config = { auth_required: true, azure_enabled: true, azure_auto_login: true, sso_managed: false };
    render(<LoginPage />);
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("skips auto-login while already signed in", () => {
    mockAuth.user = {
      username: "joseph",
      email: "",
      first_name: "",
      last_name: "",
      is_staff: true,
      app_ids: [],
    };
    mockAuth.config = { auth_required: true, azure_enabled: true, azure_auto_login: true, sso_managed: false };
    render(<LoginPage />);
    expect(hardNavigate).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("re-arms auto-login when the Microsoft button is clicked deliberately", async () => {
    window.sessionStorage.setItem(SKIP_SSO_AUTO_LOGIN_KEY, "1");
    mockAuth.config = { auth_required: true, azure_enabled: true, azure_auto_login: true, sso_managed: false };
    render(<LoginPage />);
    const anchor = screen.getByText("Sign in with Microsoft");
    // jsdom cannot follow anchors - suppress its navigation attempt; the
    // flag clearing is the behavior under test.
    anchor.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(anchor);
    expect(window.sessionStorage.getItem(SKIP_SSO_AUTO_LOGIN_KEY)).toBeNull();
  });
});
