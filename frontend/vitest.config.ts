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
      thresholds: {
        statements: 51,
        branches: 47,
        functions: 46,
        lines: 51,
      },
    },
  },
});
