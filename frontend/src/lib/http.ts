/**
 * Shared fetch core for every OmniView app. Always uses relative paths
 * (same-origin) - Django serves both the static export and /api/ in
 * production, and CORS handles the dev-server-to-dev-server case. This
 * avoids baking an environment-specific base URL into the static export at
 * build time.
 *
 * Session handling lives here so apps never touch it: cookies always ride
 * along (credentials: "include" covers the cross-origin dev pair), unsafe
 * methods carry Django's CSRF token from the csrftoken cookie, and any 401
 * dispatches UNAUTHORIZED_EVENT for the AuthProvider to route to /login.
 */

export const UNAUTHORIZED_EVENT = "omniview:unauthorized";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const entry = document.cookie
    .split("; ")
    .find((candidate) => candidate.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  // FormData bodies (file uploads) must let the browser set its own
  // multipart/form-data boundary - forcing application/json here would
  // break the upload.
  const isFormData = init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const method = (init?.method ?? "GET").toUpperCase();
  if (UNSAFE_METHODS.has(method)) {
    const token = readCookie("csrftoken");
    if (token) headers["X-CSRFToken"] = token;
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { path } }));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, `API ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Upload a FormData body with progress reporting. `fetch` cannot report upload
 * progress (no hook on the request stream), so file uploads that want a real
 * percentage bar go through XMLHttpRequest instead - this is the one place we
 * reach past `apiFetch`. It keeps apiFetch's contract otherwise: same-origin,
 * credentials on, the CSRF header from the cookie, the 401 event, and an
 * ApiError on non-2xx.
 *
 * `onProgress` receives a fraction in [0, 1], or is called with `null` once the
 * request switches to indeterminate (upload done, server still working).
 */
export function apiUpload<T>(
  path: string,
  body: FormData,
  onProgress?: (fraction: number | null) => void,
): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}${path}`);
    xhr.withCredentials = true; // the credentials: "include" equivalent
    const token = readCookie("csrftoken");
    if (token) xhr.setRequestHeader("X-CSRFToken", token);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(event.total ? event.loaded / event.total : 0);
    });
    // Bytes are on the wire; the server is now parsing/validating. Flip the bar
    // to indeterminate rather than letting it sit at 100% looking stuck.
    xhr.upload.addEventListener("load", () => onProgress?.(null));

    xhr.addEventListener("load", () => {
      if (xhr.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { path } }));
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText ? (JSON.parse(xhr.responseText) as T) : (undefined as T));
      } else {
        reject(new ApiError(xhr.status, `API ${path} failed: ${xhr.status} ${xhr.responseText}`));
      }
    });
    xhr.addEventListener("error", () =>
      reject(new ApiError(0, `API ${path} failed: network error`)),
    );
    xhr.send(body);
  });
}

export interface Paginated<T> {
  items: T[];
  count: number;
}

export interface PageParams {
  limit?: number;
  offset?: number;
}

export function pageParamsToSearch(params?: PageParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  if (params?.offset !== undefined) qs.set("offset", String(params.offset));
  return qs;
}
