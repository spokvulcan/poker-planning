/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import * as RoomAggregate from "./model/roomAggregate";
import { ROOM_OWNED_TABLES, RETRO_TABLES, type RoomOwnedTable } from "./model/roomAggregate";
import * as Cleanup from "./model/cleanup";
import * as Timer from "./model/timer";
import * as Canvas from "./model/canvas";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

type CountedTable =
  | RoomOwnedTable
  | "issueLinks"
  | "rooms"
  | "users"
  | "integrationConnections"
  | "webhookEvents";

async function countRows(t: T, table: CountedTable): Promise<number> {
  return t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
}

async function scheduledByName(t: T, suffix: string) {
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  );
  return scheduled.filter((s) => s.name.endsWith(suffix));
}

/**
 * Drains scheduled jobs on real timers. convex-test dispatches runAfter(0)
 * jobs through a real 0ms setTimeout, so yielding a few macrotasks lets them
 * fire; continuations schedule follow-up jobs, so loop until every row
 * reaches a terminal state. Jobs that fail (e.g. Jira deregistration, whose
 * seed tokens never decrypt) land in "failed" — terminal, and logged by the
 * actions themselves rather than silently.
 */
async function drainScheduled(t: T): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await t.finishInProgressScheduledFunctions();
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    const live = jobs.filter(
      (j) =>
        j.state.kind === "pending" &&
        // A deregistration retry is scheduled 5 minutes out; it never fires
        // within a test, so it must not hold the drain open.
        j.scheduledTime < Date.now() + 60_000
    );
    if (live.length === 0) return;
  }
  throw new Error("scheduled functions did not drain");
}

async function seedConnection(
  t: T,
  userId: Id<"users">
): Promise<Id<"integrationConnections">> {
  return t.run((ctx) =>
    ctx.db.insert("integrationConnections", {
      userId,
      provider: "jira",
      encryptedAccessToken: "enc-access",
      accessTokenIv: "iv",
      accessTokenAuthTag: "tag",
      expiresAt: Date.now() + 3_600_000,
      cloudId: "cloud-1",
      siteUrl: "https://team.atlassian.net",
      scopes: ["read:jira-work"],
      connectedAt: Date.now(),
      lastRefreshedAt: Date.now(),
    })
  );
}

async function seedMappingWithWebhook(
  t: T,
  roomId: Id<"rooms">,
  connectionId: Id<"integrationConnections">,
  jiraWebhookId: string
): Promise<Id<"integrationMappings">> {
  return t.run((ctx) =>
    ctx.db.insert("integrationMappings", {
      roomId,
      connectionId,
      provider: "jira",
      jiraProjectKey: "PROJ",
      jiraWebhookId,
      jiraWebhookRegisteredAt: Date.now(),
      autoImport: false,
      autoPushEstimates: true,
      createdAt: Date.now(),
    })
  );
}

async function seedRoom(t: T): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
    })
  );
}

async function seedIssue(
  t: T,
  roomId: Id<"rooms">,
  sequentialId = 1
): Promise<Id<"issues">> {
  return t.run((ctx) =>
    ctx.db.insert("issues", {
      roomId,
      sequentialId,
      title: `Issue ${sequentialId}`,
      status: "pending",
      createdAt: Date.now(),
      order: sequentialId,
    })
  );
}

async function seedIssueLink(
  t: T,
  issueId: Id<"issues">
): Promise<Id<"issueLinks">> {
  return t.run((ctx) =>
    ctx.db.insert("issueLinks", {
      issueId,
      provider: "jira",
      externalId: `PROJ-${crypto.randomUUID()}`,
      externalUrl: "https://example.atlassian.net/browse/PROJ-1",
      lastSyncedAt: Date.now(),
    })
  );
}

/**
 * Seeds one room with one row in EVERY room-owned table (plus the user and
 * integration connection those rows reference).
 */
