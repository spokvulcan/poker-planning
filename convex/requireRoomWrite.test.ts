/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { requireRoomWrite, type RoomAddress } from "./model/auth";
import { DEFAULT_PERMISSIONS } from "./permissions";
import { type T, seedRoom, seedUser, addMembership } from "./analytics.seeds";

// The room-scoped step every room write starts with (`requireRoomWrite`): it
// seats the caller in the room the write is addressed to, by the room itself
// or by the one issue, sticky or action item it acts on, runs the named
// guard, and hands the handler the rows it loaded.

const modules = import.meta.glob("./**/*.*s");

async function addMember(t: T, roomId: Id<"rooms">, authUserId: string): Promise<Id<"users">> {
  const userId = await seedUser(t, authUserId);
  await addMembership(t, roomId, userId, Date.now());
  return userId;
}

describe("requireRoomWrite — the room-scoped step", () => {
  it("seats a member of the room: hands over the caller, their membership and the room", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, "Sprint 12");
    const annId = await addMember(t, roomId, "auth-ann");

    const write = await t.withIdentity({ subject: "auth-ann" }).run((ctx) => requireRoomWrite(ctx, roomId));

    expect(write.user._id).toBe(annId);
    expect(write.membership).toMatchObject({ roomId, userId: annId });
    expect(write.room).toMatchObject({ _id: roomId, name: "Sprint 12" });
  });

  it("refuses a caller who isn't signed in", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-ann");

    await expect(t.run((ctx) => requireRoomWrite(ctx, roomId))).rejects.toThrow("Not authenticated");
  });

  it("refuses a signed-in caller who isn't in the room", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-ann");
    await seedUser(t, "auth-bob");

    await expect(
      t.withIdentity({ subject: "auth-bob" }).run((ctx) => requireRoomWrite(ctx, roomId))
    ).rejects.toMatchObject({ data: { code: "forbidden", message: "Not a member of this room" } });
  });

  it("runs the permission guard it is named, refusing a denied action with the resolved decision's message", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await t.run((ctx) =>
      ctx.db.patch("rooms", roomId, { permissions: { ...DEFAULT_PERMISSIONS, issueManagement: "facilitators" } })
    );
    await addMember(t, roomId, "auth-ann"); // a participant

    await expect(
      t
        .withIdentity({ subject: "auth-ann" })
        .run((ctx) => requireRoomWrite(ctx, roomId, { kind: "category", category: "issueManagement" }))
    ).rejects.toMatchObject({
      data: { code: "forbidden", message: "Only facilitators and the owner can do this." },
    });
  });

  it("hands over the member a relationship verb acts on", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const annId = await seedUser(t, "auth-ann");
    await t.run((ctx) =>
      ctx.db.insert("roomMemberships", { roomId, userId: annId, isSpectator: false, joinedAt: Date.now(), role: "owner" })
    );
    const bobId = await addMember(t, roomId, "auth-bob");

    const write = await t
      .withIdentity({ subject: "auth-ann" })
      .run((ctx) => requireRoomWrite(ctx, roomId, { kind: "relationship", verb: "remove" }, bobId));

    expect(write.user._id).toBe(annId);
    expect(write.target).toMatchObject({ roomId, userId: bobId });
  });

  it("reads each row it hands over once, the room included", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t); // no permissions set: every category is open to everyone
    await addMember(t, roomId, "auth-ann");
    const issueId = await t.run((ctx) =>
      ctx.db.insert("issues", { roomId, sequentialId: 1, title: "Login", status: "pending", createdAt: Date.now(), order: 0 })
    );

    const metrics = await t.withIdentity({ subject: "auth-ann" }).run(async (ctx) => {
      await requireRoomWrite(ctx, { issue: issueId }, { kind: "category", category: "issueManagement" });
      return await ctx.meta.getTransactionMetrics();
    });

    // The issue, the caller's users row, their membership and the room.
    expect(metrics.documentsRead.used).toBe(4);
  });
});

/**
 * Each entity a write can be addressed by: the table it lives in, how to put
 * one in a room (by `authorId`, where it has an author), and what a write
 * addressed to one that is gone is refused with.
 */
const ADDRESSABLE = [
  {
    entity: "issue",
    table: "issues",
    put: async (t: T, roomId: Id<"rooms">): Promise<RoomAddress> => ({
      issue: await t.run((ctx) =>
        ctx.db.insert("issues", { roomId, sequentialId: 1, title: "Login", status: "pending", createdAt: Date.now(), order: 0 })
      ),
    }),
    gone: "Issue not found",
  },
  {
    entity: "sticky",
    table: "retroStickies",
    put: async (t: T, roomId: Id<"rooms">, authorId: Id<"users">): Promise<RoomAddress> => ({
      sticky: await t.run((ctx) =>
        ctx.db.insert("retroStickies", {
          roomId,
          clientId: "sticky-1",
          columnId: "c1",
          text: "Standups ran long",
          authorId,
          position: { x: 0, y: 0 },
          createdAt: Date.now(),
        })
      ),
    }),
    gone: "That sticky is gone.",
  },
  {
    entity: "action item",
    table: "retroActionItems",
    put: async (t: T, roomId: Id<"rooms">): Promise<RoomAddress> => ({
      actionItem: await t.run((ctx) =>
        ctx.db.insert("retroActionItems", { roomId, text: "Timebox standups", done: false, createdAt: Date.now() })
      ),
    }),
    gone: "That action item is gone.",
  },
] as const;

