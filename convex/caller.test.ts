/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { getCaller, requireCaller, requireUser } from "./model/caller";
import { seedUser } from "./analytics.seeds";

// Who is calling (model/caller.ts): the one place a signed-in identity
// becomes the person's users row. Every guard, and every query or action
// that needs the caller, resolves them there.

const modules = import.meta.glob("./**/*.*s");

describe("the caller", () => {
  it("is the signed-in person with their users row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-ada", "Ada");

    const asAda = t.withIdentity({ subject: "auth-ada" });

    const caller = await asAda.run((ctx) => getCaller(ctx));
    expect(caller?.identity.subject).toBe("auth-ada");
    expect(caller?.user).toMatchObject({ _id: userId, name: "Ada" });

    expect((await asAda.run((ctx) => requireUser(ctx))).user._id).toBe(userId);
  });

  it("is signed in without a users row until one is made", async () => {
    const t = convexTest(schema, modules);
    const asGuest = t.withIdentity({ subject: "auth-guest" });

    const caller = await asGuest.run((ctx) => getCaller(ctx));
    expect(caller?.identity.subject).toBe("auth-guest");
    expect(caller?.user).toBeNull();

    expect((await asGuest.run((ctx) => requireCaller(ctx))).user).toBeNull();
    await expect(asGuest.run((ctx) => requireUser(ctx))).rejects.toThrow("User not found");
  });

  it("is nobody when no one is signed in", async () => {
    const t = convexTest(schema, modules);

    expect(await t.run((ctx) => getCaller(ctx))).toBeNull();
    await expect(t.run((ctx) => requireCaller(ctx))).rejects.toThrow("Not authenticated");
    await expect(t.run((ctx) => requireUser(ctx))).rejects.toThrow("Not authenticated");
  });

  it("is found the same way from an action, which has no database of its own", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-ada", "Ada");

    const ada = await t.withIdentity({ subject: "auth-ada" }).action((ctx) => requireUser(ctx));
    expect(ada.user._id).toBe(userId);

    const guest = await t.withIdentity({ subject: "auth-guest" }).action((ctx) => getCaller(ctx));
    expect(guest?.identity.subject).toBe("auth-guest");
    expect(guest?.user).toBeNull();

    expect(await t.action((ctx) => getCaller(ctx))).toBeNull();
  });
});

// The rule the module exists for: only it reads who is signed in or looks a
// person up by auth id, so that lookup can't be written out again elsewhere.
// Every module under convex/ as source text, but the tests and generated code.
const sources = import.meta.glob(
  ["./**/*.ts", "!./**/*.test.ts", "!./**/*.seeds.ts", "!./_generated/**"],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

/** Reads the signed-in identity, or looks a person up by their auth id, in code (not in comments). */
function asksWhoIsCalling(source: string): boolean {
  const code = source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  return /getUserIdentity\(|withIndex\(\s*["']by_auth_user["']/.test(code);
}

describe("asking who is calling", () => {
  it("happens only in the caller module", () => {
    expect(asksWhoIsCalling(sources["./model/caller.ts"])).toBe(true);

    const elsewhere = Object.keys(sources).filter(
      (path) => path !== "./model/caller.ts" && asksWhoIsCalling(sources[path])
    );
    expect(elsewhere).toEqual([]);
  });
});
