/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as VotingRound from "./model/votingRound";
import * as Issues from "./model/issues";
import * as Canvas from "./model/canvas";
import * as Timer from "./model/timer";
import * as Rooms from "./model/rooms";
import * as Retro from "./model/retro";

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
  return (await t.run((ctx) => ctx.db.get(roomId)))!.lastActivityAt;
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
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));

    await t.run((ctx) => VotingRound.reset(ctx, roomId));

    await expectBumped(t, roomId, stale);
  });

  it("reveal bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId, "voting");
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    await expectBumped(t, roomId, stale);
  });

  it("abandon bumps", async () => {
    const t = convexTest(schema, modules);
    const stale = staleTimestamp();
    const roomId = await seedRoom(t, stale);
    const issueId = await seedIssue(t, roomId, "voting");
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));

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
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
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
    await t.run((ctx) => ctx.db.patch(roomId, { roomType: "retro" }));
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
    await t.run((ctx) => ctx.db.delete(roomId));

    // Throws if the chokepoint patches a missing document.
    await t.run((ctx) => Rooms.updateRoomActivity(ctx, roomId));
  });

  it("creating a retro stamps a live clock", async () => {
    const t = convexTest(schema, modules);
    const before = Date.now();
    const ownerId = await t.run((ctx) =>
      ctx.db.insert("users", { authUserId: "auth-o", name: "O", createdAt: Date.now() })
    );

    const roomId = await t.run((ctx) =>
      Retro.createRetro(ctx, {
        name: "R",
        ownerId,
        formatName: "Went well, Do differently, Ideas",
      })
    );

    expect(await lastActivityAt(t, roomId)).toBeGreaterThanOrEqual(before);
  });
});

