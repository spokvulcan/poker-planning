/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";

// convex/_generated/api.d.ts lists the backend's modules, and `api` and
// `internal` are typed from that list. Only `npx convex dev` writes it, against
// a deployment, so a module added or removed without it leaves the list behind
// the files until a deploy regenerates it. These tests hold the list to the
// files, by the rule the Convex CLI picks modules with (`entryPoints` in
// node_modules/convex/src/bundler/index.ts).

/** Every file under convex/ with an extension the CLI bundles, as source text, but the generated code. */
const files = import.meta.glob(["./**/*.{js,mjs,cjs,ts,tsx,mts,cts,jsx}", "!./_generated/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const apiDts = import.meta.glob("./_generated/api.d.ts", { query: "?raw", import: "default", eager: true })[
  "./_generated/api.d.ts"
] as string;

/** The directories of local components (a convex.config.ts below convex/'s own), which the CLI leaves to the component. */
const componentDirs = Object.keys(files)
  .filter((path) => path.endsWith("/convex.config.ts") && path !== "./convex.config.ts")
  .map((path) => path.slice(0, -"convex.config.ts".length));

/**
 * Whether the CLI makes a file a module: not the schema, a dotfile, a name
 * with more than one dot (tests, seeds, `auth.config.ts`, `convex.config.ts`,
 * `components.setup.ts`), a path with a space or a file in a local component,
 * and a TypeScript file only when it imports or exports.
 */
function isModule(path: string, source: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return (
    name !== "schema.ts" &&
    name !== "schema.js" &&
    !/^[.#]/.test(name) &&
    name.split(".").length === 2 &&
    !path.includes(" ") &&
    !componentDirs.some((dir) => path.startsWith(dir)) &&
    (!/\.tsx?$/.test(name) || /^\s{0,100}(import|export)/m.test(source))
  );
}

/** The modules codegen lists: each one's path under convex/, without its extension. */
const modules = Object.keys(files)
  .filter((path) => isModule(path, files[path]))
  .map((path) => path.replace(/^\.\//, "").replace(/\.[^/.]+$/, ""))
  .sort();

describe("the generated API (convex/_generated/api.d.ts)", () => {
  it("finds the modules", () => {
    expect(modules).toEqual(expect.arrayContaining(["rooms", "crons", "model/auth", "integrations/jira"]));
    expect(modules).not.toEqual(expect.arrayContaining(["schema"]));
  });

  it("imports every module and nothing else; regenerate it with `npx convex dev` when this fails", () => {
    const imported = [...apiDts.matchAll(/^import type \* as \w+ from "\.\.\/(.+)\.js";$/gm)].map(([, path]) => path);

    expect(imported.sort()).toEqual(modules);
  });

  it("types the API from every module and nothing else; regenerate it with `npx convex dev` when this fails", () => {
    const fromModules = apiDts.slice(apiDts.indexOf("ApiFromModules<{"), apiDts.indexOf("}>;"));
    const typed = [...fromModules.matchAll(/^\s+"?([^"\s:]+)"?: typeof \w+;$/gm)].map(([, name]) => name);

    expect(typed.sort()).toEqual(modules);
  });
});
