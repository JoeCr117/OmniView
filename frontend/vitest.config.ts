import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Resolves the tsconfig "@/*" path alias natively (Vite 7+) - no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Capped because coverage is a *gate*, and an unbounded worker pool made it
    // non-deterministic: with one worker per core, each carrying its own V8 heap
    // plus jsdom plus coverage instrumentation, workers died with "Zone
    // Allocation failed - process out of memory". A dead worker reports no
    // coverage for its files, so the run came back ~51% instead of ~57% and
    // failed the threshold - roughly one run in four, with nothing wrong in the
    // code. Four workers is stable here and costs about a second.
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/components/ui/**"],
      // Measured at adoption, not chosen. These may only go up. `src/components/ui/`
      // is excluded above as vendored shadcn primitives - covering them would
      // measure the library, not this codebase.
      //
      // `include` above is what makes these honest. Without it v8 reports only
      // files a test already imports, which scored this same tree at 86% - a
      // denominator that improves when you delete a test. 52% is the real figure.
      // Ratcheted to the Breakdown feature's measured figures (Phase 11 M7),
      // one point under each to leave room for ordinary noise rather than for
      // regression.
      thresholds: {
        statements: 59,
        branches: 55,
        functions: 55,
        lines: 59,
      },
    },
  },
});
