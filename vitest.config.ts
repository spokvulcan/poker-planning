import { defineConfig } from "vitest/config";
import path from "path";

// Two projects, split by environment:
//   - node:         pure unit tests in src/ (some mock node built-ins, e.g. fs)
//   - convex:       convex/ tests, including convex-test integration tests which
//                   require the edge-runtime environment.
// Pure convex unit tests (e.g. permissions, summarize) run fine under
// edge-runtime too, so the whole convex/ tree lives in one project.
export default defineConfig({
  resolve: {
    // Mirror tsconfig's `paths`: `@/convex/*` resolves into the convex/ tree
    // (so pure modules like summarize/scales/constants are importable from
    // src/ tests), everything else `@/*` resolves into src/. Order matters —
    // the more specific `@/convex` rule must be matched before the `@` rule.
    alias: [
      {
        find: /^@\/convex\/(.*)$/,
        replacement: path.resolve(__dirname, "./convex/$1"),
      },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "./src/$1") },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
    ],
  },
});
