import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBudgetMapYaml,
  getDailyMetrics,
  getRawCsvRows,
  triggerRebuild,
  uploadRawCsv,
} from "./api";

function mockFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("expense-tracker api client", () => {
  it("namespaces dailymetrics under /api/expense-tracker", async () => {
    const fetchMock = mockFetch();
    await getDailyMetrics({ limit: 5, start: "2024-01-01" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/expense-tracker/dailymetrics?limit=5&start=2024-01-01",
    );
  });

  it("namespaces budgets endpoints", async () => {
    const fetchMock = mockFetch();
    await getBudgetMapYaml();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/expense-tracker/budgets/yaml?bank=Golden1");
  });

  it("namespaces the rebuild trigger", async () => {
    const fetchMock = mockFetch();
    await triggerRebuild();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/expense-tracker/budgets/rebuild");
    expect(init.method).toBe("POST");
  });

  it("URL-encodes rawdata path and query pieces", async () => {
    const fetchMock = mockFetch();
    await getRawCsvRows("Credit Card", "my file.csv");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/expense-tracker/rawdata/Credit%20Card/csv?filename=my+file.csv&bank=Golden1",
    );
  });

  it("uploads CSVs as multipart FormData over XHR (for progress reporting)", async () => {
    // uploadRawCsv goes through apiUpload (XHR), not fetch, because fetch can't
    // report upload progress. Drive a minimal fake XHR to capture the request.
    const xhr = {
      opened: [] as string[],
      body: null as unknown,
      status: 0,
      responseText: "",
      withCredentials: false,
      upload: { addEventListener: () => {} },
      listeners: {} as Record<string, () => void>,
      open(method: string, url: string) {
        this.opened = [method, url];
      },
      setRequestHeader() {},
      addEventListener(type: string, cb: () => void) {
        this.listeners[type] = cb;
      },
      send(body: unknown) {
        this.body = body;
        this.status = 200;
        this.responseText = "{}";
        this.listeners.load?.();
      },
    };
    vi.stubGlobal("XMLHttpRequest", function XMLHttpRequestStub() {
      return xhr;
    });

    const file = new File(["Date,Amount\n"], "jan.csv", { type: "text/csv" });
    await uploadRawCsv("Savings", file);
    expect(xhr.opened).toEqual(["POST", "/api/expense-tracker/rawdata/Savings/upload?bank=Golden1"]);
    expect(xhr.body).toBeInstanceOf(FormData);
  });
});
