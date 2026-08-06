import type { LucideIcon } from "lucide-react";
import { Network, ShieldCheck, Wallet } from "lucide-react";

/**
 * The OmniView app registry - the single source of truth consumed by the
 * home launcher grid, the sidebar, and each app's local subnav.
 *
 * Adding a new app to the dashboard:
 *  1. Add an AppDefinition here (and, unless adminOnly, its id to
 *     backend/adminportal/models.py:GRANTABLE_APP_IDS so admins can grant it).
 *  2. Create its routes under `src/app/(shell)/apps/<id>/`.
 *  3. Mount its API router under `/api/<id>/` in backend/config/api.py with
 *     the matching auth (AppAccessAuth(id), or AdminAuth for admin-only).
 *
 * Visibility is deny-by-default: non-admin users only see apps they've been
 * granted (see src/apps/access.ts); the backend enforces the same rule.
 */
export interface AppNavItem {
  href: string;
  label: string;
  /** Shown only to OmniView admins (is_staff). Cosmetic - the page's API is
   * what enforces it. Deliberately no `id` field on this interface:
   * backend/shell/tests/test_registry.py greps `id: "..."` out of this file to
   * compare app ids across the two registries, and a nav item carrying one
   * would read as a phantom app. */
  adminOnly?: boolean;
}

export interface AppDefinition {
  /** Stable kebab-case identifier; matches the route and API namespace. */
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Where launching the app lands the user. */
  basePath: string;
  /** The app's own tab bar, rendered inside the viewport. */
  navItems: AppNavItem[];
  /** Visible/usable only by OmniView admins (is_staff); never grantable. */
  adminOnly?: boolean;
}

export const APPS: readonly AppDefinition[] = [
  {
    id: "expense-tracker",
    name: "Expense Tracker",
    description:
      "Budgets, balances and spending analytics built from your bank's CSV exports.",
    icon: Wallet,
    basePath: "/apps/expense-tracker/check-book",
    navItems: [
      { href: "/apps/expense-tracker/check-book", label: "Check Book" },
      { href: "/apps/expense-tracker/daily-trends", label: "Daily Trends" },
      { href: "/apps/expense-tracker/uncategorized", label: "Uncategorized" },
      { href: "/apps/expense-tracker/budget-map", label: "Budget Map" },
      { href: "/apps/expense-tracker/raw-csvs", label: "Raw CSVs" },
    ],
  },
  {
    id: "omni-erd",
    name: "Omni-ERD",
    description:
      "Entity-relationship diagrams for the databases behind OmniView, drawn from live catalog metadata.",
    icon: Network,
    basePath: "/apps/omni-erd/diagram",
    navItems: [
      { href: "/apps/omni-erd/diagram", label: "Diagram" },
      { href: "/apps/omni-erd/relationships", label: "Relationships", adminOnly: true },
    ],
  },
  {
    id: "admin-portal",
    name: "Admin Portal",
    description:
      "User access management, Databricks cost monitoring, job oversight and the OmniView API reference, for admins.",
    icon: ShieldCheck,
    basePath: "/apps/admin-portal/overview",
    adminOnly: true,
    navItems: [
      { href: "/apps/admin-portal/overview", label: "Overview" },
      { href: "/apps/admin-portal/users", label: "Users & Access" },
      { href: "/apps/admin-portal/costs", label: "Costs" },
      { href: "/apps/admin-portal/jobs", label: "Jobs" },
      { href: "/apps/admin-portal/api-docs", label: "API" },
    ],
  },
];

export function getApp(id: string): AppDefinition | undefined {
  return APPS.find((app) => app.id === id);
}

/**
 * Which app a URL belongs to, or null for the launcher and /login.
 *
 * Every app page lives under /apps/<id>/..., so the id is the third segment.
 * This is what tells the rail which entry to highlight and the tab bar which
 * tab to focus - neither of them is told, both derive it from where you are.
 */
export function appIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const [, apps, id] = pathname.split("/");
  if (apps !== "apps" || !id) return null;
  return APPS.some((app) => app.id === id) ? id : null;
}
