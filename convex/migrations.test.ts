/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { withComponents } from "./components.setup";
import type { Id } from "./_generated/dataModel";
import type { MemberRole } from "./permissions";
import { seedUser } from "./analytics.seeds";
import {
  type Device,
  authRequest,
  signInAsGuest,
  signInByMagicLink,
  signInRows,
  stubAuthDeployment,
} from "./signIn.seeds";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

/**
 * backfillOwnerRoles repairs rooms where the owner is in the room under a
 * lesser role, a state an old account merge could leave behind. An
 * owner-role membership exists iff the owner is present (ADR-0001), so the
 * owner's membership gets the owner role back, and a room in lockdown, where
 * the owner has no membership, keeps its members as they are.
 */

async function seedOwnedRoom(t: T, ownerId?: Id<"users">): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
      ...(ownerId ? { ownerId } : {}),
    })
  );
}

async function addMember(t: T, roomId: Id<"rooms">, userId: Id<"users">, role?: MemberRole): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("roomMemberships", { roomId, userId, isSpectator: false, joinedAt: Date.now(), ...(role ? { role } : {}) })
  );
}

const memberships = (t: T) => t.run((ctx) => ctx.db.query("roomMemberships").collect());

describe("backfillOwnerRoles", () => {
  // convex-test dispatches runAfter(0) jobs through a real setTimeout; faking
  // it keeps a continuation pending until the test runs it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("gives an owner in the room the owner role, and leaves correct, locked-down and ownerless rooms alone", async () => {
    const t = withComponents(convexTest(schema, modules));
    const ownerId = await seedUser(t, "auth-owner");
    const otherId = await seedUser(t, "auth-other");
    // Broken: the owner is in the room, as a participant.
    const broken = await seedOwnedRoom(t, ownerId);
    await addMember(t, broken, ownerId);
    await addMember(t, broken, otherId, "facilitator");
    // Correct: the owner holds the owner role.
    const correct = await seedOwnedRoom(t, ownerId);
    await addMember(t, correct, ownerId, "owner");
    await addMember(t, correct, otherId);
    // Lockdown: the owner left, so there is no membership to repair.
    const lockdown = await seedOwnedRoom(t, ownerId);
    await addMember(t, lockdown, otherId);
    // A legacy room with no owner at all.
    const ownerless = await seedOwnedRoom(t);
    await addMember(t, ownerless, otherId);
    const before = await memberships(t);

    expect(await t.mutation(internal.migrations.backfillOwnerRoles, {})).toEqual({
      roomsChecked: 4,
      membershipsRepaired: 1,
      done: true,
    });

    const after = await memberships(t);
    expect(after).toEqual(
      before.map((m) => (m.roomId === broken && m.userId === ownerId ? { ...m, role: "owner" } : m))
    );

    // A second run finds nothing left to repair.
    expect(await t.mutation(internal.migrations.backfillOwnerRoles, {})).toEqual({
      roomsChecked: 4,
      membershipsRepaired: 0,
      done: true,
    });
    expect(await memberships(t)).toEqual(after);
  });

  it("works through the rooms a batch at a time, rescheduling itself until every room is checked", async () => {
    const t = withComponents(convexTest(schema, modules));
    const ownerId = await seedUser(t, "auth-owner");
    for (let i = 0; i < 3; i++) {
      await addMember(t, await seedOwnedRoom(t, ownerId), ownerId, "participant");
    }
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await t.mutation(internal.migrations.backfillOwnerRoles, { batchSize: 1 })).toEqual({
      roomsChecked: 1,
      membershipsRepaired: 1,
      done: false,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await memberships(t)).map((m) => m.role)).toEqual(["owner", "owner", "owner"]);
    expect(log).toHaveBeenCalledWith("Owner role backfill complete:", { roomsChecked: 3, membershipsRepaired: 3 });
  });
});

