/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type T, seedUser } from "./analytics.seeds";
import { authRequest, signInAsGuest, signInByMagicLink, stubAuthDeployment } from "./signIn.seeds";

// A person's users row is the server's to make (model/users.ts): a signed-in
// caller's first room write makes it, whatever the browser did first, of the
// kind their session's token says, while that session lasts. That the users
// model is the only place a row is made or turns permanent, the lint holds
// (eslint.config.mjs).

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
});

describe("a token BetterAuth issued, which outlives its session (ADR-0033)", () => {
  // Signed in through BetterAuth's own routes, as a browser is (signIn.seeds.ts).
  beforeEach(stubAuthDeployment);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("makes the row while its session lasts: a guest's first join", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await account(t, "ada", ADA).mutation(api.rooms.create, { name: "Planning" });
    const ann = await signInAsGuest(t);

    await t.withIdentity(ann.identity).mutation(api.users.join, { roomId, name: "Ann" });

    expect(await t.withIdentity(ann.identity).query(api.users.getGlobalUser, {})).toMatchObject({
      name: "Ann",
      accountType: "anonymous",
    });
  });

  it("makes none once its session is gone: another tab of a guest who signed out", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await account(t, "ada", ADA).mutation(api.rooms.create, { name: "Planning" });
    // "Continue as guest", then Sign out: the server first, then BetterAuth.
    const ann = await signInAsGuest(t);
    await t.withIdentity(ann.identity).mutation(api.users.signOut, {});
    await authRequest(t, "/api/auth/sign-out", { method: "POST", cookie: ann.cookie, body: {} });

    await expect(t.withIdentity(ann.identity).mutation(api.users.join, { roomId, name: "Ann" })).rejects.toThrow(
      "Not authenticated"
    );
    expect(await t.withIdentity(ann.identity).query(api.users.getGlobalUser, {})).toBeNull();
  });

  it("gives an account deleted before its sign-in went with it a permanent row again when it signs back in", async () => {
    const t = withComponents(convexTest(schema, modules));
    const ada = await signInByMagicLink(t, "ada@example.com");
    // Delete account used to keep BetterAuth's user, so its create hook never runs for Ada again.
    const deleted = await t.withIdentity(ada.identity).query(api.users.getGlobalUser, {});
    await t.run((ctx) => ctx.db.delete("users", deleted!._id));

    const roomId = await t.withIdentity(ada.identity).mutation(api.retro.create, { name: "Sprint 41 retro" });

    expect(await t.withIdentity(ada.identity).query(api.users.getGlobalUser, {})).toMatchObject({
      email: "ada@example.com",
      accountType: "permanent",
    });
    expect(await room(t, roomId)).toMatchObject({ retained: true });
  });
});

describe("a signed-in caller before their first room write, with no row", () => {
  it("gets every page's empty state: the dashboard, settings, their retros and a room they haven't joined", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await guest(t, "ann").mutation(api.rooms.create, { name: "Planning" });
    // A guest who only continued as one ("Continue as guest") has no row.
    const bob = guest(t, "bob");

    expect(await bob.query(api.users.getGlobalUser, {})).toBeNull();
    expect(await bob.query(api.integrations.getConnections, {})).toEqual([]);
    expect(await bob.query(api.retro.listMine, {})).toEqual([]);
    expect(await bob.query(api.analytics.getSessions, {})).toEqual([]);
    expect((await bob.query(api.analytics.getDashboard, {})).sessions).toEqual([]);
    expect(await bob.query(api.users.getMyMembership, { roomId })).toBeNull();
    expect((await bob.query(api.rooms.get, { roomId }))?.room.name).toBe("Planning");
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
