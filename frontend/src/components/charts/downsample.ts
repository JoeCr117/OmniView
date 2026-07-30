/**
 * Largest-Triangle-Three-Buckets.
 *
 * Daily Trends hands the chart every day of history - ~5,000 points - into a
 * chart a few hundred pixels wide. Drawing them all costs 5,000 SVG operations
 * to render something the eye reads as a line, and it wrecks interaction: with
 * more points than pixels, "the point under the cursor" stops being meaningful.
 *
 * Naive sampling (take every Nth) is wrong here, because it drops exactly what
 * matters: a one-day spike in a balance is real, and thinning it away lies about
 * the data. LTTB instead walks the series in buckets and keeps, from each, the
 * point forming the largest triangle with its neighbours - which is a cheap
 * proxy for "the point that most changes the shape of the line". Peaks and
 * troughs survive; flat stretches collapse.
 *
 * Crucially it *selects* points rather than averaging them, so every point still
 * on the chart is a real row from the database. The crosshair and tooltip
 * therefore always land on a day that actually happened.
 *
 * Reference: Sveinn Steinarsson, "Downsampling Time Series for Visual
 * Representation" (2013), §4.2.
 */
export function downsample<T>(
  data: readonly T[],
  threshold: number,
  getY: (point: T) => number,
): T[] {
  const n = data.length;
  // Below the threshold there is nothing to gain; below 3 the algorithm has no
  // interior buckets to choose from.
  if (threshold >= n || threshold < 3) return [...data];

  const sampled: T[] = [data[0]];
  // Bucket width, excluding the first and last points which are always kept.
  const every = (n - 2) / (threshold - 2);
  let a = 0; // Index of the point selected from the previous bucket.

  for (let i = 0; i < threshold - 2; i++) {
    // The *next* bucket's centre of mass, which the triangle reaches forward to.
    const nextStart = Math.floor((i + 1) * every) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
    let avgX = 0;
    let avgY = 0;
    let count = 0;
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += j;
      avgY += getY(data[j]);
      count++;
    }
    if (count > 0) {
      avgX /= count;
      avgY /= count;
    }

    // Pick the point in this bucket making the biggest triangle with the
    // previously kept point and that centre of mass.
    const rangeStart = Math.floor(i * every) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * every) + 1, n);
    const ax = a;
    const ay = getY(data[a]);

    let maxArea = -1;
    let maxIndex = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((ax - avgX) * (getY(data[j]) - ay) - (ax - j) * (avgY - ay)) / 2;
      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }

    sampled.push(data[maxIndex]);
    a = maxIndex;
  }

  sampled.push(data[n - 1]);
  return sampled;
}