async function seedFullRoom(
  t: T
): Promise<{ roomId: Id<"rooms">; userId: Id<"users">; issueId: Id<"issues"> }> {
  return t.run(async (ctx) => {
    const roomId = await ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
    });
    const userId = await ctx.db.insert("users", {
      authUserId: `auth-${crypto.randomUUID()}`,
      name: "U",
      createdAt: Date.now(),
    });
    await ctx.db.insert("roomMemberships", {
      roomId,
      userId,
      isSpectator: false,
      joinedAt: Date.now(),
    });
    await ctx.db.insert("votes", {
      roomId,
      userId,
      cardLabel: "5",
      cardValue: 5,
    });
    const issueId = await ctx.db.insert("issues", {
      roomId,
      sequentialId: 1,
      title: "Issue 1",
      status: "voting",
      createdAt: Date.now(),
      order: 0,
    });
    await ctx.db.insert("canvasNodes", {
      roomId,
      nodeId: "session-current",
      type: "session",
      position: { x: 0, y: 0 },
      data: {},
      lastUpdatedAt: Date.now(),
    });
    await ctx.db.insert("votingTimestamps", {
      roomId,
      issueId,
      votingStartedAt: Date.now(),
      roundNumber: 1,
    });
    await ctx.db.insert("individualVotes", {
      roomId,
      issueId,
      userId,
      cardLabel: "5",
      votedAt: Date.now(),
    });
    await ctx.db.insert("roomAnalyticsSnapshots", {
      roomId,
      history: {
        completedIssues: [
          {
            title: "Issue 1",
            votedAt: Date.now(),
            finalEstimate: "5",
            voteStats: { agreement: 100 },
          },
        ],
        individualVotes: [{ userId, cardLabel: "5", votedAt: Date.now() }],
      },
      computedAt: Date.now(),
    });
    const connectionId = await ctx.db.insert("integrationConnections", {
      userId,
      provider: "jira",
      encryptedAccessToken: "token",
      accessTokenIv: "iv",
      accessTokenAuthTag: "tag",
      expiresAt: Date.now(),
      scopes: [],
      connectedAt: Date.now(),
      lastRefreshedAt: Date.now(),
    });
    await ctx.db.insert("integrationMappings", {
      roomId,
      connectionId,
      provider: "jira",
      autoImport: false,
      autoPushEstimates: false,
      createdAt: Date.now(),
    });
    await ctx.db.insert("issueLinks", {
      issueId,
      provider: "jira",
      externalId: "PROJ-1",
      externalUrl: "https://example.atlassian.net/browse/PROJ-1",
      lastSyncedAt: Date.now(),
    });
    await seedRetroRows(ctx, roomId, userId);
    return { roomId, userId, issueId };
  });
}

/**
 * One row in each of the five retro tables (ADR-0016), so the cascade test
 * proves it empties them and the orphan test proves it never scans them.
 */
async function seedRetroRows(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("retros", {
    roomId,
    attribution: "named",
    format: { name: "F", prompts: [] },
    stages: [
      { id: "collect", kind: "collect", cardsVisible: "hidden", tallyVisible: "visible" },
    ],
    currentStageId: "collect",
    currentStageEnteredAt: now,
  });
  const clusterId = await ctx.db.insert("retroClusters", { roomId, name: "Group 1", createdAt: now });
  const cardId = await ctx.db.insert("retroCards", {
    roomId,
    clientId: crypto.randomUUID(),
    text: "card",
    promptId: "p",
    position: { x: 0, y: 0 },
    authorId: userId,
    clusterId,
    createdAt: now,
    updatedAt: now,
    committedAt: now,
  });
  await ctx.db.insert("retroVotes", {
    roomId,
    stageEntryId: "vote",
    voterId: userId,
    target: { kind: "card", id: cardId },
  });
  await ctx.db.insert("retroActions", {
    roomId,
    text: "do it",
    status: "open",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
}

describe("deleteRoomAggregateChunk (registered continuation)", () => {
  it("deletes the room and one row in every room-owned table through the continuation loop", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedFullRoom(t);

    // Phase 1 deletes the issue batch first and asks for a continuation…
    const first = await t.mutation(internal.maintenance.deleteRoomAggregateChunk, {
      roomId,
    });
    expect(first.done).toBe(false);
    // …which the scheduled follow-up mutations complete.
    await drainScheduled(t);

    expect(await countRows(t, "rooms")).toBe(0);
    for (const table of ROOM_OWNED_TABLES) {
      expect(await countRows(t, table)).toBe(0);
    }
    expect(await countRows(t, "issueLinks")).toBe(0);
    // The integration connection is user-owned, not room-owned: it survives.
    expect(await countRows(t, "integrationConnections")).toBe(1);
  });

  it("schedules webhook deregistration before deleting a mapped integration row", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId: `auth-${crypto.randomUUID()}`,
        name: "U",
        createdAt: Date.now(),
      })
    );
    const connectionId = await seedConnection(t, userId);
    await seedMappingWithWebhook(t, roomId, connectionId, "wh-room");

    const step = await t.run((ctx) =>
      RoomAggregate.deleteRoomAggregateChunk(ctx, roomId)
    );

    expect(step.done).toBe(true);
    expect(await countRows(t, "integrationMappings")).toBe(0);
    expect(await countRows(t, "rooms")).toBe(0);

    // Deleting the mapping alone would orphan the remote webhook — the
    // cascade must schedule the deregistration, and the user-owned
    // connection row must survive so that action can still authenticate.
    // The job may already have fired on real timers (and failed closed on the
    // seed tokens, scheduling its one disarmed retry) — so match the original
    // job (no attemptsLeft) rather than asserting an exact row count.
    const deregistrations = (await scheduledByName(t, ":deregisterWebhook")).filter(
      (j) => (j.args as [{ attemptsLeft?: number }])[0].attemptsLeft === undefined
    );
    expect(deregistrations).toHaveLength(1);
    expect(
      (deregistrations[0].args as [{ webhookId: string }])[0].webhookId
    ).toBe("wh-room");
    expect(await countRows(t, "integrationConnections")).toBe(1);
  });
});

