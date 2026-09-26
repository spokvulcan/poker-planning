/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { presence } from "./model/presence";
import { type T, seedUser as seedNamedUser, seedRoom } from "./analytics.seeds";

// Account deletion: the user row and their memberships go; what they wrote
// stays. A sticky's `authorId`, a vote's `voterId` and an action item's
// `ownerId` dangle, and the reads render them as "Former member". A retro the account owned goes to whoever joined it first, or,
// with nobody else in it, is deleted with the account. Integration
// connections go the way Disconnect takes them. The auth provider's record
// is not this module's to touch.

const modules = import.meta.glob("./**/*.*s");

const FORMER_MEMBER = "Former member";

const seedUser = (t: T, authUserId: string, accountType?: "anonymous" | "permanent") =>
  seedNamedUser(t, authUserId, authUserId, accountType);
const as = (t: T, subject: string) => t.withIdentity({ subject });

const joinRoom = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/**
 * A retro the leaver owns, showing authors, with a sticky, a vote and an
 * action item of theirs in it. The stayer attends as a facilitator.
 */
async function seedLeaverRetro(t: T) {
  const leaverId = await seedUser(t, "leaver", "permanent");
  const leaver = as(t, "leaver");
  const roomId = await leaver.mutation(api.retro.create, { name: "R" });
  await joinRoom(t, roomId, "leaver");
  const stayerId = await joinRoom(t, roomId, "stayer");
  await leaver.mutation(api.roles.promoteFacilitator, { roomId, targetUserId: stayerId });
  await leaver.mutation(api.retro.updateSettings, { roomId, showAuthors: true });
  const stickyId = await leaver.mutation(api.retro.addSticky, {
    roomId,
    clientId: "s1",
    columnId: "c1",
    text: "Mine",
    position: { x: 0, y: 0 },
  });
  await leaver.mutation(api.retro.setStep, { roomId, step: "vote" });
  await leaver.mutation(api.retro.toggleVote, { stickyId });
  const itemId = await leaver.mutation(api.retro.addActionItem, { roomId, text: "Do it", ownerId: leaverId });
  return { roomId, leaverId, stayerId, stickyId, itemId };
}

describe("deleting an account", () => {
  it("removes the user row and their memberships, and leaves stickies, votes and action items in place with dangling references", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, leaverId, stickyId, itemId } = await seedLeaverRetro(t);

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    expect(await t.run((ctx) => ctx.db.get("users", leaverId))).toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db.query("roomMemberships").withIndex("by_user", (q) => q.eq("userId", leaverId)).collect()
      )
    ).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get("retroStickies", stickyId))).toMatchObject({ text: "Mine", authorId: leaverId });
    const votes = await t.run((ctx) =>
      ctx.db.query("retroStickyVotes").withIndex("by_voter", (q) => q.eq("voterId", leaverId)).collect()
    );
    expect(votes).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get("retroActionItems", itemId))).toMatchObject({ ownerId: leaverId });
    expect(await t.run((ctx) => ctx.db.get("rooms", roomId))).not.toBeNull();
  });

  it("the reads render the dangling references as Former member, and the vote still counts", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, leaverId, stickyId } = await seedLeaverRetro(t);
    await as(t, "leaver").mutation(api.users.deleteUser, {});

    const board = await as(t, "stayer").query(api.retro.board, { roomId });
    expect(board.stickies.find((s) => s._id === stickyId)).toMatchObject({
      text: "Mine",
      authorName: FORMER_MEMBER,
    });
    expect(await as(t, "stayer").query(api.retro.votesCast, { roomId })).toBe(1);
    const items = await as(t, "stayer").query(api.retro.actionItems, { roomId });
    expect(items).toEqual([expect.objectContaining({ text: "Do it", ownerId: leaverId, ownerName: FORMER_MEMBER })]);
  });

  it("hands a retro the account owned to whoever joined it first, who can then run and delete it", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await seedLeaverRetro(t);
    const stayerId = await t.run(async (ctx) =>
      (await ctx.db.query("users").withIndex("by_auth_user", (q) => q.eq("authUserId", "stayer")).first())!._id
    );
    await as(t, "leaver").mutation(api.users.deleteUser, {});

    const room = await t.query(api.rooms.get, { roomId });
    expect(room?.room.ownerId).toBe(stayerId);
    expect(room?.isOwnerAbsent).toBe(false);
    expect(room?.users.find((u) => u._id === stayerId)?.role).toBe("owner");
    await as(t, "stayer").mutation(api.retro.setStep, { roomId, step: "discuss" });
    await as(t, "stayer").mutation(api.retro.remove, { roomId });
  });

  it("keeps a guest's retro once it passes to a permanent account", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "guest", "anonymous");
    const roomId = await as(t, "guest").mutation(api.retro.create, { name: "Guest retro" });
    await joinRoom(t, roomId, "guest");
    await seedUser(t, "keeper", "permanent");
    await joinRoom(t, roomId, "keeper");
    expect((await t.run((ctx) => ctx.db.get("rooms", roomId)))!.retained).toBe(false);

    await as(t, "guest").mutation(api.users.deleteUser, {});

    expect((await t.run((ctx) => ctx.db.get("rooms", roomId)))!.retained).toBe(true);
  });

  it("deletes a retro nobody else joined along with the account", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "solo", "permanent");
    const roomId = await as(t, "solo").mutation(api.retro.create, { name: "Alone" });
    await joinRoom(t, roomId, "solo");

    await as(t, "solo").mutation(api.users.deleteUser, {});
    // The room cascade runs on real timers and reschedules itself until done.
    for (let i = 0; i < 50 && (await t.run((ctx) => ctx.db.get("rooms", roomId))); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await t.finishInProgressScheduledFunctions();
    }

    expect(await t.run((ctx) => ctx.db.get("rooms", roomId))).toBeNull();
  });
});

