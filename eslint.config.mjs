import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import convexPlugin from "@convex-dev/eslint-plugin";

/**
 * A write to one of `tables` (a regex alternation), seen by the table name it
 * passes: the form the Convex plugin's explicit-table-ids rule holds every
 * write to.
 */
const writeTo = (tables, methods = "insert|patch|replace|delete") =>
  `CallExpression[callee.property.name=/^(${methods})$/][arguments.0.value=/^(${tables})$/]`;

/** The plain Errors a guard still throws (ADR-0031): caller errors, not refusals by rule. */
const GUARD_PLAIN_ERRORS = [
  "Room not found", // the room asked about isn't there
  "Target user is not a member of this room", // the member a relationship verb acts on isn't there
];

/**
 * The backend's mechanical standards, as `no-restricted-syntax` selectors over
 * convex/ but its tests and seeds. A standard holds in every file but those in
 * its `except`, or only in those in its `only`.
 */
const BACKEND_STANDARDS = [
  // One writer per concern (CLAUDE.md). The one-off migrations rewrite stored
  // rows into a new shape, so they write what they repair.
  {
    selector: writeTo("users", "insert"),
    except: ["convex/model/users.ts"],
    message: "One writer per concern (CLAUDE.md): only model/users.ts makes a users row. Take findOrMakeUser.",
  },
  {
    selector: "Property[key.name='accountType'][value.value='permanent']",
    except: ["convex/model/users.ts"],
    message: "One writer per concern (CLAUDE.md): only model/users.ts turns a users row permanent.",
  },
  {
    selector: writeTo("roomMemberships"),
    except: ["convex/model/memberships.ts", "convex/model/ownership.ts", "convex/migrations.ts"],
    message:
      "One writer per concern (CLAUDE.md): only model/memberships.ts writes roomMemberships, and model/ownership.ts the owner role. Call them.",
  },
  {
    selector: `${writeTo("roomMemberships")} Property[key.name='role'][value.value='owner']`,
    except: ["convex/model/ownership.ts", "convex/migrations.ts"],
    message: "One writer per concern (CLAUDE.md): only model/ownership.ts gives the owner role (ADR-0029).",
  },
  {
    selector: `${writeTo("rooms", "insert|patch|replace")} Property[key.name=/^(ownerId|retained)$/]`,
    except: ["convex/model/ownership.ts"],
    message:
      "One writer per concern (CLAUDE.md): only model/ownership.ts writes a room's owner and retention (ADR-0029).",
  },
  {
    selector: writeTo("canvasNodes"),
    except: ["convex/model/canvas.ts", "convex/migrations.ts"],
    message: "One writer per concern (CLAUDE.md): only model/canvas.ts writes canvasNodes.",
  },
  {
    selector: writeTo("votes"),
    except: ["convex/model/votingRound.ts"],
    message: "One writer per concern (CLAUDE.md): only model/votingRound.ts writes poker votes.",
  },
  {
    // The standards above see a write by the table it names.
    selector:
      "CallExpression[callee.object.property.name='db'][callee.property.name=/^(insert|patch|replace|delete)$/]:not([arguments.0.type='Literal'])",
    except: ["convex/model/roomEnding.ts", "convex/admin.ts"],
    message:
      "Name a write's table as a string, so the one-writer standards see it. Only room ending (model/roomEnding.ts) and the admin wipe delete through a table variable.",
  },
  // A guard refuses through refusal(), whose message reaches the browser.
  {
    selector: `ThrowStatement:not([argument.callee.name=/^(refusal|notAMember)$/], [argument.callee.name='Error'][argument.arguments.0.value=/^(${GUARD_PLAIN_ERRORS.join("|")})$/])`,
    only: ["convex/model/auth.ts"],
    message:
      "A guard refuses through refusal() (ADR-0031): production redacts a plain Error's message. Only the caller errors in GUARD_PLAIN_ERRORS (eslint.config.mjs) stay plain.",
  },
  // A public query degrades instead of throwing for a viewer with no users row.
  {
    selector: "CallExpression[callee.name='query'] CallExpression[callee.name='requireUser']",
    message:
      'A public query takes getCaller (docs/authentication.md): requireUser throws "User not found" for a signed-in viewer with no users row yet, which crashes the page.',
  },
  // convex/_generated/ai/guidelines.md
  {
    selector: "CallExpression[callee.object.name='crons'][callee.property.name=/^(hourly|daily|weekly|monthly)$/]",
    message: "Schedule a cron with crons.interval or crons.cron (convex/_generated/ai/guidelines.md).",
  },
];

/** The standards `file` is held to; with no file, those of every file no standard lists. */
const standardsFor = (file) =>
  BACKEND_STANDARDS.filter(({ only, except = [] }) => (only ? only.includes(file) : !except.includes(file))).map(
    ({ selector, message }) => ({ selector, message })
  );

// Flat config replaces a rule's options rather than merging them, so each file
// a standard lists gets a config object of its own.
const listedFiles = [...new Set(BACKEND_STANDARDS.flatMap(({ only = [], except = [] }) => [...only, ...except]))];
const backendStandards = [
  {
    files: ["convex/**/*.ts"],
    ignores: ["convex/**/*.test.ts", "convex/**/*.seeds.ts", ...listedFiles],
    rules: { "no-restricted-syntax": ["error", ...standardsFor()] },
  },
  ...listedFiles.map((file) => ({
    files: [file],
    rules: { "no-restricted-syntax": ["error", ...standardsFor(file)] },
  })),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...convexPlugin.configs.recommended,
  ...backendStandards,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
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
