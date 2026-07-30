import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Apps must not reach into each other.
 *
 * This is not hypothetical: the Admin Portal used to import AsyncState, Pager
 * and LineChart out of `@/apps/expense-tracker/components/`, which meant
 * deleting ExpenseTracker would have broken the Admin Portal. Anything two apps
 * need belongs in `@/components/common` (or `charts`/`ui`); anything under
 * `@/apps/<id>/` belongs to that app alone.
 *
 * Each zone below lets an app import from itself while barring its siblings, so
 * a new app needs a new entry here. `zones` can't express "any app except my
 * own" in one rule, hence the repetition.
 */
const appIds = ["expense-tracker", "omni-erd", "admin-portal"];

const crossAppImportZones = appIds.map((id) => ({
  target: `./src/apps/${id}/**`,
  from: "./src/apps",
  except: [`./${id}`, "./registry.ts", "./access.ts"],
  message:
    "Apps must not import from other apps. Promote shared code to src/components/common (or charts/ui), or keep it inside your own app package.",
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "import/no-restricted-paths": ["error", { zones: crossAppImportZones }],
      // The app-router pages under src/app/(shell)/apps/<id>/ are the one place
      // that may pull in an app's own components; they are that app's pages.
      // Everything else is covered by the zones above.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/apps/*/components/*", "@/apps/*/lib/*"],
              importNames: ["TabulatorTable"],
              message:
                "TabulatorTable moved to @/components/common/DataTable when it became cross-app.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