describe("presence on account deletion", () => {
  const listUser = (t: T, userId: Id<"users">) => t.run((ctx) => presence.listUser(ctx, userId));

  it("clears the user's presence in every room they were seen in, including rooms they left", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, leaverId, stayerId } = await seedLeaverRetro(t);
    const leftRoomId = await as(t, "leaver").mutation(api.retro.create, { name: "Left" });
    await joinRoom(t, leftRoomId, "leaver");
    await t.run(async (ctx) => {
      await presence.heartbeat(ctx, roomId, leaverId, "leaver-1", 10_000);
      await presence.heartbeat(ctx, leftRoomId, leaverId, "leaver-2", 10_000);
      await presence.heartbeat(ctx, roomId, stayerId, "stayer-1", 10_000);
    });
    await as(t, "leaver").mutation(api.users.leave, { roomId: leftRoomId, userId: leaverId });
    expect(await listUser(t, leaverId)).toHaveLength(2);

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    expect(await listUser(t, leaverId)).toEqual([]);
    expect(await t.run((ctx) => presence.listRoom(ctx, roomId))).toEqual([
      expect.objectContaining({ userId: stayerId }),
    ]);
  });

  it("clears a guest's presence when it merges into an existing permanent account", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "guest", "anonymous");
    const roomId = await as(t, "guest").mutation(api.retro.create, { name: "R" });
    const guestId = await joinRoom(t, roomId, "guest");
    await seedUser(t, "guest-permanent", "permanent");
    await t.run((ctx) => presence.heartbeat(ctx, roomId, guestId, "guest-1", 10_000));

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "guest",
      newAuthUserId: "guest-permanent",
      email: "guest@example.com",
    });

    expect(await t.run((ctx) => ctx.db.get("users", guestId))).toBeNull();
    expect(await listUser(t, guestId)).toEqual([]);
  });
});

