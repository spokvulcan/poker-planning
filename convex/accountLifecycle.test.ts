/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { userRows } from "./model/accountLifecycle";
import { presence } from "./model/presence";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// An account's two endings (ADR-0030): deletion and a guest signing in. Every
// module keeping rows about a person registers how it lets go of them; these
// tests check the registry covers the schema and drive both endings end to end.

const modules = import.meta.glob("./**/*.*s");

const seedUser = (t: T, authUserId: string, accountType?: "anonymous" | "permanent") =>
  seedNamedUser(t, authUserId, authUserId, accountType);
const as = (t: T, subject: string) => t.withIdentity({ subject });
const join = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });
const room = (t: T, roomId: Id<"rooms">) => t.run((ctx) => ctx.db.get("rooms", roomId));
const membership = (t: T, roomId: Id<"rooms">, userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db
      .query("roomMemberships")
      .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .first()
  );

type Validator = {
  kind: string;
  tableName?: string;
  fields?: Record<string, Validator>;
  element?: Validator;
  members?: Validator[];
  value?: Validator;
};

/** Every stored field, as `table.path`, whose validator holds a user id. */
function userIdFields(): string[] {
  const found: string[] = [];
  const walk = (validator: Validator, path: string) => {
    if (validator.kind === "id" && validator.tableName === "users") found.push(path);
    for (const [name, field] of Object.entries(validator.fields ?? {})) walk(field, `${path}.${name}`);
    if (validator.element) walk(validator.element, path);
    if (validator.value) walk(validator.value, path);
    for (const member of validator.members ?? []) walk(member, path);
  };
  for (const [table, definition] of Object.entries(schema.tables)) {
    walk((definition as unknown as { validator: Validator }).validator, table);
  }
  return [...new Set(found)];
}

describe("the registry", () => {
  const claims = userRows().flatMap((rows) => rows.fields);

  it("finds the fields that name a user, nested ones included", () => {
    expect(userIdFields()).toEqual(
      expect.arrayContaining(["rooms.ownerId", "votes.userId", "roomAnalyticsSnapshots.history.individualVotes.userId"])
    );
  });

  it("claims every stored field that names a user, so none is left behind by a deletion or a sign-in", () => {
    const unclaimed = userIdFields().filter(
      (field) => !claims.some((claim) => field === claim || field.startsWith(`${claim}.`))
    );
    expect(unclaimed).toEqual([]);
  });

  it("gives each field exactly one owner", () => {
    expect(claims.length).toBe(new Set(claims).size);
  });

  it("covers the presence component, which names people outside the schema", () => {
    expect(claims).toContain("presence");
  });
});

describe("deleting an account", () => {
  it("hands a poker room it owned to whoever joined first, owner role and all", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "leaver");
    const roomId = await as(t, "leaver").mutation(api.rooms.create, { name: "Planning" });
    const firstId = await join(t, roomId, "first");
    await join(t, roomId, "second");

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    expect((await room(t, roomId))?.ownerId).toBe(firstId);
    expect((await membership(t, roomId, firstId))?.role).toBe("owner");
    // The new owner runs the room: owner-level acts go through.
    await as(t, "first").mutation(api.roles.updatePermissions, {
      roomId,
      permissions: { revealCards: "owner", gameFlow: "everyone", issueManagement: "everyone", roomSettings: "everyone" },
    });
  });

  it("keeps a poker room nobody else joined for whoever joins it next, who takes it over", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "leaver");
    const roomId = await as(t, "leaver").mutation(api.rooms.create, { name: "Planning" });

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    const cascades = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(cascades.some((job) => job.name.endsWith(":deleteRoomAggregateChunk"))).toBe(false);
    const nextId = await join(t, roomId, "next");
    expect((await room(t, roomId))?.ownerId).toBe(nextId);
    expect((await membership(t, roomId, nextId))?.role).toBe("owner");
    expect((await as(t, "next").query(api.rooms.get, { roomId }))?.isOwnerAbsent).toBe(false);
  });

  it("deletes a retro nobody else joined along with the account (ADR-0026)", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "leaver", "permanent");
    const roomId = await as(t, "leaver").mutation(api.retro.create, { name: "Alone" });

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    const cascades = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(cascades.some((job) => job.name.endsWith(":deleteRoomAggregateChunk") && job.args[0].roomId === roomId)).toBe(
      true
    );
  });

  it("disconnects its integrations: the connection and its tokens go", async () => {
    const t = withComponents(convexTest(schema, modules));
    const userId = await seedUser(t, "leaver", "permanent");
    await t.run((ctx) =>
      ctx.db.insert("integrationConnections", {
        userId,
        provider: "jira",
        encryptedAccessToken: "ciphertext",
        accessTokenIv: "iv",
        accessTokenAuthTag: "tag",
        expiresAt: Date.now() + 60_000,
        scopes: [],
        connectedAt: Date.now(),
        lastRefreshedAt: Date.now(),
      })
    );

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    expect(await t.run((ctx) => ctx.db.query("integrationConnections").collect())).toEqual([]);
  });

  it("leaves the clocks of the rooms it was in alone: an account going is not room activity", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
    await join(t, roomId, "leaver");
    const stale = Date.now() - 60_000;
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { lastActivityAt: stale }));

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    expect((await room(t, roomId))?.lastActivityAt).toBe(stale);
  });
});

