import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { __clearResourceCache } from "@/lib/useResource";

import { UsersTable } from "./UsersTable";

/**
 * Access administration, so the interesting assertions are the refusals: an
 * admin's per-app switch is on and locked (staff bypass grants entirely), and
 * nobody can demote themselves. Both are re-checked by the backend - `set_admin`
 * raises on self-demotion and `AppAccessAuth` short-circuits on `is_staff` - and
 * these cover the half of that contract the UI is responsible for stating.
 */

const api = vi.hoisted(() => ({
  getUsers: vi.fn(),
  grantApp: vi.fn(),
  revokeApp: vi.fn(),
  setAdmin: vi.fn(),
}));

vi.mock("../lib/api", () => api);
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { username: "me" } }),
}));

function user(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    username: "someone",
    email: "someone@example.com",
    is_staff: false,
    app_ids: [] as string[],
    last_login: null,
    date_joined: "2026-01-01T00:00:00Z",
    is_active: true,
    ...overrides,
  };
}

function respondWith(items: ReturnType<typeof user>[]) {
  api.getUsers.mockResolvedValue({ items, count: items.length });
}

async function renderTable() {
  render(<UsersTable />);
  await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
}

/** KpiCard renders the label and its value as siblings under one header. */
function kpiCard(label: string) {
  return screen.getByText(label).parentElement as HTMLElement;
}

beforeEach(() => {
  // useResource caches at module scope and every test here hits the same key
  // ("admin-portal:users:0:"), so without this each test paints its predecessor's
  // rows and the assertions read the wrong table.
  __clearResourceCache();
  vi.clearAllMocks();
  api.grantApp.mockResolvedValue(undefined);
  api.revokeApp.mockResolvedValue(undefined);
  api.setAdmin.mockResolvedValue(undefined);
});

describe("an ordinary user's app access", () => {
  it("grants when switched on", async () => {
    respondWith([user({ id: 7, username: "mapper" })]);
    await renderTable();

    const [firstApp] = screen.getAllByRole("switch", { name: /access for mapper$/ });
    await userEvent.click(firstApp);

    expect(api.grantApp).toHaveBeenCalledWith(7, expect.any(String));
    expect(api.revokeApp).not.toHaveBeenCalled();
  });

  it("revokes when switched off", async () => {
    respondWith([user({ id: 7, username: "mapper", app_ids: ["expense-tracker"] })]);
    await renderTable();

    await userEvent.click(
      screen.getByRole("switch", { name: "Expense Tracker access for mapper" }),
    );

    expect(api.revokeApp).toHaveBeenCalledWith(7, "expense-tracker");
    expect(api.grantApp).not.toHaveBeenCalled();
  });

  it("reports a failed change instead of silently reverting", async () => {
    respondWith([user({ id: 7, username: "mapper" })]);
    api.grantApp.mockRejectedValue(new Error("403 Forbidden"));
    await renderTable();

    const [firstApp] = screen.getAllByRole("switch", { name: /access for mapper$/ });
    await userEvent.click(firstApp);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Change failed:"),
    );
  });
});

describe("an admin's app access", () => {
  it("reads as granted and cannot be toggled, because staff bypass access entirely", async () => {
    respondWith([user({ id: 3, username: "boss", is_staff: true, app_ids: [] })]);
    await renderTable();

    const [firstApp] = screen.getAllByRole("switch", { name: /access for boss$/ });

    expect(firstApp).toBeChecked();
    expect(firstApp).toBeDisabled();
    expect(firstApp).toHaveAttribute("title", "Admins always have access");
  });
});

describe("self-demotion", () => {
  it("is refused for the signed-in user", async () => {
    respondWith([user({ id: 1, username: "me", is_staff: true })]);
    await renderTable();

    const adminSwitch = screen.getByRole("switch", { name: "Admin status for me" });

    expect(adminSwitch).toBeDisabled();
    expect(adminSwitch).toHaveAttribute("title", "You cannot demote yourself");
  });

  it("does not block promoting somebody else", async () => {
    respondWith([user({ id: 9, username: "other", is_staff: false })]);
    await renderTable();

    const adminSwitch = screen.getByRole("switch", { name: "Admin status for other" });
    expect(adminSwitch).not.toBeDisabled();

    await userEvent.click(adminSwitch);

    expect(api.setAdmin).toHaveBeenCalledWith(9, true);
  });
});

describe("the KPI row", () => {
  it("counts admins and users holding any access on this page", async () => {
    respondWith([
      user({ id: 1, username: "boss", is_staff: true }),
      user({ id: 2, username: "granted", app_ids: ["expense-tracker"] }),
      user({ id: 3, username: "nobody" }),
    ]);
    await renderTable();

    expect(kpiCard("Admins (this page)")).toHaveTextContent("1");
    expect(kpiCard("With app access (this page)")).toHaveTextContent("2");
  });

  it("shows a placeholder for a user who has never signed in", async () => {
    respondWith([user({ last_login: null })]);
    await renderTable();

    expect(screen.getByText("never")).toBeInTheDocument();
  });
});