describe("room activity — the Team's side of a retro bumps (spec §14)", () => {
  const HOUR = Rooms.RETRO_ACTIVITY_GRANULARITY_MS;
  const as = (t: T, subject: string) => t.withIdentity({ subject });

  async function seedPermanent(t: T, authUserId: string): Promise<Id<"users">> {
    return t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId,
        name: authUserId,
        createdAt: Date.now(),
        accountType: "permanent",
      })
    );
  }

  /** A Team with an admin and a member, and a retro by the member, seeded over an hour stale. */
  async function seedTeamRetro(t: T, teamed: boolean) {
    await seedPermanent(t, "auth-admin");
    const memberId = await seedPermanent(t, "auth-member");
    const teamId = await as(t, "auth-admin").mutation(api.teams.create, { name: "T" });
    const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
    await as(t, "auth-member").mutation(api.teams.joinByInvite, { inviteToken: team.inviteToken });
    const roomId = await as(t, "auth-member").mutation(api.retro.create, {
      name: "R",
      formatName: "Went well, Do differently, Ideas",
      ...(teamed ? { teamId } : {}),
    });
    const stale = Date.now() - HOUR - 60_000;
    await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
    return { teamId, roomId, memberId, stale };
  }

  it("adoptIntoTeam bumps", async () => {
    const t = convexTest(schema, modules);
    const { teamId, roomId, stale } = await seedTeamRetro(t, false);

    await as(t, "auth-member").mutation(api.retro.adoptIntoTeam, { roomId, teamId });

    await expectBumped(t, roomId, stale);
  });

  it("advance, setCardsVisible and setTimebox bump (spec §7)", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, false);
    const retro = (await t.run((ctx) =>
      ctx.db.query("retros").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique()
    ))!;
    const acts = [
      () => as(t, "auth-member").mutation(api.retro.advance, { roomId, toStageId: retro.stages[1].id }),
      () => as(t, "auth-member").mutation(api.retro.setCardsVisible, { roomId, stageId: retro.stages[1].id, value: "hidden" }),
      () => as(t, "auth-member").mutation(api.retro.setTimebox, { roomId, stageId: retro.stages[1].id, minutes: 5 }),
    ];
    for (const act of acts) {
      const stale = Date.now() - HOUR - 60_000;
      await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
      await act();
      await expectBumped(t, roomId, stale);
    }
  });

  it("every retroSettings mutation bumps (spec §14)", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, false);
    const retro = (await t.run((ctx) =>
      ctx.db.query("retros").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique()
    ))!;
    const me = as(t, "auth-member");
    const promptId = retro.format.prompts[0].id;
    const close = retro.stages[retro.stages.length - 1];
    const acts: (() => Promise<unknown>)[] = [
      () => me.mutation(api.retro.rename, { roomId, name: "Renamed" }),
      () => me.mutation(api.retro.setJoinPolicy, { roomId, joinPolicy: "permanentAccounts" }),
      () => me.mutation(api.retro.setCollectUntil, { roomId, collectUntil: Date.now() + 1000 }),
      () => me.mutation(api.retro.updatePrompt, { roomId, promptId, label: "Edited" }),
      () => me.mutation(api.retro.addPrompt, { roomId, label: "New", color: "pink" }),
      () => me.mutation(api.retro.removePrompt, { roomId, promptId: retro.format.prompts[1].id }),
      () => me.mutation(api.retro.addStage, { roomId, kind: "review", index: 1 }),
      () => me.mutation(api.retro.removeStage, { roomId, stageId: close.id }),
    ];
    for (const act of acts) {
      const stale = Date.now() - HOUR - 60_000;
      await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
      await act();
      await expectBumped(t, roomId, stale);
    }
    // Reorder over whatever the list now holds: the review entry was added at 1, close removed.
    const now = (await t.run((ctx) =>
      ctx.db.query("retros").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique()
    ))!;
    const ids = now.stages.map((s) => s.id);
    // Swap the two free entries after review (group, vote), keeping collect (current) and discuss.
    const swapped = [ids[0], ids[1], ids[3], ids[2], ids[4]];
    const stale = Date.now() - HOUR - 60_000;
    await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
    await me.mutation(api.retro.reorderStages, { roomId, stageIds: swapped });
    await expectBumped(t, roomId, stale);
  });

  it("every card mutation bumps (spec §14)", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, false);
    const retro = (await t.run((ctx) =>
      ctx.db.query("retros").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique()
    ))!;
    const me = as(t, "auth-member");
    const promptId = retro.format.prompts[0].id;
    const acts = [
      () => me.mutation(api.retro.createCard, { roomId, clientId: "c1", text: "hi", promptId, position: { x: 0, y: 0 } }),
      () => me.mutation(api.retro.updateCard, { roomId, clientId: "c1", text: "edited" }),
      () => me.mutation(api.retro.moveCards, { roomId, moves: [{ clientId: "c1", position: { x: 1, y: 1 } }] }),
      () => me.mutation(api.retro.deleteCard, { roomId, clientId: "c1" }),
    ];
    for (const act of acts) {
      const stale = Date.now() - HOUR - 60_000;
      await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
      await act();
      await expectBumped(t, roomId, stale);
    }
  });

  it("every action item mutation bumps (spec §14), the team page's completion included", async () => {
    const t = convexTest(schema, modules);
    const { roomId, memberId } = await seedTeamRetro(t, true);
    const me = as(t, "auth-member");
    let id: Id<"retroActions">;
    const acts = [
      async () => void (id = await me.mutation(api.retro.createAction, { roomId, text: "Do it" })),
      () => me.mutation(api.retro.updateAction, { roomId, actionId: id, text: "Do it well", dueAt: 1 }),
      () => me.mutation(api.retro.assignAction, { roomId, actionId: id, ownerId: memberId }),
      () => me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "done", note: "ok" }),
      () => me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "open" }),
      () => me.mutation(api.retro.deleteAction, { roomId, actionId: id }),
    ];
    for (const act of acts) {
      const stale = Date.now() - HOUR - 60_000;
      await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
      await act();
      await expectBumped(t, roomId, stale);
    }
  });

  it("every cluster mutation bumps (spec §14)", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, false);
    const retro = (await t.run((ctx) =>
      ctx.db.query("retros").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique()
    ))!;
    const me = as(t, "auth-member");
    const promptId = retro.format.prompts[0].id;
    for (const clientId of ["c1", "c2", "c3"]) {
      await me.mutation(api.retro.createCard, { roomId, clientId, text: clientId, promptId, position: { x: 0, y: 0 } });
    }
    let a: Id<"retroClusters">;
    let b: Id<"retroClusters">;
    const acts = [
      async () => void (a = await me.mutation(api.retro.formCluster, { roomId, clientIds: ["c1"] })),
      async () => void (b = await me.mutation(api.retro.formCluster, { roomId, clientIds: ["c2"] })),
      () => me.mutation(api.retro.addToCluster, { roomId, clusterId: a, clientIds: ["c3"] }),
      () => me.mutation(api.retro.removeFromCluster, { roomId, clientIds: ["c3"] }),
      () => me.mutation(api.retro.renameCluster, { roomId, clusterId: a, name: "A" }),
      () => me.mutation(api.retro.mergeClusters, { roomId, from: b, into: a }),
      () => me.mutation(api.retro.dissolveCluster, { roomId, clusterId: a }),
    ];
    for (const act of acts) {
      const stale = Date.now() - HOUR - 60_000;
      await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
      await act();
      await expectBumped(t, roomId, stale);
    }
  });

  it("every dot mutation bumps (spec §14)", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, false);
    const retro = (await t.run((ctx) =>
      ctx.db.query("retros").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique()
    ))!;
    const me = as(t, "auth-member");
    await me.mutation(api.retro.createCard, { roomId, clientId: "c1", text: "c1", promptId: retro.format.prompts[0].id, position: { x: 0, y: 0 } });
    const card = (await t.run((ctx) =>
      ctx.db.query("retroCards").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique()
    ))!;
    // A budget on the current entry: the kind is never the test (ADR-0010).
    await t.run((ctx) =>
      ctx.db.patch(retro._id, {
        stages: retro.stages.map((s) => (s.id === retro.currentStageId ? { ...s, voteBudget: 3 } : s)),
      })
    );
    const target = { kind: "card" as const, id: card._id };
    const acts = [
      () => me.mutation(api.retro.placeDot, { roomId, target }),
      () => me.mutation(api.retro.removeDot, { roomId, target }),
    ];
    for (const act of acts) {
      const stale = Date.now() - HOUR - 60_000;
      await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
      await act();
      await expectBumped(t, roomId, stale);
    }
  });

  it("every walk act bumps (spec §14)", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, false);
    const retro = (await t.run((ctx) =>
      ctx.db.query("retros").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique()
    ))!;
    const me = as(t, "auth-member");
    await me.mutation(api.retro.createCard, { roomId, clientId: "c1", text: "c1", promptId: retro.format.prompts[0].id, position: { x: 0, y: 0 } });
    await me.mutation(api.retro.advance, { roomId, toStageId: retro.stages.find((s) => s.kind === "discuss")!.id });
    await me.mutation(api.retro.createCard, { roomId, clientId: "c2", text: "c2", promptId: retro.format.prompts[0].id, position: { x: 0, y: 0 } });
    const cards = await t.run((ctx) =>
      ctx.db.query("retroCards").withIndex("by_room", (q) => q.eq("roomId", roomId)).collect()
    );
    const c1 = cards.find((c) => c.clientId === "c1")!._id;
    const c2 = cards.find((c) => c.clientId === "c2")!._id;
    const acts = [
      () => me.mutation(api.retro.setWalkCursor, { roomId, index: 0 }),
      () => me.mutation(api.retro.markCovered, { roomId, topicId: c1, covered: true }),
      () => me.mutation(api.retro.raise, { roomId, topicRef: { kind: "card", id: c2 } }),
      // A no-op raise is still a person's act.
      () => me.mutation(api.retro.raise, { roomId, topicRef: { kind: "card", id: c2 } }),
    ];
    for (const act of acts) {
      const stale = Date.now() - HOUR - 60_000;
      await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
      await act();
      await expectBumped(t, roomId, stale);
    }
  });

  it("ratchet bumps (spec §14)", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stale } = await seedTeamRetro(t, false);

    await as(t, "auth-member").mutation(api.retro.ratchet, { roomId });

    await expectBumped(t, roomId, stale);
  });

  it("claim bumps", async () => {
    const t = convexTest(schema, modules);
    const { roomId, memberId, stale } = await seedTeamRetro(t, true);
    await as(t, "auth-admin").mutation(api.users.join, { roomId, name: "A", authUserId: "auth-admin" });
    await as(t, "auth-member").mutation(api.users.leave, { roomId, userId: memberId });
    await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));

    await as(t, "auth-admin").mutation(api.retro.claim, { roomId });

    await expectBumped(t, roomId, stale);
  });
});