describe("integration connections", () => {
  // convex-test runs scheduled jobs on a real setTimeout; faking it keeps the
  // disconnect tail pending until a test runs it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const seedConnection = (t: T, userId: Id<"users">, expiresAt = Date.now() + 3_600_000) =>
    t.run((ctx) =>
      ctx.db.insert("integrationConnections", {
        userId,
        provider: "jira",
        encryptedAccessToken: "enc-access",
        accessTokenIv: "iv",
        accessTokenAuthTag: "tag",
        encryptedRefreshToken: "enc-refresh",
        refreshTokenIv: "riv",
        refreshTokenAuthTag: "rtag",
        expiresAt,
        cloudId: "cloud-1",
        scopes: [],
        connectedAt: Date.now(),
        lastRefreshedAt: Date.now(),
      })
    );
  /** Maps a fresh room through the connection, with a live webhook when given one. */
  const seedMapping = async (t: T, connectionId: Id<"integrationConnections">, jiraWebhookId?: string) => {
    const roomId = await seedRoom(t);
    return t.run((ctx) =>
      ctx.db.insert("integrationMappings", {
        roomId,
        connectionId,
        provider: "jira",
        jiraProjectKey: "PROJ",
        jiraWebhookId,
        jiraWebhookRegisteredAt: jiraWebhookId ? Date.now() : undefined,
        autoImport: false,
        autoPushEstimates: true,
        createdAt: Date.now(),
      })
    );
  };
  const getConnection = (t: T, connectionId: Id<"integrationConnections">) =>
    t.run((ctx) => ctx.db.get("integrationConnections", connectionId));
  const mappingsOf = (t: T, connectionId: Id<"integrationConnections">) =>
    t.run((ctx) =>
      ctx.db.query("integrationMappings").withIndex("by_connection", (q) => q.eq("connectionId", connectionId)).collect()
    );
  /** Pending finalizeDisconnect jobs: each deregisters webhooks, then deletes its connection. */
  const disconnectTails = async (t: T) =>
    (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()))
      .filter((job) => job.name.endsWith(":finalizeDisconnect") && job.state.kind === "pending")
      .map((job) => job.args[0]);
  const connectionsShownTo = async (t: T, subject: string) =>
    (await as(t, subject).query(api.integrations.getConnections, {})).map((c) => c._id);
  const dueForRefresh = async (t: T) =>
    (
      await t.query(internal.integrations.tokenRefresh.getExpiringConnections, {
        provider: "jira",
        expiryThreshold: Date.now() + 45 * 60 * 1000,
      })
    ).map((c) => c._id);
  const link = (t: T, oldAuthUserId: string, newAuthUserId: string) =>
    t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId,
      newAuthUserId,
      email: `${newAuthUserId}@example.com`,
    });

  describe("on account deletion", () => {
    it("disconnects the account's connection the way Disconnect does, and its tokens stop being refreshed", async () => {
      const t = withComponents(convexTest(schema, modules));
      const leaverId = await seedUser(t, "leaver", "permanent");
      const connectionId = await seedConnection(t, leaverId, Date.now() - 1_000);
      await seedMapping(t, connectionId, "wh-1");
      await seedMapping(t, connectionId);
      expect(await dueForRefresh(t)).toEqual([connectionId]);

      await as(t, "leaver").mutation(api.users.deleteUser, {});

      expect(await mappingsOf(t, connectionId)).toEqual([]);
      // The row outlives the account only until the tail has deregistered
      // the live webhook with its credentials.
      expect(await disconnectTails(t)).toEqual([{ connectionId, webhookIds: ["wh-1"] }]);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await getConnection(t, connectionId)).toBeNull();
      expect(await dueForRefresh(t)).toEqual([]);
    });

    it("takes a guest's connection on sign-out, at once when no webhook is live", async () => {
      const t = withComponents(convexTest(schema, modules));
      const guestId = await seedUser(t, "guest", "anonymous");
      const connectionId = await seedConnection(t, guestId);
      await seedMapping(t, connectionId);

      await as(t, "guest").mutation(api.users.deleteUser, {});

      expect(await mappingsOf(t, connectionId)).toEqual([]);
      expect(await getConnection(t, connectionId)).toBeNull();
      expect(await disconnectTails(t)).toEqual([]);
    });
  });

  describe("on linking a guest to a permanent account", () => {
    it("keeps the connection where the guest's own row becomes the permanent account", async () => {
      const t = withComponents(convexTest(schema, modules));
      const guestId = await seedUser(t, "guest", "anonymous");
      const connectionId = await seedConnection(t, guestId);

      await link(t, "guest", "permanent");

      expect(await getConnection(t, connectionId)).toMatchObject({ userId: guestId });
      expect(await connectionsShownTo(t, "permanent")).toEqual([connectionId]);
    });

    it("moves the guest's connection into a permanent account without one, mappings and webhooks untouched", async () => {
      const t = withComponents(convexTest(schema, modules));
      const guestId = await seedUser(t, "guest", "anonymous");
      const connectionId = await seedConnection(t, guestId);
      const mappingId = await seedMapping(t, connectionId, "wh-1");
      const permanentId = await seedUser(t, "permanent", "permanent");

      await link(t, "guest", "permanent");

      expect(await t.run((ctx) => ctx.db.get("users", guestId))).toBeNull();
      expect(await getConnection(t, connectionId)).toMatchObject({ userId: permanentId });
      expect(await t.run((ctx) => ctx.db.get("integrationMappings", mappingId))).toMatchObject({
        connectionId,
        jiraWebhookId: "wh-1",
      });
      expect(await disconnectTails(t)).toEqual([]);
      expect(await connectionsShownTo(t, "permanent")).toEqual([connectionId]);
    });

    it("keeps the permanent account's own connection and disconnects the guest's", async () => {
      const t = withComponents(convexTest(schema, modules));
      const guestId = await seedUser(t, "guest", "anonymous");
      const guestConnectionId = await seedConnection(t, guestId);
      await seedMapping(t, guestConnectionId, "wh-guest");
      const permanentId = await seedUser(t, "permanent", "permanent");
      const ownConnectionId = await seedConnection(t, permanentId);
      const ownMappingId = await seedMapping(t, ownConnectionId, "wh-own");

      await link(t, "guest", "permanent");

      expect(await mappingsOf(t, guestConnectionId)).toEqual([]);
      expect(await disconnectTails(t)).toEqual([{ connectionId: guestConnectionId, webhookIds: ["wh-guest"] }]);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await getConnection(t, guestConnectionId)).toBeNull();
      expect(await connectionsShownTo(t, "permanent")).toEqual([ownConnectionId]);
      expect(await t.run((ctx) => ctx.db.get("integrationMappings", ownMappingId))).toMatchObject({
        connectionId: ownConnectionId,
        jiraWebhookId: "wh-own",
      });
    });
  });
});
