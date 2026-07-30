import { describe, expect, it } from "vitest";

import { APPS, getApp } from "./registry";

describe("app registry", () => {
  it("has at least the Expense Tracker app", () => {
    expect(getApp("expense-tracker")).toBeDefined();
  });

  it("uses unique kebab-case ids", () => {
    const ids = APPS.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("gives every app a rooted basePath and non-empty metadata", () => {
    for (const app of APPS) {
      expect(app.basePath).toMatch(/^\//);
      expect(app.name).not.toBe("");
      expect(app.description).not.toBe("");
      expect(app.icon).toBeDefined();
    }
  });

  it("gives every app rooted, unique navItem hrefs", () => {
    for (const app of APPS) {
      const hrefs = app.navItems.map((item) => item.href);
      expect(hrefs.length).toBeGreaterThan(0);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const href of hrefs) {
        expect(href).toMatch(/^\//);
      }
    }
  });

  it("returns undefined for unknown app ids", () => {
    expect(getApp("nope")).toBeUndefined();
  });
});
