/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as VotingRound from "./model/votingRound";
import * as Issues from "./model/issues";
import * as Canvas from "./model/canvas";
import * as Timer from "./model/timer";
import * as Rooms from "./model/rooms";
import * as Retro from "./model/retro";
import { DEFAULT_RETRO_PERMISSIONS } from "./permissions";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

/**
 * Room activity ownership: every user-initiated mutation touching room-scoped
 * state must bump `lastActivityAt` through the one chokepoint
 * (`Rooms.updateRoomActivity`), or the cleanup cascade (model/cleanup.ts)
 * deletes rooms that are quietly in use. Each test seeds a room whose activity
 * is a minute stale and asserts the operation refreshes it.
 */

function staleTimestamp(): number {
  return Date.now() - 60_000;
}

async function seedRoom(t: T, lastActivityAt: number): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: lastActivityAt,
      lastActivityAt,
      retained: false,
    })
  );
}

async function addMember(
  t: T,
  roomId: Id<"rooms">,
  authUserId: string,
  role?: "owner" | "facilitator" | "participant"
): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authUserId,
      name: "U",
      createdAt: Date.now(),
    });
    await ctx.db.insert("roomMemberships", {
      roomId,
      userId,
      isSpectator: false,
      joinedAt: Date.now(),
      ...(role ? { role } : {}),
    });
    return userId;
  });
}

async function seedIssue(
  t: T,
  roomId: Id<"rooms">,
  status: "pending" | "voting" | "completed" = "pending"
): Promise<Id<"issues">> {
  return t.run((ctx) =>
    ctx.db.insert("issues", {
      roomId,
      sequentialId: 1,
      title: "Issue 1",
      status,
      createdAt: Date.now(),
      order: 0,
    })
  );
}

async function seedSessionNode(t: T, roomId: Id<"rooms">): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("canvasNodes", {
      roomId,
      nodeId: "session-current",
      type: "session",
      position: { x: 0, y: 0 },
      data: {},
      lastUpdatedAt: Date.now(),
    })
  );
}

async function lastActivityAt(t: T, roomId: Id<"rooms">): Promise<number> {
  return (await t.run((ctx) => ctx.db.get("rooms", roomId)))!.lastActivityAt;
}

async function expectBumped(t: T, roomId: Id<"rooms">, stale: number) {
  expect(await lastActivityAt(t, roomId)).toBeGreaterThan(stale);
}

describe("room activity — voting round transitions bump", () => {
  it("start bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId);

    await t.run((ctx) => VotingRound.start(ctx, { roomId, issueId }));

    await expectBumped(t, roomId, stale);
  });

  it("reset bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId, "voting");
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { currentIssueId: issueId }));

    await t.run((ctx) => VotingRound.reset(ctx, roomId));

    await expectBumped(t, roomId, stale);
  });

  it("reveal bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId, "voting");
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { currentIssueId: issueId }));

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    await expectBumped(t, roomId, stale);
  });

  it("abandon bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId, "voting");
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { currentIssueId: issueId }));

    await t.run((ctx) => VotingRound.abandon(ctx, roomId));

    await expectBumped(t, roomId, stale);
  });

  it("setAutoComplete bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);

    await t.run((ctx) => VotingRound.setAutoComplete(ctx, roomId, true));

    await expectBumped(t, roomId, stale);
  });

  it("cancelCountdown bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);

    await t.run((ctx) => VotingRound.cancelCountdown(ctx, roomId));

    await expectBumped(t, roomId, stale);
  });

  it("castVote bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const a = await addMember(t, roomId, "auth-a");

    await t.run((ctx) =>
      VotingRound.castVote(ctx, { roomId, userId: a, cardLabel: "5", cardValue: 5 })
    );

    await expectBumped(t, roomId, stale);
  });
});