describe("deleteRoomAggregateChunk (batching)", () => {
  it("deletes issues and their links in batches, the room row only once every table reads empty", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    for (const sequentialId of [1, 2, 3]) {
      const issueId = await seedIssue(t, roomId, sequentialId);
      await seedIssueLink(t, issueId);
    }

    // Batch size 1: each step deletes exactly one issue plus its one link.
    for (const issuesLeft of [2, 1, 0]) {
      const step = await t.run((ctx) =>
        RoomAggregate.deleteRoomAggregateChunk(ctx, roomId, 1)
      );
      expect(step).toEqual({ done: false, deleted: 2 });
      expect(await countRows(t, "issues")).toBe(issuesLeft);
      expect(await countRows(t, "issueLinks")).toBe(issuesLeft);
      // The room row survives until every owned table reads empty.
      expect(await countRows(t, "rooms")).toBe(1);
    }

    const final = await t.run((ctx) =>
      RoomAggregate.deleteRoomAggregateChunk(ctx, roomId, 1)
    );
    expect(final).toEqual({ done: true, deleted: 1 }); // the room row itself
    expect(await countRows(t, "rooms")).toBe(0);
  });
});

describe("removeInactiveRooms", () => {
  it("schedules one cascade per inactive room and leaves active rooms alone", async () => {
    const t = convexTest(schema, modules);
    const inactiveId = await t.run((ctx) =>
      ctx.db.insert("rooms", {
        name: "Stale",
        autoCompleteVoting: true,
        isGameOver: false,
        createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
        lastActivityAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
        retained: false,
      })
    );
    const activeId = await seedRoom(t);

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});

    expect(result.roomsScheduled).toBe(1);
    const cascades = await scheduledByName(t, ":deleteRoomAggregateChunk");
    expect(cascades).toHaveLength(1);
    expect((cascades[0].args as [{ roomId: string }])[0].roomId).toBe(
      inactiveId
    );

    // Nothing is deleted synchronously — each room's cascade is its own
    // mutation, so one oversized room can neither blow the cron's
    // transaction limits nor take the other rooms down with it.
    expect(await countRows(t, "rooms")).toBe(2);
    await drainScheduled(t);
    expect(await countRows(t, "rooms")).toBe(1);
    expect(await t.run((ctx) => ctx.db.get(activeId))).not.toBeNull();
  });

  it("leaves a room with recent timer-only activity alone", async () => {
    const t = convexTest(schema, modules);
    const roomId = await t.run((ctx) =>
      ctx.db.insert("rooms", {
        name: "Timer-only",
        autoCompleteVoting: true,
        isGameOver: false,
        createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
        lastActivityAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
        retained: false,
      })
    );
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId: "auth-t",
        name: "U",
        createdAt: Date.now(),
      })
    );
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

    // The room's only sign of life in days is a timer start — that must count
    // as activity or the cleanup cascade deletes a room in use.
    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
    );

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});
    expect(result.roomsScheduled).toBe(0);
    await drainScheduled(t);
    expect(await t.run((ctx) => ctx.db.get(roomId))).not.toBeNull();
  });

  it("leaves a room with recent canvas-only activity alone", async () => {
    const t = convexTest(schema, modules);
    const roomId = await t.run((ctx) =>
      ctx.db.insert("rooms", {
        name: "Canvas-only",
        autoCompleteVoting: true,
        isGameOver: false,
        createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
        lastActivityAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
        retained: false,
      })
    );
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId: "auth-c",
        name: "U",
        createdAt: Date.now(),
      })
    );
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

    // Only a canvas node move — no votes, no issues — keeps the room alive.
    await t.run((ctx) =>
      Canvas.updateNodePosition(ctx, {
        roomId,
        nodeId: "session-current",
        position: { x: 10, y: 20 },
        userId,
      })
    );

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});
    expect(result.roomsScheduled).toBe(0);
    await drainScheduled(t);
    expect(await t.run((ctx) => ctx.db.get(roomId))).not.toBeNull();
  });
});

