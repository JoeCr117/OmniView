import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch, apiUpload, pageParamsToSearch, UNAUTHORIZED_EVENT } from "./http";

function mockFetch(response: Partial<Response> & { jsonBody?: unknown } = {}) {
  const { jsonBody, ...rest } = response;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(jsonBody ?? {}),
    text: () => Promise.resolve(""),
    ...rest,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // jsdom cookies persist across tests; expire what we set.
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("apiFetch", () => {
  it("sends JSON content type for plain requests", async () => {
    const fetchMock = mockFetch({ jsonBody: { ok: true } });
    await apiFetch("/api/x", { method: "POST", body: "{}" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/x");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("leaves FormData bodies without a forced content type", async () => {
    const fetchMock = mockFetch();
    await apiFetch("/api/upload", { method: "POST", body: new FormData() });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers ?? {}).not.toHaveProperty("Content-Type");
  });

  it("throws with status and body on non-2xx", async () => {
    mockFetch({ ok: false, status: 422, text: () => Promise.resolve("bad payload") });
    await expect(apiFetch("/api/x")).rejects.toThrow("API /api/x failed: 422 bad payload");
  });

  it("exposes the status on the thrown ApiError", async () => {
    mockFetch({ ok: false, status: 401, text: () => Promise.resolve("") });
    const error = await apiFetch("/api/x").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it("always sends credentials so session cookies ride along", async () => {
    const fetchMock = mockFetch();
    await apiFetch("/api/x");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("attaches the CSRF cookie as X-CSRFToken on unsafe methods", async () => {
    document.cookie = "csrftoken=tok-123";
    const fetchMock = mockFetch();
    await apiFetch("/api/x", { method: "PUT", body: "{}" });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok-123");
  });

  it("does not attach a CSRF header on GET or when the cookie is missing", async () => {
    document.cookie = "csrftoken=tok-123";
    const fetchMock = mockFetch();
    await apiFetch("/api/x");
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("X-CSRFToken");

    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    await apiFetch("/api/x", { method: "POST", body: "{}" });
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty("X-CSRFToken");
  });

  it("dispatches the unauthorized event on 401", async () => {
    mockFetch({ ok: false, status: 401, text: () => Promise.resolve("") });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await expect(apiFetch("/api/x")).rejects.toThrow();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch the unauthorized event on other errors", async () => {
    mockFetch({ ok: false, status: 500, text: () => Promise.resolve("boom") });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await expect(apiFetch("/api/x")).rejects.toThrow();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it("resolves undefined for 204 responses instead of parsing JSON", async () => {
    mockFetch({ status: 204, json: () => Promise.reject(new Error("no body")) });
    await expect(apiFetch("/api/auth/csrf")).resolves.toBeUndefined();
  });
});

/**
 * A minimal XMLHttpRequest stand-in that lets a test drive upload-progress and
 * completion. jsdom's XHR can't simulate an upload, and `apiUpload` exists
 * precisely because fetch can't report upload progress - so it needs XHR.
 */
class FakeXhr {
  status = 0;
  responseText = "";
  withCredentials = false;
  headers: Record<string, string> = {};
  upload = { listeners: {} as Record<string, (e: unknown) => void> };
  listeners: Record<string, () => void> = {};
  sent: unknown = null;

  open() {}
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  addEventListener(type: string, cb: () => void) {
    this.listeners[type] = cb;
  }
  send(body: unknown) {
    this.sent = body;
  }
  // apiUpload registers upload.addEventListener; installFakeXhr routes those
  // callbacks into this map so a test can fire progress/load events by hand.
  uploadListeners: Record<string, (e: unknown) => void> = {};
  finish(status: number, responseText = "") {
    this.status = status;
    this.responseText = responseText;
    this.listeners.load?.();
  }
}

function installFakeXhr(): FakeXhr {
  const xhr = new FakeXhr();
  // Route upload.addEventListener into our own map.
  (xhr.upload as unknown as { addEventListener: (t: string, cb: (e: unknown) => void) => void })
    .addEventListener = (type, cb) => {
    xhr.uploadListeners[type] = cb;
  };
  // A plain function (not an arrow) so `new XMLHttpRequest()` works - it returns
  // our single instance regardless of `new`.
  vi.stubGlobal("XMLHttpRequest", function XMLHttpRequestStub() {
    return xhr;
  });
  return xhr;
}

describe("apiUpload", () => {
  it("resolves parsed JSON, sends credentials, and carries the CSRF header", async () => {
    document.cookie = "csrftoken=upl-tok";
    const xhr = installFakeXhr();
    const promise = apiUpload<{ ok: boolean }>("/api/x/upload", new FormData());
    xhr.finish(200, JSON.stringify({ ok: true }));
    await expect(promise).resolves.toEqual({ ok: true });
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers["X-CSRFToken"]).toBe("upl-tok");
  });

  it("reports byte progress, then flips to indeterminate when the bytes are up", async () => {
    const xhr = installFakeXhr();
    const seen: (number | null)[] = [];
    const promise = apiUpload("/api/x/upload", new FormData(), (f) => seen.push(f));
    xhr.uploadListeners.progress?.({ lengthComputable: true, loaded: 50, total: 200 });
    xhr.uploadListeners.load?.(undefined);
    xhr.finish(200, "{}");
    await promise;
    expect(seen).toEqual([0.25, null]);
  });

  it("rejects with an ApiError on a non-2xx status", async () => {
    const xhr = installFakeXhr();
    const promise = apiUpload("/api/x/upload", new FormData());
    xhr.finish(409, "duplicate");
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });

  it("dispatches the unauthorized event on 401", async () => {
    const xhr = installFakeXhr();
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    const promise = apiUpload("/api/x/upload", new FormData());
    xhr.finish(401, "");
    await promise.catch(() => undefined);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("pageParamsToSearch", () => {
  it("serializes limit/offset and skips undefined", () => {
    expect(pageParamsToSearch({ limit: 25, offset: 50 }).toString()).toBe("limit=25&offset=50");
    expect(pageParamsToSearch({}).toString()).toBe("");
    expect(pageParamsToSearch().toString()).toBe("");
  });
});
