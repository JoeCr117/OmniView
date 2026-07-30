import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { __clearResourceCache, invalidateResource, useResource } from "./useResource";

afterEach(() => {
  __clearResourceCache();
  vi.restoreAllMocks();
});

function Probe<T>({ cacheKey, fetcher }: { cacheKey: string | null; fetcher: () => Promise<T> }) {
  const { data, status, isValidating, refetch } = useResource(cacheKey, fetcher);
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="validating">{String(isValidating)}</span>
      <span data-testid="data">{JSON.stringify(data ?? null)}</span>
      <button onClick={refetch}>refetch</button>
    </div>
  );
}

describe("useResource", () => {
  it("moves loading -> success and exposes the fetched data", async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    render(<Probe cacheKey="k1" fetcher={fetcher} />);

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
    expect(screen.getByTestId("data")).toHaveTextContent('{"n":1}');
  });

  it("serves a second consumer of the same key from cache without a second fetch", async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 2 });
    render(<Probe cacheKey="shared" fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));

    // A brand-new consumer of the same key paints immediately from cache.
    render(<Probe cacheKey="shared" fetcher={fetcher} />);
    expect(screen.getAllByTestId("status")[1]).toHaveTextContent("success");
    // Well inside the dedupe window: still exactly one network call.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the last data on screen while a refetch is in flight (no blanking)", async () => {
    let resolve!: (value: { n: number }) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ n: 1 })
      .mockImplementationOnce(() => new Promise((r) => (resolve = r)));

    render(<Probe cacheKey="k3" fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent('{"n":1}'));

    act(() => screen.getByText("refetch").click());
    // Mid-refetch: still "success" with the old data, but validating.
    expect(screen.getByTestId("status")).toHaveTextContent("success");
    expect(screen.getByTestId("data")).toHaveTextContent('{"n":1}');
    expect(screen.getByTestId("validating")).toHaveTextContent("true");

    await act(async () => resolve({ n: 2 }));
    expect(screen.getByTestId("data")).toHaveTextContent('{"n":2}');
    expect(screen.getByTestId("validating")).toHaveTextContent("false");
  });

  it("reports an error on a cold-start failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    render(<Probe cacheKey="k4" fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
  });

  it("fetches nothing while the key is null, then fetches once enabled", async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 5 });
    const { rerender } = render(<Probe cacheKey={null} fetcher={fetcher} />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    rerender(<Probe cacheKey="k5" fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after invalidateResource drops the cached value", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 9 });
    render(<Probe cacheKey="k6" fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent('{"n":1}'));

    act(() => invalidateResource("k6"));
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent('{"n":9}'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