describe("cleanupOrphanedData", () => {
  it("never scans the retro tables: an orphaned retro row survives the sweep", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedFullRoom(t);
    // Delete the room directly, bypassing the cascade, so every owned row is
    // orphaned. The poker tables are swept; the five retro tables are
    // permanently retained data the daily sweep must not walk (ADR-0016).
    await t.run((ctx) => ctx.db.delete(roomId));

    await t.run((ctx) => Cleanup.cleanupOrphanedData(ctx));

    expect(await countRows(t, "issues")).toBe(0);
    expect(await countRows(t, "votes")).toBe(0);
    for (const table of RETRO_TABLES) {
      expect(await countRows(t, table)).toBe(1);
    }
  });

  it("sweeps an issue whose room was deleted out from under it", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId);
    await seedIssueLink(t, issueId);

    // Delete the room directly, bypassing the cascade — this is exactly how
    // the old cleanupRoom used to leave issues behind.
    await t.run((ctx) => ctx.db.delete(roomId));

    const result = await t.mutation(internal.maintenance.cleanupOrphanedData, {});

    expect(result.orphanedIssues).toBe(1);
    // The orphaned issue's link is collected in the same sweep.
    expect(result.orphanedIssueLinks).toBe(1);
    expect(await countRows(t, "issues")).toBe(0);
    expect(await countRows(t, "issueLinks")).toBe(0);
  });

  it("sweeps an issueLink whose issue is gone while its room lives", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const keptIssueId = await seedIssue(t, roomId, 1);
    const goneIssueId = await seedIssue(t, roomId, 2);
    await seedIssueLink(t, keptIssueId);
    await seedIssueLink(t, goneIssueId);

    await t.run((ctx) => ctx.db.delete(goneIssueId));

    const result = await t.mutation(internal.maintenance.cleanupOrphanedData, {});

    expect(result.orphanedIssues).toBe(0);
    expect(result.orphanedIssueLinks).toBe(1);
    // Live rows survive.
    expect(await countRows(t, "rooms")).toBe(1);
    expect(await countRows(t, "issues")).toBe(1);
    expect(await countRows(t, "issueLinks")).toBe(1);
  });
});

describe("dangerouslyDeleteAllData", () => {
  it("still clears user-scoped tables and now clears every room-owned table", async () => {
    const t = convexTest(schema, modules);
    await seedFullRoom(t);
    await t.run((ctx) =>
      ctx.db.insert("webhookEvents", {
        eventKey: "evt-1",
        provider: "jira",
        processedAt: Date.now(),
      })
    );

    await t.mutation(internal.admin.dangerouslyDeleteAllData, {
      confirm: "I understand this will delete all data permanently",
    });

    // User-scoped and global tables it cleared before.
    expect(await countRows(t, "users")).toBe(0);
    expect(await countRows(t, "integrationConnections")).toBe(0);
    expect(await countRows(t, "webhookEvents")).toBe(0);
    // Room-owned tables — including votingTimestamps and individualVotes,
    // which the old hand-maintained list missed.
    expect(await countRows(t, "rooms")).toBe(0);
    for (const table of ROOM_OWNED_TABLES) {
      expect(await countRows(t, table)).toBe(0);
    }
    expect(await countRows(t, "issueLinks")).toBe(0);
  });
});