describe("clearTimerRunners", () => {
  it("clears who last ran each timer, and leaves the rest of the board alone", async () => {
    const t = withComponents(convexTest(schema, modules));
    const userId = await seedUser(t, "auth-runner");
    const roomId = await seedOwnedRoom(t, userId);
    const running = { startedAt: 1, pausedAt: null, elapsedSeconds: 0, isRunning: true, lastAction: "start" };
    await t.run(async (ctx) => {
      await ctx.db.insert("canvasNodes", {
        roomId,
        nodeId: "timer",
        type: "timer",
        position: { x: 0, y: 0 },
        data: { ...running, lastUpdatedBy: userId },
        lastUpdatedBy: userId,
        lastUpdatedAt: 1,
      });
      await ctx.db.insert("canvasNodes", {
        roomId,
        nodeId: `player-${userId}`,
        type: "player",
        position: { x: 0, y: 0 },
        data: { userId },
        lastUpdatedAt: 1,
      });
    });
    const before = await t.run((ctx) => ctx.db.query("canvasNodes").collect());

    expect(await t.mutation(internal.migrations.clearTimerRunners, {})).toEqual({
      nodesChecked: 2,
      timersCleared: 1,
      done: true,
    });

    const after = await t.run((ctx) => ctx.db.query("canvasNodes").collect());
    expect(after).toEqual(before.map((node) => (node.type === "timer" ? { ...node, data: running } : node)));
    // A second run finds nothing left to clear.
    expect(await t.mutation(internal.migrations.clearTimerRunners, {})).toMatchObject({ timersCleared: 0 });
  });
});

describe("clearRoundDurations", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears every round record's wall-clock duration a batch at a time, and nothing else", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedOwnedRoom(t, await seedUser(t, "auth-owner"));
    await t.run(async (ctx) => {
      await ctx.db.insert("votingTimestamps", { roomId, votingStartedAt: 0, votingEndedAt: 60_000, durationMs: 60_000, roundNumber: 1 });
      await ctx.db.insert("votingTimestamps", { roomId, votingStartedAt: 0, votingEndedAt: 30_000, durationMs: 30_000, roundNumber: 1 });
      await ctx.db.insert("votingTimestamps", { roomId, votingStartedAt: 90_000, roundNumber: 1 });
    });
    const before = await t.run((ctx) => ctx.db.query("votingTimestamps").collect());
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await t.mutation(internal.migrations.clearRoundDurations, { batchSize: 2 })).toEqual({
      roundsChecked: 2,
      durationsCleared: 2,
      done: false,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.run((ctx) => ctx.db.query("votingTimestamps").collect());
    expect(after).toEqual(before.map(({ durationMs: _, ...round }) => round));
    expect(log).toHaveBeenCalledWith("Round duration cleanup complete:", { roundsChecked: 3, durationsCleared: 2 });
    // A second run finds nothing left to clear.
    expect(await t.mutation(internal.migrations.clearRoundDurations, {})).toMatchObject({ durationsCleared: 0 });
  });
});

