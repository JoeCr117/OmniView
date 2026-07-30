import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "@/components/shell/TabBar";
import type { AuthConfig, AuthUser } from "@/lib/auth";
import { TabsProvider, useTabs } from "@/lib/tabs";

let pathname = "/";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

const STAFF: AuthUser = {
  username: "u",
  email: "",
  first_name: "",
  last_name: "",
  is_staff: true,
  app_ids: [],
};

const mockAuth: { user: AuthUser | null; config: AuthConfig | null } = {
  user: STAFF,
  config: { auth_required: true, azure_enabled: false, azure_auto_login: false, sso_managed: false },
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({ ...actual.useAuth(), ...mockAuth }),
  };
});

function Probe() {
  const { tabs, activeAppId, hrefFor } = useTabs();
  return (
    <div>
      <span data-testid="order">{tabs.map((t) => t.appId).join(",")}</span>
      <span data-testid="active">{activeAppId ?? "none"}</span>
      <span data-testid="et-href">{hrefFor("expense-tracker")}</span>
    </div>
  );
}

function renderTabs() {
  return render(
    <TabsProvider>
      <TabBar />
      <Probe />
    </TabsProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
  pathname = "/";
  mockAuth.user = STAFF; // One test narrows this; don't let it leak into the next.
});

describe("tabs", () => {
  it("opens no tabs on the launcher", async () => {
    renderTabs();
    await waitFor(() => expect(screen.getByTestId("order")).toHaveTextContent(""));
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("opens a tab for whichever app the URL is in", async () => {
    pathname = "/apps/expense-tracker/check-book";
    renderTabs();
    await waitFor(() => expect(screen.getByTestId("order")).toHaveTextContent("expense-tracker"));
    expect(screen.getByTestId("active")).toHaveTextContent("expense-tracker");
    expect(screen.getByRole("tab", { name: /Expense Tracker/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("remembers where you were, so re-selecting the app returns you there", async () => {
    pathname = "/apps/expense-tracker/budget-map";
    renderTabs();
    await waitFor(() =>
      expect(screen.getByTestId("et-href")).toHaveTextContent("/apps/expense-tracker/budget-map"),
    );
  });

  it("keeps one tab per app, no matter how many of its pages you visit", async () => {
    pathname = "/apps/expense-tracker/check-book";
    const { rerender } = renderTabs();
    await waitFor(() => expect(screen.getByTestId("order")).toHaveTextContent("expense-tracker"));

    pathname = "/apps/expense-tracker/daily-trends";
    rerender(
      <TabsProvider>
        <TabBar />
        <Probe />
      </TabsProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("et-href")).toHaveTextContent("/apps/expense-tracker/daily-trends"),
    );
    expect(screen.getByTestId("order")).toHaveTextContent("expense-tracker");
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });

  it("adds a second tab when a second app is opened, preserving order", async () => {
    window.localStorage.setItem(
      "omniview:tabs",
      JSON.stringify([{ appId: "expense-tracker", href: "/apps/expense-tracker/check-book" }]),
    );
    pathname = "/apps/admin-portal/overview";
    renderTabs();

    await waitFor(() =>
      expect(screen.getByTestId("order")).toHaveTextContent("expense-tracker,admin-portal"),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("closing the focused tab navigates to the one that takes its place", async () => {
    window.localStorage.setItem(
      "omniview:tabs",
      JSON.stringify([
        { appId: "expense-tracker", href: "/apps/expense-tracker/check-book" },
        { appId: "admin-portal", href: "/apps/admin-portal/costs" },
      ]),
    );
    pathname = "/apps/expense-tracker/check-book";
    renderTabs();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    await userEvent.click(screen.getByRole("button", { name: "Close Expense Tracker" }));

    await waitFor(() => expect(screen.getByTestId("order")).toHaveTextContent("admin-portal"));
    expect(push).toHaveBeenCalledWith("/apps/admin-portal/costs");
  });

  it("closing the last tab falls back to the launcher", async () => {
    window.localStorage.setItem(
      "omniview:tabs",
      JSON.stringify([{ appId: "expense-tracker", href: "/apps/expense-tracker/check-book" }]),
    );
    pathname = "/apps/expense-tracker/check-book";
    renderTabs();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(1));

    await userEvent.click(screen.getByRole("button", { name: "Close Expense Tracker" }));

    expect(push).toHaveBeenCalledWith("/");
  });

  it("closing a background tab leaves you where you are", async () => {
    window.localStorage.setItem(
      "omniview:tabs",
      JSON.stringify([
        { appId: "expense-tracker", href: "/apps/expense-tracker/check-book" },
        { appId: "admin-portal", href: "/apps/admin-portal/costs" },
      ]),
    );
    pathname = "/apps/expense-tracker/check-book";
    renderTabs();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    await userEvent.click(screen.getByRole("button", { name: "Close Admin Portal" }));

    await waitFor(() => expect(screen.getByTestId("order")).toHaveTextContent("expense-tracker"));
    expect(push).not.toHaveBeenCalled();
  });

  it("drops tabs for apps the user may no longer see", async () => {
    window.localStorage.setItem(
      "omniview:tabs",
      JSON.stringify([
        { appId: "expense-tracker", href: "/apps/expense-tracker/check-book" },
        { appId: "admin-portal", href: "/apps/admin-portal/costs" },
      ]),
    );
    // A non-staff user granted only ExpenseTracker: the Admin Portal tab is
    // left over from someone else's session and must not survive.
    mockAuth.user = {
      username: "u",
      email: "",
      first_name: "",
      last_name: "",
      is_staff: false,
      app_ids: ["expense-tracker"],
    };
    pathname = "/";
    renderTabs();

    await waitFor(() => expect(screen.getByTestId("order")).toHaveTextContent("expense-tracker"));
    expect(screen.queryByRole("tab", { name: /Admin Portal/ })).not.toBeInTheDocument();
  });

  it("reorders tabs from the keyboard (drag's accessible equivalent)", async () => {
    window.localStorage.setItem(
      "omniview:tabs",
      JSON.stringify([
        { appId: "expense-tracker", href: "/apps/expense-tracker/check-book" },
        { appId: "admin-portal", href: "/apps/admin-portal/costs" },
      ]),
    );
    pathname = "/apps/admin-portal/costs";
    renderTabs();
    await waitFor(() =>
      expect(screen.getByTestId("order")).toHaveTextContent("expense-tracker,admin-portal"),
    );

    screen.getByRole("tab", { name: /Admin Portal/ }).focus();
    await userEvent.keyboard("{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}");

    await waitFor(() =>
      expect(screen.getByTestId("order")).toHaveTextContent("admin-portal,expense-tracker"),
    );
  });
});
