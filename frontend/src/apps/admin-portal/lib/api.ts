/**
 * Typed client for the Admin Portal's API namespace (/api/admin-portal/*).
 * Every endpoint is staff-only (backend AdminAuth); non-staff get 403.
 * Transport concerns live in the shared @/lib/http core.
 */
import { apiFetch, pageParamsToSearch, type PageParams, type Paginated } from "@/lib/http";

export type { PageParams, Paginated };

const API = "/api/admin-portal";

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
  app_ids: string[];
}

export function getUsers(params?: { q?: string } & PageParams) {
  const qs = pageParamsToSearch(params);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<Paginated<AdminUser>>(`${API}/users${suffix}`);
}

export function grantApp(userId: number, appId: string) {
  return apiFetch<void>(`${API}/users/${userId}/apps/${encodeURIComponent(appId)}`, {
    method: "POST",
    body: "{}",
  });
}

export function revokeApp(userId: number, appId: string) {
  return apiFetch<void>(`${API}/users/${userId}/apps/${encodeURIComponent(appId)}`, {
    method: "DELETE",
  });
}

export function setAdmin(userId: number, isStaff: boolean) {
  return apiFetch<AdminUser>(`${API}/users/${userId}/admin`, {
    method: "POST",
    body: JSON.stringify({ is_staff: isStaff }),
  });
}

export interface JobRun {
  run_id: number;
  job_id: number | null;
  job_name: string;
  life_cycle_state: string;
  result_state: string | null;
  start_time: string | null;
  duration_ms: number | null;
  run_page_url: string | null;
}

export interface JobsOverview {
  counts: { jobs: number; running: number; completed: number; failed: number };
  running: JobRun[];
  completed: JobRun[];
  failed: JobRun[];
}

/** 503 => Databricks not connected; 403 => missing user-authorization scope
 * (or pending consent) - both surfaced with distinct UI states. */
export function getJobsOverview() {
  return apiFetch<JobsOverview>(`${API}/jobs/overview`);
}

export type CostDays = 7 | 30 | 90;

export interface CostsOverview {
  kpis: {
    days: number;
    total_dbus: number;
    /** List-price equivalent; on Free Edition the actual charge is $0. */
    list_cost_usd: number;
    top_sku: string | null;
  };
  daily: { date: string; dbus: number; list_cost_usd: number }[];
  by_sku: { sku: string; dbus: number; list_cost_usd: number }[];
}

export function getCostsOverview(days: CostDays) {
  return apiFetch<CostsOverview>(`${API}/costs/overview?days=${days}`);
}

export interface PortalOverview {
  users: { total: number; admins: number };
  connected: boolean;
  jobs: { running: number; failed: number } | null;
  dbus_30d: number | null;
}

/** Always 200s - Databricks KPIs degrade to null + connected=false. */
export function getPortalOverview() {
  return apiFetch<PortalOverview>(`${API}/overview`);
}