describe("deleteLeftoverSignIns", () => {
  // Signed in through BetterAuth's own routes, as a browser is (signIn.seeds.ts).
  beforeEach(stubAuthDeployment);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Counts every sign-in made so far, past the day new ones are spared. */
  const run = (t: T, args: { dryRun?: boolean; batchSize?: number } = {}) =>
    t.mutation(internal.migrations.deleteLeftoverSignIns, { createdBefore: Date.now() + 1, ...args });

  const gone = { user: null, sessions: [], accounts: [] };

  /**
   * The sign-ins an account's ending used to leave behind, and the ones
   * around them that must stay. Before ADR-0033, Delete account deleted the
   * users row and kept BetterAuth's user, and a guest's sign-out deleted the
   * row and left BetterAuth to end the session.
   */
  async function seedSignIns(t: T) {
    const deletedAccount = await signInByMagicLink(t, "ada@example.com");
    await signInByMagicLink(t, "ada@example.com"); // her phone, still signed in
    await deleteRowOnly(t, deletedAccount);
    const signedOutGuest = await signInAsGuest(t);
    await authRequest(t, "/api/auth/sign-out", { method: "POST", cookie: signedOutGuest.cookie, body: {} });
    // Still here: an account in use, a guest in a room, and a guest who only continued as one.
    const account = await signInByMagicLink(t, "bob@example.com");
    const guest = await signInAsGuest(t);
    const roomId = await t.withIdentity(account.identity).mutation(api.rooms.create, { name: "Planning" });
    await t.withIdentity(guest.identity).mutation(api.users.join, { roomId, name: "Ann" });
    const continuedGuest = await signInAsGuest(t);
    return { deletedAccount, signedOutGuest, account, guest, continuedGuest };
  }

  /** The users row goes and BetterAuth's user stays, as Delete account left it. */
  const deleteRowOnly = async (t: T, device: Device) => {
    const row = await t.withIdentity(device.identity).query(api.users.getGlobalUser, {});
    await t.run((ctx) => ctx.db.delete("users", row!._id));
  };

  it("deletes the sign-ins deleted accounts left, and keeps everyone else's", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { deletedAccount, signedOutGuest, account, guest, continuedGuest } = await seedSignIns(t);

    expect(await run(t)).toEqual({ signInsChecked: 5, permanentLeftovers: 1, guestLeftovers: 1, done: true });

    expect(await signInRows(t, deletedAccount.identity.subject)).toEqual(gone);
    expect(await signInRows(t, signedOutGuest.identity.subject)).toEqual(gone);
    for (const kept of [account, guest, continuedGuest]) {
      expect((await signInRows(t, kept.identity.subject)).sessions).toHaveLength(1);
    }
    // A second run finds nothing left.
    expect(await run(t)).toMatchObject({ signInsChecked: 3, permanentLeftovers: 0, guestLeftovers: 0 });
  });

  it("only counts in a dry run", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { deletedAccount, signedOutGuest } = await seedSignIns(t);

    expect(await run(t, { dryRun: true })).toMatchObject({ permanentLeftovers: 1, guestLeftovers: 1 });

    expect((await signInRows(t, deletedAccount.identity.subject)).sessions).toHaveLength(2);
    expect((await signInRows(t, signedOutGuest.identity.subject)).user).not.toBeNull();
  });

  it("spares a sign-in made in the last day, whose users row may still be on its way", async () => {
    const t = withComponents(convexTest(schema, modules));
    const deletedAccount = await signInByMagicLink(t, "ada@example.com");
    await deleteRowOnly(t, deletedAccount);

    expect(await t.mutation(internal.migrations.deleteLeftoverSignIns, {})).toMatchObject({
      signInsChecked: 1,
      permanentLeftovers: 0,
    });
    expect((await signInRows(t, deletedAccount.identity.subject)).user).not.toBeNull();
  });

  it("works through BetterAuth's users a batch at a time, rescheduling itself until every one is checked", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { deletedAccount, signedOutGuest } = await seedSignIns(t);
    // convex-test dispatches runAfter(0) jobs through a real setTimeout; faking
    // it keeps a continuation pending until the test runs it.
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await run(t, { batchSize: 2 })).toMatchObject({ signInsChecked: 2, done: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(log).toHaveBeenCalledWith("Leftover sign-in cleanup complete:", {
      signInsChecked: 5,
      permanentLeftovers: 1,
      guestLeftovers: 1,
    });
    expect(await signInRows(t, deletedAccount.identity.subject)).toEqual(gone);
    expect(await signInRows(t, signedOutGuest.identity.subject)).toEqual(gone);
  });

  it("keeps a dry run dry, and its cutoff, in every step it reschedules", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { deletedAccount, signedOutGuest } = await seedSignIns(t);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await run(t, { dryRun: true, batchSize: 1 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(log).toHaveBeenCalledWith("Leftover sign-in cleanup complete (dry run):", {
      signInsChecked: 5,
      permanentLeftovers: 1,
      guestLeftovers: 1,
    });
    expect((await signInRows(t, deletedAccount.identity.subject)).user).not.toBeNull();
    expect((await signInRows(t, signedOutGuest.identity.subject)).user).not.toBeNull();
  });
});
