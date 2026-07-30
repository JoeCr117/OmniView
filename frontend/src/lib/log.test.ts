import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import log, { reportClientError, resetShipperForTests, shipLog } from "./log";

function stubFetch(impl?: (url: string, init?: RequestInit) => Promise<unknown>) {
  const fetchMock = vi.fn(
    impl ??
      (async () => ({ ok: true, status: 204, json: async () => undefined, text: async () => "" })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetShipperForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  log.setLevel("debug", false);
});

describe("log level filtering", () => {
  it("silences below-threshold levels and keeps the rest", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    log.setLevel("warn", false); // rebinding happens here, after the spies
    log.info("quiet");
    log.error("loud");
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("loud");
  });
});

describe("shipLog", () => {
  it("POSTs the entry with credentials and the CSRF cookie header", async () => {
    document.cookie = "csrftoken=tok123";
    const fetchMock = stubFetch();
    await shipLog({ level: "error", message: "boom", source: "test", url: "/x" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/logs/frontend");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok123");
    expect(JSON.parse(init.body as string)).toMatchObject({
      level: "error",
      message: "boom",
      source: "test",
      url: "/x",
    });
  });

  it("truncates fields to the server's caps instead of 422ing", async () => {
    const fetchMock = stubFetch();
    await shipLog({ level: "error", message: "m".repeat(5000), stack: "s".repeat(9000) });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.message).toHaveLength(4000);
    expect(body.stack).toHaveLength(8000);
  });

  it("drops entries while a shipment is in flight (re-entrancy guard)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = stubFetch(async () => {
      await gate;
      return { ok: true, status: 204 };
    });
    const first = shipLog({ level: "error", message: "first" });
    await shipLog({ level: "error", message: "second (dropped)" });
    release();
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after the per-pageload budget", async () => {
    const fetchMock = stubFetch();
    for (let i = 0; i < 25; i += 1) {
      await shipLog({ level: "warn", message: `entry ${i}` });
    }
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it("swallows network failures (a failing pipeline must never throw)", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });
    await expect(
      shipLog({ level: "error", message: "boom" }),
    ).resolves.toBeUndefined();
  });
});

describe("reportClientError", () => {
  it("logs locally and ships message + source + stack", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    log.setLevel("debug", false); // rebind onto the spy
    const fetchMock = stubFetch();
    const failure = new Error("kaboom");
    reportClientError("shell-error-boundary", failure);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(consoleError).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      level: "error",
      message: "kaboom",
      source: "shell-error-boundary",
    });
    expect(body.stack).toContain("kaboom");
  });

  it("wraps non-Error rejection reasons", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    log.setLevel("debug", false);
    const fetchMock = stubFetch();
    reportClientError("window.unhandledrejection", "just a string");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.message).toBe("just a string");
  });
});
