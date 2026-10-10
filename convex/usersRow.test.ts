/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type T, seedUser } from "./analytics.seeds";

// A person's users row is the server's to make (model/users.ts): a signed-in
// caller's first room write makes it, whatever the browser did first, of the
// kind their session's token says, and the users model is the only place a
// row is made or turns permanent.

const modules = import.meta.glob("./**/*.*s");

/** Signed in as a guest: BetterAuth's token says the session is anonymous. */
const guest = (t: T, subject: string) => t.withIdentity({ subject, isAnonymous: true });

/** Signed in to a permanent account: the token carries its email and the name its provider gave. */
const account = (t: T, subject: string, profile: { email: string; name: string }) =>
  t.withIdentity({ subject, isAnonymous: false, ...profile });

const ADA = { email: "ada@example.com", name: "Ada Lovelace" };

const room = (t: T, roomId: Id<"rooms">) => t.run((ctx) => ctx.db.get("rooms", roomId));

describe("a signed-in caller's first room write", () => {
  it("makes a guest's row, with a guest name, when a guest creates a poker room", async () => {
    const t = withComponents(convexTest(schema, modules));

    const roomId = await guest(t, "ann").mutation(api.rooms.create, { name: "Planning" });

    const row = await guest(t, "ann").query(api.users.getGlobalUser, {});
    expect(row).toMatchObject({ accountType: "anonymous" });
    expect(row?.name).toMatch(/^Guest \d{4}$/);
    expect(await guest(t, "ann").query(api.users.getMyMembership, { roomId })).toMatchObject({ role: "owner" });
  });

  it("makes a permanent account's row, with its email and name, when an account creates a retro it keeps", async () => {
    const t = withComponents(convexTest(schema, modules));

    const roomId = await account(t, "ada", ADA).mutation(api.retro.create, { name: "Sprint 41 retro" });

    expect(await account(t, "ada", ADA).query(api.users.getGlobalUser, {})).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      accountType: "permanent",
    });
    expect(await room(t, roomId)).toMatchObject({ retained: true });
  });

  it("makes a row of no kind, as before, when the token doesn't say which kind of account it is", async () => {
    const t = withComponents(convexTest(schema, modules));

    await t.withIdentity({ subject: "ann", email: "ann@example.com" }).mutation(api.rooms.create, { name: "Planning" });

    const row = await t.withIdentity({ subject: "ann" }).query(api.users.getGlobalUser, {});
    expect(row?.accountType).toBeUndefined();
    expect(row?.email).toBeUndefined();
    expect(row?.name).toMatch(/^Guest \d{4}$/);
  });

  it("makes a guest's row with the name they typed when a guest joins a room", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await account(t, "ada", ADA).mutation(api.rooms.create, { name: "Planning" });

    await guest(t, "ann").mutation(api.users.join, { roomId, name: "Ann" });

    expect(await guest(t, "ann").query(api.users.getGlobalUser, {})).toMatchObject({
      name: "Ann",
      accountType: "anonymous",
    });
  });

  it("makes the row with the name a caller gives themselves when they rename themselves first", async () => {
    const t = withComponents(convexTest(schema, modules));

    await account(t, "ada", ADA).mutation(api.users.editGlobalUser, { name: "Countess" });

    expect(await account(t, "ada", ADA).query(api.users.getGlobalUser, {})).toMatchObject({
      name: "Countess",
      email: "ada@example.com",
      accountType: "permanent",
    });
  });

  it("gives a deleted account that signs back in a permanent row again, with its email", async () => {
    const t = withComponents(convexTest(schema, modules));
    await account(t, "ada", ADA).mutation(api.rooms.create, { name: "Planning" });
    // Delete account keeps BetterAuth's user, so its create hook never runs for Ada again.
    await account(t, "ada", ADA).mutation(api.users.deleteUser, {});

    const roomId = await account(t, "ada", ADA).mutation(api.retro.create, { name: "Sprint 41 retro" });

    expect(await account(t, "ada", ADA).query(api.users.getGlobalUser, {})).toMatchObject({
      email: "ada@example.com",
      accountType: "permanent",
    });
    expect(await room(t, roomId)).toMatchObject({ retained: true });
  });
});

describe("a room write by a permanent account whose row isn't a permanent account's", () => {
  it("turns the row permanent, with the token's email, keeping the retros it owns", async () => {
    const t = withComponents(convexTest(schema, modules));
    // Before the server made rows, a deleted account came back with a guest's row: a guest name, no kind.
    const adaId = await seedUser(t, "ada", "Guest 4829");
    const retroId = await t.withIdentity({ subject: "ada" }).mutation(api.retro.create, { name: "Sprint 41 retro" });
    expect(await room(t, retroId)).toMatchObject({ retained: false });

    await account(t, "ada", ADA).mutation(api.rooms.create, { name: "Planning" });

    expect(await account(t, "ada", ADA).query(api.users.getGlobalUser, {})).toMatchObject({
      _id: adaId,
      name: "Guest 4829",
      email: "ada@example.com",
      accountType: "permanent",
    });
    expect(await room(t, retroId)).toMatchObject({ retained: true });
  });
});

describe("an account link", () => {
  it("turns the guest's row into the account's: permanent, with its email, keeping the guest's name", async () => {
    const t = withComponents(convexTest(schema, modules));
    await guest(t, "ann").mutation(api.rooms.create, { name: "Planning" });
    const guestRow = await guest(t, "ann").query(api.users.getGlobalUser, {});

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "ann",
      newAuthUserId: "ada",
      email: "ada@example.com",
      name: "Ada Lovelace",
    });

    expect(await account(t, "ada", ADA).query(api.users.getGlobalUser, {})).toMatchObject({
      _id: guestRow?._id,
      name: guestRow?.name,
      email: "ada@example.com",
      accountType: "permanent",
    });
  });
});

// The rule the users model keeps: a users row is made, and a row turns
// permanent, only there, so neither an account link nor the auth hooks write
// a row's kind some other way. Every module under convex/ as source text, but
// the tests and generated code.
const sources = import.meta.glob(
  ["./**/*.ts", "!./**/*.test.ts", "!./**/*.seeds.ts", "!./_generated/**"],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

/** Makes a users row, or writes "permanent" as a row's kind, in code (not in comments). */
function makesOrTurnsPermanent(source: string): boolean {
  const code = source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  return /insert\(\s*["']users["']|accountType:\s*["']permanent["']/.test(code);
}

describe("making a users row and turning one permanent", () => {
  it("happen only in the users model", () => {
    expect(makesOrTurnsPermanent(sources["./model/users.ts"])).toBe(true);

    const elsewhere = Object.keys(sources).filter(
      (path) => path !== "./model/users.ts" && makesOrTurnsPermanent(sources[path])
    );
    expect(elsewhere).toEqual([]);
  });
});
