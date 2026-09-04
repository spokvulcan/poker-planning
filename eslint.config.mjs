import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import convexPlugin from "@convex-dev/eslint-plugin";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...convexPlugin.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      // Added as "error" in @convex-dev/eslint-plugin 4.0. Wants every
      // `db.get(id)` / `db.patch(id, ...)` / etc. rewritten to the explicit
      // `db.get("table", id)` form — ~200 call sites under convex/. Turned off
      // until that migration lands as its own change (#302).
      "@convex-dev/explicit-table-ids": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Convex generated files
    "convex/_generated/**",
    // playwright generated files
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    "playwright/.cache/**",
    // Claude Code local worktrees (ephemeral, not part of the repo)
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
