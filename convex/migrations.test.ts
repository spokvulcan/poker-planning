/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { withComponents } from "./components.setup";
import type { Id } from "./_generated/dataModel";
import type { MemberRole } from "./permissions";
import { seedUser } from "./analytics.seeds";

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
