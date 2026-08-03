/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import * as Cleanup from "./model/cleanup";
import { ROOM_OWNED_TABLES, type RoomOwnedTable } from "./model/roomAggregate";

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

async function seedRoom(t: T): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
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
    return { roomId, userId, issueId };
  });
}

describe("deleteRoomAggregate", () => {
  it("deletes the room and one row in every room-owned table", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedFullRoom(t);

    await t.run((ctx) => Cleanup.cleanupRoom(ctx, roomId));

    // Against the old cleanupRoom, `issues` was never deleted, so
    // countRows("issues") would still be 1 and this test would fail.
    expect(await countRows(t, "rooms")).toBe(0);
    for (const table of ROOM_OWNED_TABLES) {
      expect(await countRows(t, table)).toBe(0);
    }
    expect(await countRows(t, "issueLinks")).toBe(0);
  });
});

describe("cleanupOrphanedData", () => {
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