describe("room activity — timer and canvas ops bump", () => {
  it("updateTimerState bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const userId = await addMember(t, roomId, "auth-a");
    await t.run((ctx) =>
      ctx.db.insert("canvasNodes", {
        roomId,
        nodeId: "timer",
        type: "timer",
        position: { x: 0, y: 0 },
        data: {
          startedAt: null,
          pausedAt: null,
          elapsedSeconds: 0,
          lastUpdatedBy: null,
          lastAction: null,
        },
        lastUpdatedAt: Date.now(),
      })
    );

    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
    );

    await expectBumped(t, roomId, stale);
  });

  it("updateNodePosition bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const userId = await addMember(t, roomId, "auth-a");
    await seedSessionNode(t, roomId);

    await t.run((ctx) =>
      Canvas.updateNodePosition(ctx, {
        roomId,
        nodeId: "session-current",
        position: { x: 5, y: 5 },
        userId,
      })
    );

    await expectBumped(t, roomId, stale);
  });

  it("createNoteNode bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const userId = await addMember(t, roomId, "auth-a");
    const issueId = await seedIssue(t, roomId);

    await t.run((ctx) => Canvas.createNoteNode(ctx, { roomId, issueId, userId }));

    await expectBumped(t, roomId, stale);
  });

  it("updateNoteContent bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const userId = await addMember(t, roomId, "auth-a");
    const issueId = await seedIssue(t, roomId);
    const nodeId = `note-${issueId}`;
    await t.run((ctx) =>
      ctx.db.insert("canvasNodes", {
        roomId,
        nodeId,
        type: "note",
        position: { x: 0, y: 0 },
        data: { issueId, issueTitle: "Issue 1", content: "" },
        lastUpdatedAt: Date.now(),
      })
    );

    await t.run((ctx) =>
      Canvas.updateNoteContent(ctx, { roomId, nodeId, content: "notes", userId })
    );

    await expectBumped(t, roomId, stale);
  });

  it("deleteNoteNode bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const userId = await addMember(t, roomId, "auth-a");
    const issueId = await seedIssue(t, roomId);
    const nodeId = `note-${issueId}`;
    await t.run((ctx) =>
      ctx.db.insert("canvasNodes", {
        roomId,
        nodeId,
        type: "note",
        position: { x: 0, y: 0 },
        data: { issueId, issueTitle: "Issue 1", content: "" },
        lastUpdatedAt: Date.now(),
      })
    );

    await t.run((ctx) => Canvas.deleteNoteNode(ctx, { roomId, nodeId, userId }));

    await expectBumped(t, roomId, stale);
  });
});

describe("room activity — issue CRUD bumps", () => {
  it("createIssueInRoom bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);

    await t.run((ctx) => Issues.createIssueInRoom(ctx, { roomId, title: "One" }));

    await expectBumped(t, roomId, stale);
  });

  it("updateIssueTitle bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId);

    await t.run((ctx) => Issues.updateIssueTitle(ctx, { issueId, title: "Renamed" }));

    await expectBumped(t, roomId, stale);
  });

  it("updateIssueEstimate bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId);

    await t.run((ctx) =>
      Issues.updateIssueEstimate(ctx, { issueId, finalEstimate: "8" })
    );

    await expectBumped(t, roomId, stale);
  });

  it("reorderIssues bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId);

    await t.run((ctx) => Issues.reorderIssues(ctx, { roomId, issueIds: [issueId] }));

    await expectBumped(t, roomId, stale);
  });

  it("removeIssue bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId);

    await t.run((ctx) => Issues.removeIssue(ctx, issueId));

    await expectBumped(t, roomId, stale);
  });
});

describe("room activity — role changes and rename bump (through the endpoints)", () => {
  async function seedOwnedRoom(t: T, stale: number) {
    const roomId = await seedRoom(t, stale);
    const ownerId = await addMember(t, roomId, "auth-owner", "owner");
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { ownerId }));
    const asOwner = t.withIdentity({ subject: "auth-owner" });
    return { roomId, ownerId, asOwner };
  }

  it("promoteFacilitator bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const { roomId, asOwner } = await seedOwnedRoom(t, stale);
    const target = await addMember(t, roomId, "auth-target");

    await asOwner.mutation(api.roles.promoteFacilitator, {
      roomId,
      targetUserId: target,
    });

    await expectBumped(t, roomId, stale);
  });

  it("demoteFacilitator bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const { roomId, asOwner } = await seedOwnedRoom(t, stale);
    const target = await addMember(t, roomId, "auth-target", "facilitator");

    await asOwner.mutation(api.roles.demoteFacilitator, {
      roomId,
      targetUserId: target,
    });

    await expectBumped(t, roomId, stale);
  });

  it("transferOwnership bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const { roomId, asOwner } = await seedOwnedRoom(t, stale);
    const target = await addMember(t, roomId, "auth-target");

    await asOwner.mutation(api.roles.transferOwnership, {
      roomId,
      targetUserId: target,
    });

    await expectBumped(t, roomId, stale);
  });

  it("updatePermissions bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const { roomId, asOwner } = await seedOwnedRoom(t, stale);

    await asOwner.mutation(api.roles.updatePermissions, {
      roomId,
      permissions: {
        revealCards: "facilitators",
        gameFlow: "everyone",
        issueManagement: "everyone",
        roomSettings: "owner",
      },
    });

    await expectBumped(t, roomId, stale);
  });

  it("rename bumps through the model, not the handler", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    await addMember(t, roomId, "auth-a");

    const asA = t.withIdentity({ subject: "auth-a" });
    await asA.mutation(api.rooms.rename, { roomId, name: "New name" });

    await expectBumped(t, roomId, stale);
  });
});

