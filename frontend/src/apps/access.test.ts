import { describe, expect, it } from "vitest";

import type { AuthConfig, AuthUser } from "@/lib/auth";

import { visibleApps } from "./access";
import { APPS } from "./registry";

const CONFIG_ON: AuthConfig = {
  auth_required: true,
  azure_enabled: false,
  azure_auto_login: false,
  sso_managed: false,
};
const CONFIG_OFF: AuthConfig = { ...CONFIG_ON, auth_required: false };

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

describe("visibleApps", () => {
  it("shows everything when auth is not required (open mode)", () => {
    expect(visibleApps(null, CONFIG_OFF)).toEqual(APPS);
  });

  it("shows nothing when signed out", () => {
    expect(visibleApps(null, CONFIG_ON)).toEqual([]);
    expect(visibleApps(null, null)).toEqual([]);
  });

  it("shows everything to staff, including admin-only apps", () => {
    const apps = visibleApps(user({ is_staff: true }), CONFIG_ON);
    expect(apps).toEqual(APPS);
    expect(apps.some((app) => app.id === "admin-portal")).toBe(true);
  });

  it("shows only granted, non-admin apps to regular users", () => {
    const apps = visibleApps(user({ app_ids: ["expense-tracker"] }), CONFIG_ON);
    expect(apps.map((app) => app.id)).toEqual(["expense-tracker"]);
  });

  it("never shows admin-only apps to regular users, even if 'granted'", () => {
    const apps = visibleApps(user({ app_ids: ["admin-portal"] }), CONFIG_ON);
    expect(apps).toEqual([]);
  });

  it("shows nothing to an ungranted regular user", () => {
    expect(visibleApps(user({}), CONFIG_ON)).toEqual([]);
  });
});
