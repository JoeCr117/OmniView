import { describe, expect, it } from "vitest";

import { downsample } from "./downsample";

interface P {
  i: number;
  v: number;
}

const flat = (n: number): P[] => Array.from({ length: n }, (_, i) => ({ i, v: 100 }));
const getY = (p: P) => p.v;

describe("downsample (LTTB)", () => {
  it("leaves a series alone when it is already small enough", () => {
    const data = flat(50);
    expect(downsample(data, 100, getY)).toEqual(data);
    expect(downsample(data, 50, getY)).toEqual(data);
  });

  it("reduces a long series to the threshold", () => {
    expect(downsample(flat(5000), 1000, getY)).toHaveLength(1000);
  });

  it("always keeps the first and last points, so the line still spans the range", () => {
    const data: P[] = Array.from({ length: 500 }, (_, i) => ({ i, v: i }));
    const out = downsample(data, 50, getY);
    expect(out[0]).toEqual(data[0]);
    expect(out[out.length - 1]).toEqual(data[499]);
  });

  it("keeps a one-day spike that naive every-Nth sampling would throw away", () => {
    const data = flat(1000);
    data[501] = { i: 501, v: 9999 }; // Deliberately not on a round stride.
    const out = downsample(data, 100, getY);

    expect(out).toContainEqual({ i: 501, v: 9999 });
    // ...which every-10th sampling would have missed entirely.
    const naive = data.filter((_, i) => i % 10 === 0);
    expect(naive).not.toContainEqual({ i: 501, v: 9999 });
  });

  it("returns real points, never invented averages", () => {
    const data: P[] = Array.from({ length: 900 }, (_, i) => ({ i, v: Math.sin(i / 10) * 50 }));
    const out = downsample(data, 120, getY);
    for (const point of out) {
      expect(data).toContainEqual(point); // Every point on the chart is a real row.
    }
  });

  it("preserves chronological order", () => {
    const data: P[] = Array.from({ length: 800 }, (_, i) => ({ i, v: Math.cos(i) * i }));
    const out = downsample(data, 90, getY);
    const indices = out.map((p) => p.i);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});