describe("room activity — the chokepoint owns the clock's precision (ADR-0018)", () => {
  const HOUR = Rooms.RETRO_ACTIVITY_GRANULARITY_MS;

  async function seedRetroRoom(t: T, lastActivityAt: number): Promise<Id<"rooms">> {
    const roomId = await seedRoom(t, lastActivityAt);
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { roomType: "retro" }));
    return roomId;
  }

  it("a retro whose clock is over an hour old is patched", async () => {
    const t = convexTest(schema, modules);
    const stale = Date.now() - HOUR - 60_000;
    const roomId = await seedRetroRoom(t, stale);

    await t.run((ctx) => Rooms.updateRoomActivity(ctx, roomId));

    await expectBumped(t, roomId, stale);
  });

  it("a retro whose clock is a minute old is left untouched", async () => {
    const t = convexTest(schema, modules);
    const fresh = staleTimestamp();
    const roomId = await seedRetroRoom(t, fresh);

    await t.run((ctx) => Rooms.updateRoomActivity(ctx, roomId));

    expect(await lastActivityAt(t, roomId)).toBe(fresh);
  });

  it("a poker room is patched every time, even a minute stale", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);

    await t.run((ctx) => Rooms.updateRoomActivity(ctx, roomId));

    await expectBumped(t, roomId, stale);
  });

  it("a room that is gone returns without patching (the join path bumps before it reads the room)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, staleTimestamp());
    await t.run((ctx) => ctx.db.delete("rooms", roomId));

    // Throws if the chokepoint patches a missing document.
    await t.run((ctx) => Rooms.updateRoomActivity(ctx, roomId));
  });

  it("creating a retro stamps a live clock", async () => {
    const t = convexTest(schema, modules);
    const before = Date.now();
    const owner = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { authUserId: "auth-o", name: "O", createdAt: Date.now() });
      return (await ctx.db.get("users", id))!;
    });

    const roomId = await t.run((ctx) => Retro.createRetro(ctx, { name: "R", owner }));

    expect(await lastActivityAt(t, roomId)).toBeGreaterThanOrEqual(before);
  });
});