describe("a guest signing in", () => {
  it("keeps the owner role in a room the account had already joined (the sign-in race)", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "guest");
    const roomId = await as(t, "guest").mutation(api.retro.create, { name: "Sprint 41 retro" });
    // The room page joins with the new account before the guest is folded in.
    const accountId = await seedUser(t, "account", "permanent");
    await join(t, roomId, "account");

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "guest",
      newAuthUserId: "account",
      email: "a@example.com",
    });

    expect(await room(t, roomId)).toMatchObject({ ownerId: accountId, retained: true });
    expect((await membership(t, roomId, accountId))?.role).toBe("owner");
    // So the owner can act as one: deleting their own retro goes through.
    await as(t, "account").mutation(api.retro.remove, { roomId });
  });

  it("keeps a facilitator role the guest held in a room the account had joined", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
    const guestId = await join(t, roomId, "guest");
    await as(t, "owner").mutation(api.roles.promoteFacilitator, { roomId, targetUserId: guestId });
    const accountId = await seedUser(t, "account", "permanent");
    await join(t, roomId, "account");

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "guest",
      newAuthUserId: "account",
      email: "a@example.com",
    });

    expect((await membership(t, roomId, accountId))?.role).toBe("facilitator");
    expect(await membership(t, roomId, guestId)).toBeNull();
  });

  it("brings the guest's player node and integration to the account", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
    const guestId = await join(t, roomId, "guest");
    await t.run((ctx) =>
      ctx.db.insert("integrationConnections", {
        userId: guestId,
        provider: "jira",
        encryptedAccessToken: "ciphertext",
        accessTokenIv: "iv",
        accessTokenAuthTag: "tag",
        expiresAt: Date.now() + 60_000,
        scopes: [],
        connectedAt: Date.now(),
        lastRefreshedAt: Date.now(),
      })
    );
    const accountId = await seedUser(t, "account", "permanent");

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "guest",
      newAuthUserId: "account",
      email: "a@example.com",
    });

    const players = await t.run((ctx) =>
      ctx.db
        .query("canvasNodes")
        .withIndex("by_room_type", (q) => q.eq("roomId", roomId).eq("type", "player"))
        .collect()
    );
    expect(players.map((node) => node.data.userId).sort()).toEqual([accountId, (await room(t, roomId))!.ownerId].sort());
    expect(await t.run((ctx) => ctx.db.query("integrationConnections").collect())).toMatchObject([
      { userId: accountId },
    ]);
    expect(await t.run((ctx) => ctx.db.get("users", guestId))).toBeNull();
  });

  it("clears the guest's presence: the browser heartbeats as the account from then on", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
    const guestId = await join(t, roomId, "guest");
    await seedUser(t, "account", "permanent");
    await t.run((ctx) => presence.heartbeat(ctx, roomId, guestId, "session", 10_000));

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "guest",
      newAuthUserId: "account",
      email: "a@example.com",
    });

    expect(await t.run((ctx) => presence.listUser(ctx, guestId))).toEqual([]);
  });
});
