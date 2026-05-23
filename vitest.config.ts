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
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