describe.each(ADDRESSABLE)("a write addressed by the $entity it acts on", ({ table, put, gone }) => {
  /** The entity, in Bob's room, and "auth-ann", who is in a room of her own. */
  async function inBobsRoom(t: T) {
    const annId = await addMember(t, await seedRoom(t, "Ann's room"), "auth-ann");
    const bobsRoom = await seedRoom(t, "Bob's room");
    const address = await put(t, bobsRoom, await addMember(t, bobsRoom, "auth-bob"));
    const [[key, id]] = Object.entries(address) as [string, Id<typeof table>][];
    return { annId, bobsRoom, address, key, id };
  }
  const asAnn = (t: T) => t.withIdentity({ subject: "auth-ann" });

  it("lands in the room it is in, and hands it over", async () => {
    const t = convexTest(schema, modules);
    const { annId, bobsRoom, address, key, id } = await inBobsRoom(t);
    await addMembership(t, bobsRoom, annId, Date.now());

    const write = await asAnn(t).run((ctx) => requireRoomWrite(ctx, address));

    expect(write.room._id).toBe(bobsRoom);
    expect(write.membership).toMatchObject({ roomId: bobsRoom, userId: annId });
    expect(write).toHaveProperty([key, "_id"], id);
  });

  it("refuses one from a room the caller isn't in", async () => {
    const t = convexTest(schema, modules);
    const { address } = await inBobsRoom(t);

    await expect(asAnn(t).run((ctx) => requireRoomWrite(ctx, address))).rejects.toMatchObject({
      data: { code: "forbidden", message: "Not a member of this room" },
    });
  });

  it("refuses one that is gone", async () => {
    const t = convexTest(schema, modules);
    const { annId, bobsRoom, address, id } = await inBobsRoom(t);
    await addMembership(t, bobsRoom, annId, Date.now());
    await t.run((ctx) => ctx.db.delete(table, id));

    await expect(asAnn(t).run((ctx) => requireRoomWrite(ctx, address))).rejects.toMatchObject({
      data: { code: "missing", message: gone },
    });
  });
});

// The rule the step exists for: a room write's handler takes its room and its
// caller from the step, and works neither out again by hand. The modules
// whose writes are on the step, as source text.
const sources = import.meta.glob(
  [
    "./canvas.ts",
    "./timer.ts",
    "./retro.ts",
    "./votes.ts",
    "./issues.ts",
    "./rooms.ts",
    "./roles.ts",
    "./users.ts",
    "./integrations.ts",
  ],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

/**
 * Joining names the room it seats the caller in, so it is the one room write
 * the step can't take: the step seats only a caller already in the room.
 */
const WAY_IN = { file: "./users.ts", write: "join" };

/**
 * Each public write in a module's source that lands in a room, by name: its
 * code up to the next export, comments left out. A write that names no room,
 * issue, sticky or action item, such as opening a retro, lands in none yet.
 */
function writesIn(source: string): [string, string][] {
  const code = source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  return [...code.matchAll(/export const (\w+) = mutation\(([\s\S]*?)(?=\nexport |$)/g)]
    .filter(([, , body]) => ADDRESSED.test(body))
    .map(([, name, body]) => [name, body]);
}

/** An argument naming what a room write can be addressed by (`RoomAddress`): a room, an issue, a sticky or an action item. */
const ADDRESSED = /v\.id\(\s*["'](rooms|issues|retroStickies|retroActionItems)["']\s*\)/;

/** Code that works out the caller or the room itself: another guard, the caller module, a room read or the user id sent. */
const RESOLVES_ITSELF =
  /\b(requireRoomMember|requireCan|requireCanForUser|findOrMakeUser|requireUser|requireCaller|getCaller)\(|\.get\(\s*["']rooms["']|args\.userId/;

/**
 * A write's code without the member a relationship verb acts on, where it is
 * named to the step: the one user id a write may hand on (whom `users.remove`
 * takes out), and only to the step, which loads that member.
 */
const withoutStepTarget = (body: string) =>
  body.replace(/(requireRoomWrite\([^()]*),\s*args\.userId(?=\s*\))/g, "$1");

describe("the writes on the room-scoped step", () => {
  it.each(Object.entries(sources))("in %s take their room and caller from it", (file, source) => {
    const writes = writesIn(source).filter(([name]) => !(file === WAY_IN.file && name === WAY_IN.write));
    expect(writes.length).toBeGreaterThan(0);
    for (const [name, body] of writes) {
      expect(body, name).toContain("requireRoomWrite(");
      expect(withoutStepTarget(body), name).not.toMatch(RESOLVES_ITSELF);
    }
  });
});
