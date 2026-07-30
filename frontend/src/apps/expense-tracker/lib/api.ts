/**
 * Typed client for the ExpenseTracker app's own API namespace
 * (/api/expense-tracker/*). Transport concerns (base URL, headers, errors,
 * and - from M6 - session/CSRF) live in the shared @/lib/http core.
 */
import {
  apiFetch,
  apiUpload,
  pageParamsToSearch,
  type PageParams,
  type Paginated,
} from "@/lib/http";

export type { PageParams, Paginated };

const API = "/api/expense-tracker";

export interface DailyMetric {
  date_sk: number;
  calendar_date: string;
  credit_card_transaction_total: number | null;
  credit_card_balance: number | null;
  free_checking_transaction_total: number | null;
  free_checking_balance: number | null;
  money_market_transaction_total: number | null;
  money_market_balance: number | null;
  savings_transaction_total: number | null;
  savings_balance: number | null;
  transaction_total: number | null;
  total_balance: number | null;
  no_transactions_flag: number | null;
}

export function getDailyMetrics(params?: { start?: string; end?: string } & PageParams) {
  const qs = pageParamsToSearch(params);
  if (params?.start) qs.set("start", params.start);
  if (params?.end) qs.set("end", params.end);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<Paginated<DailyMetric>>(`${API}/dailymetrics${suffix}`);
}

/**
 * The whole daily-metrics history as a flat array. Check Book and Daily Trends
 * both want every row (they slice/plot client-side), so they share this one
 * fetcher under DAILY_METRICS_KEY - useResource then fetches the ~5,000-row
 * payload once and serves both pages (and either tab's revisit) from cache.
 */
export const DAILY_METRICS_KEY = "expense-tracker:dailymetrics:all";

export async function getAllDailyMetrics(): Promise<DailyMetric[]> {
  const res = await getDailyMetrics({ limit: 5000 });
  return res.items;
}

export interface UncategorizedTransaction {
  date_sk: number;
  account_type: string;
  calendar_date: string;
  transaction_description: string;
  transaction_amount: number;
}

export function getUncategorizedTransactions(
  params?: { start?: string; end?: string } & PageParams,
) {
  const qs = pageParamsToSearch(params);
  if (params?.start) qs.set("start", params.start);
  if (params?.end) qs.set("end", params.end);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<Paginated<UncategorizedTransaction>>(
    `${API}/transactions/uncategorized${suffix}`,
  );
}

/** Arbitrary-depth: leaves are string-match lists, intermediate nodes nest further. */
export type BudgetMapTypeNode = { [key: string]: string[] | BudgetMapTypeNode };

export interface BudgetMapSubCategory {
  Budget?: number;
  Type?: BudgetMapTypeNode;
}

export interface BudgetMapCategory {
  Budget?: number;
  SubCategories?: Record<string, BudgetMapSubCategory>;
}

export type BudgetMapYaml = Record<string, BudgetMapCategory>;

export function getBudgetMapYaml(bank = "Golden1") {
  return apiFetch<BudgetMapYaml>(`${API}/budgets/yaml?bank=${encodeURIComponent(bank)}`);
}

export function putBudgetMapYaml(data: BudgetMapYaml, bank = "Golden1") {
  return apiFetch<{ status: string }>(`${API}/budgets/yaml?bank=${encodeURIComponent(bank)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export interface RebuildResult {
  status: string;
  stdout: string;
  stderr: string;
  returncode: number | null;
}

export function triggerRebuild() {
  return apiFetch<RebuildResult>(`${API}/budgets/rebuild`, { method: "POST", body: "{}" });
}

export function getRawAccounts(bank = "Golden1") {
  return apiFetch<string[]>(`${API}/rawdata/accounts?bank=${encodeURIComponent(bank)}`);
}

export function getRawCsvFiles(account: string, bank = "Golden1") {
  return apiFetch<string[]>(
    `${API}/rawdata/${encodeURIComponent(account)}/files?bank=${encodeURIComponent(bank)}`,
  );
}

/** Raw CSV rows, keyed by whatever headers that file happens to have - not normalized. */
export function getRawCsvRows(account: string, filename: string, bank = "Golden1") {
  const qs = new URLSearchParams({ filename, bank });
  return apiFetch<Record<string, string>[]>(
    `${API}/rawdata/${encodeURIComponent(account)}/csv?${qs.toString()}`,
  );
}

export interface UploadResult {
  status: string;
  filename: string;
}

/**
 * Upload a CSV, optionally reporting progress. Goes through apiUpload (XHR) so
 * `onProgress` can fire with the byte fraction during the send and `null` once
 * the bytes are up and the server is validating - `fetch` can't report either.
 */
export function uploadRawCsv(
  account: string,
  file: File,
  onProgress?: (fraction: number | null) => void,
  bank = "Golden1",
) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<UploadResult>(
    `${API}/rawdata/${encodeURIComponent(account)}/upload?bank=${encodeURIComponent(bank)}`,
    form,
    onProgress,
  );
}

/** Whether an ETL rebuild is currently running server-side (a synchronous
 *  POST /budgets/rebuild in flight, possibly from another tab or before a
 *  reload). Lets the Budget Map page reconnect its progress UI on mount rather
 *  than looking idle while a multi-minute rebuild is underway. */
export function getRebuildStatus() {
  return apiFetch<{ running: boolean }>(`${API}/budgets/rebuild/status`);
}