describe("room activity — every retro write goes through the chokepoint (ADR-0018)", () => {
  const HOUR = Rooms.RETRO_ACTIVITY_GRANULARITY_MS;
  const as = (t: T, subject: string) => t.withIdentity({ subject });

  /** Sticks a sticky in the first column; its text is its clientId. */
  const stick = (who: ReturnType<T["withIdentity"]>, roomId: Id<"rooms">, clientId: string) =>
    who.mutation(api.retro.addSticky, {
      roomId,
      clientId,
      columnId: "c1",
      text: clientId,
      position: { x: 0, y: 0 },
    });

  /**
   * A guest's retro with a participant beside its owner and a sticky each.
   * The owner runs every act, so none is refused on permissions.
   */
  async function seedRetro(t: T) {
    await t.run((ctx) =>
      ctx.db.insert("users", { authUserId: "auth-owner", name: "O", createdAt: Date.now() })
    );
    const owner = as(t, "auth-owner");
    const participant = as(t, "auth-p");
    const roomId = await owner.mutation(api.retro.create, { name: "R" });
    await owner.mutation(api.users.join, { roomId, name: "O", authUserId: "auth-owner" });
    await participant.mutation(api.users.join, { roomId, name: "P", authUserId: "auth-p" });
    const mine = await stick(owner, roomId, "mine");
    const theirs = await stick(participant, roomId, "theirs");
    return { roomId, owner, mine, theirs };
  }

  /** Runs each act against a clock over an hour stale and expects it bumped. */
  async function expectEachBumps(
    t: T,
    roomId: Id<"rooms">,
    acts: Record<string, () => Promise<unknown>>
  ) {
    for (const [name, act] of Object.entries(acts)) {
      const stale = Date.now() - HOUR - 60_000;
      await t.run((ctx) => ctx.db.patch("rooms", roomId, { lastActivityAt: stale }));
      await act();
      expect(await lastActivityAt(t, roomId), name).toBeGreaterThan(stale);
    }
  }

  it("moving through the steps and the discussion bumps", async () => {
    const t = convexTest(schema, modules);
    const { roomId, owner, mine } = await seedRetro(t);

    await expectEachBumps(t, roomId, {
      setStep: () => owner.mutation(api.retro.setStep, { roomId, step: "discuss" }),
      stepDiscussion: () => owner.mutation(api.retro.stepDiscussion, { roomId, direction: "next" }),
      focusTopic: () => owner.mutation(api.retro.focusTopic, { roomId, stickyId: mine }),
    });
  });

  it("every settings and column write bumps", async () => {
    const t = convexTest(schema, modules);
    const { roomId, owner } = await seedRetro(t);
    let columnId = "";

    await expectEachBumps(t, roomId, {
      rename: () => owner.mutation(api.retro.rename, { roomId, name: "Renamed" }),
      updateSettings: () => owner.mutation(api.retro.updateSettings, { roomId, votesPerPerson: 5 }),
      updatePermissions: () =>
        owner.mutation(api.retro.updatePermissions, { roomId, permissions: DEFAULT_RETRO_PERMISSIONS }),
      addColumn: async () => {
        columnId = await owner.mutation(api.retro.addColumn, { roomId, title: "Kudos", emoji: "🎉", color: "orange" });
      },
      updateColumn: () => owner.mutation(api.retro.updateColumn, { roomId, columnId, title: "Thanks" }),
      removeColumn: () => owner.mutation(api.retro.removeColumn, { roomId, columnId }),
    });
  });

  it("every sticky write bumps", async () => {
    const t = convexTest(schema, modules);
    const { roomId, owner, mine, theirs } = await seedRetro(t);
    // Revealed, so the owner may stack someone else's sticky.
    await owner.mutation(api.retro.setStep, { roomId, step: "vote" });

    await expectEachBumps(t, roomId, {
      addSticky: () => stick(owner, roomId, "new"),
      updateSticky: () => owner.mutation(api.retro.updateSticky, { stickyId: mine, text: "edited" }),
      moveStickies: () =>
        owner.mutation(api.retro.moveStickies, { roomId, moves: [{ stickyId: theirs, position: { x: 5, y: 5 } }] }),
      stackSticky: () => owner.mutation(api.retro.stackSticky, { stickyId: theirs, ontoId: mine }),
      unstackSticky: () => owner.mutation(api.retro.unstackSticky, { stickyId: theirs, position: { x: 9, y: 9 } }),
      deleteSticky: () => owner.mutation(api.retro.deleteSticky, { stickyId: theirs }),
    });
  });

  it("a vote and taking it back both bump", async () => {
    const t = convexTest(schema, modules);
    const { roomId, owner, theirs } = await seedRetro(t);
    await owner.mutation(api.retro.setStep, { roomId, step: "vote" });

    await expectEachBumps(t, roomId, {
      vote: () => owner.mutation(api.retro.toggleVote, { stickyId: theirs }),
      unvote: () => owner.mutation(api.retro.toggleVote, { stickyId: theirs }),
    });
  });

  it("every action item write bumps", async () => {
    const t = convexTest(schema, modules);
    const { roomId, owner } = await seedRetro(t);
    let itemId: Id<"retroActionItems">;

    await expectEachBumps(t, roomId, {
      addActionItem: async () => {
        itemId = await owner.mutation(api.retro.addActionItem, { roomId, text: "Do it" });
      },
      updateActionItem: () => owner.mutation(api.retro.updateActionItem, { itemId, done: true }),
      deleteActionItem: () => owner.mutation(api.retro.deleteActionItem, { itemId }),
    });
  });

  it("starting the next retro bumps the one it follows", async () => {
    const t = convexTest(schema, modules);
    const { roomId, owner } = await seedRetro(t);

    await expectEachBumps(t, roomId, {
      startNext: () => owner.mutation(api.retro.startNext, { roomId }),
    });
  });

  it("a write on a clock less than an hour old leaves the room row alone", async () => {
    const t = convexTest(schema, modules);
    const { roomId, owner } = await seedRetro(t);
    const fresh = Date.now() - 60_000;
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { lastActivityAt: fresh }));

    await stick(owner, roomId, "new");

    expect(await lastActivityAt(t, roomId)).toBe(fresh);
  });

  it("a guest retro whose only sign of life in days is a sticky survives the sweep", async () => {
    const t = convexTest(schema, modules);
    const { roomId, owner } = await seedRetro(t);
    expect((await t.run((ctx) => ctx.db.get("rooms", roomId)))!.retained).toBe(false);
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { lastActivityAt: sixDaysAgo }));

    await stick(owner, roomId, "new");

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});
    expect(result.roomsScheduled).toBe(0);
  });
});
