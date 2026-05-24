import { defineConfig } from "vitest/config";
import path from "path";

// Three projects, split by environment:
//   - node:         pure unit tests in src/ (*.test.ts; some mock node built-ins)
//   - jsdom:        client hook tests in src/ (*.test.tsx) that need a real DOM
//                   plus effects/re-renders via @testing-library/react.
//   - convex:       convex/ tests, including convex-test integration tests which
//                   require the edge-runtime environment.
// Pure convex unit tests (e.g. permissions, summarize) run fine under
// edge-runtime too, so the whole convex/ tree lives in one project. The node and
// jsdom src globs split by extension (.test.ts vs .test.tsx) so never overlap.
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
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
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
