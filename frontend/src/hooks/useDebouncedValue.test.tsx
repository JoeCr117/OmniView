import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "./useDebouncedValue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 300));
    expect(result.current).toBe("a");
  });

  it("only settles on the final value after the delay, collapsing a burst", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: "j" },
    });

    // Simulate fast typing: each change restarts the timer.
    for (const v of ["jo", "jos", "jose", "josep", "joseph"]) {
      rerender({ v });
      act(() => vi.advanceTimersByTime(100)); // < 300ms between keystrokes
    }
    // Nothing has settled yet - every change reset the timer before it fired.
    expect(result.current).toBe("j");

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("joseph");
  });
});
