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
// or by the one issue, sticky or action item it acts on (room attendance),
// runs the named guard, and hands the handler the rows it loaded. It is the
// permission guard's one way in.

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

  it("never seats without the room: a membership that outlived its room is refused", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-ann");
    await t.run((ctx) => ctx.db.delete("rooms", roomId));

    await expect(
      t.withIdentity({ subject: "auth-ann" }).run((ctx) => requireRoomWrite(ctx, roomId))
    ).rejects.toThrow("Room not found");
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

  it("hands over the member a relationship verb acts on, as the verb names them", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const annId = await seedUser(t, "auth-ann");
    await t.run((ctx) =>
      ctx.db.insert("roomMemberships", { roomId, userId: annId, isSpectator: false, joinedAt: Date.now(), role: "owner" })
    );
    const bobId = await addMember(t, roomId, "auth-bob");

    const write = await t
      .withIdentity({ subject: "auth-ann" })
      .run((ctx) => requireRoomWrite(ctx, roomId, { kind: "relationship", verb: "remove", target: bobId }));

    expect(write.user._id).toBe(annId);
    // A verb that names its target hands it over, typed as there: no `!`.
    const target: { roomId: Id<"rooms">; userId: Id<"users"> } = write.target;
    expect(target).toMatchObject({ roomId, userId: bobId });
  });

  it("refuses a relationship verb whose target isn't in the room", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const annId = await seedUser(t, "auth-ann");
    await t.run((ctx) =>
      ctx.db.insert("roomMemberships", { roomId, userId: annId, isSpectator: false, joinedAt: Date.now(), role: "owner" })
    );
    const outsiderId = await seedUser(t, "auth-outsider");

    await expect(
      t
        .withIdentity({ subject: "auth-ann" })
        .run((ctx) => requireRoomWrite(ctx, roomId, { kind: "relationship", verb: "transfer", target: outsiderId }))
    ).rejects.toThrow("Target user is not a member of this room");
  });

  it("reads the caller, their membership and the room, one row each", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-ann");

    const metrics = await t.withIdentity({ subject: "auth-ann" }).run(async (ctx) => {
      await requireRoomWrite(ctx, roomId);
      return await ctx.meta.getTransactionMetrics();
    });

    expect(metrics.documentsRead.used).toBe(3);
  });

  it("decides the permission on the room attendance loaded, reading nothing twice", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t); // no permissions set: every category is open to everyone
    await addMember(t, roomId, "auth-ann");

    const metrics = await t.withIdentity({ subject: "auth-ann" }).run(async (ctx) => {
      await requireRoomWrite(ctx, roomId, { kind: "category", category: "roomSettings" });
      return await ctx.meta.getTransactionMetrics();
    });

    // The caller's users row, their membership and the room.
    expect(metrics.documentsRead.used).toBe(3);
  });

  it("reads each row it hands over once, the entity addressed included", async () => {
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

// The rules the step and room access exist for, held over every module's
// source text: a room write's handler takes its room and its caller from the
// step and works neither out again by hand, and a public read addressed to a
// room takes room access.
const sources = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./**/*.seeds.ts", "!./_generated/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The kinds of function a module registers. */
const KINDS = "query|mutation|action|internalQuery|internalMutation|internalAction";

/** One registered function: its name as Convex gives it ("integrations/jira:admitIssue"), kind, arguments and handler. */
interface Registration {
  name: string;
  kind: string;
  args: string;
  handler: string;
}

/** A module's source without its comments, so a comment can neither satisfy a rule nor break one. */
function withoutComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

/** Every function each module registers, from `export const name = kind({` to its closing `});`. */
const registered: Registration[] = Object.entries(sources).flatMap(([path, source]) => {
  const modulePath = path.replace(/^\.\//, "").replace(/\.ts$/, "");
  const pattern = new RegExp(`^export const (\\w+) = (${KINDS})\\(\\{([\\s\\S]*?)^\\}\\);`, "gm");
  return [...withoutComments(source).matchAll(pattern)].map(([, name, kind, body]) => {
    const at = body.search(/\bhandler\s*:/);
    return { name: `${modulePath}:${name}`, kind, args: body.slice(0, at), handler: body.slice(at) };
  });
});

/** How many functions the modules register, counted by their first line alone. */
const declared = Object.values(sources).reduce(
  (count, source) =>
    count + [...withoutComments(source).matchAll(new RegExp(`^export const \\w+ = (${KINDS})\\(`, "gm"))].length,
  0
);

/**
 * Arguments naming what a room read or write is addressed to: a room (by id,
 * or by the room id presence's component takes as a string, or its room
 * token), or an issue, a sticky or an action item, each of which is in one.
 */
const ADDRESSED =
  /v\.id\(\s*["'](rooms|issues|retroStickies|retroActionItems)["']\s*\)|\broom(Id|Token)\s*:/;

const writes = registered.filter(({ kind, args }) => /^(mutation|internalMutation)$/.test(kind) && ADDRESSED.test(args));
const reads = registered.filter(({ kind, args }) => kind === "query" && ADDRESSED.test(args));

/**
 * Joining names the room it seats the caller in, so it is the one room write
 * the step can't take: the step seats only a caller already in the room.
 */
const WAY_IN = "users:join";

/**
 * The server's own room writes, which nobody makes, so there is no caller to
 * seat: the auto-reveal the countdown schedules, each step of a room's
 * ending, and an estimate push a reveal queued before the estimate push
 * decided pushes (which records how it went on the room's mapping). Any other
 * write addressed to a room is a person's, internal ones included (the Jira
 * import's, which its action runs as its caller).
 */
const SERVER_WRITES = [
  "votingRound:autoReveal",
  "maintenance:deleteRoomAggregateChunk",
  "integrations/jira:decideScheduledPush",
];

/**
 * The room's public shell, read before the caller is in the room: the room
 * with its roster (what joining by link shows, ADR-0009), whether the caller
 * has a seat in it (what the room page asks to decide between the room and
 * the join dialog), and who has it open (presence's list, which the presence
 * component keys by the room). Every other public query addressed to a room
 * reads its contents and takes room access.
 */
const ROOM_SHELL = ["rooms:get", "users:getMyMembership", "presence:list"];

/** Code that works out the caller or the room itself: the caller module, a room read or the user id sent. */
const RESOLVES_ITSELF = /\b(findOrMakeUser|requireUser|requireCaller|getCaller)\(|\.get\(\s*["']rooms["']|args\.userId/;

/**
 * A write's code without the member a relationship verb acts on, where it is
 * named to the step: the one user id a write may hand on (whom `users.remove`
 * takes out), and only to the step, which loads that member.
 */
const withoutStepTarget = (handler: string) =>
  handler.replace(/(requireRoomWrite\([^()]*)\btarget:\s*args\.userId/g, "$1");

describe("the scan over every module", () => {
  it("reads every function a module registers", () => {
    expect(registered).toHaveLength(declared);
    expect(writes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["votes:pickCard", "presence:heartbeat", "integrations/jira:admitIssue", WAY_IN, ...SERVER_WRITES])
    );
    expect(reads.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["issues:list", "issues:getCurrent", "canvas:getCanvasNodes", ...ROOM_SHELL])
    );
  });
});

describe("the writes on the room-scoped step", () => {
  const onTheStep = writes.filter(({ name }) => name !== WAY_IN && !SERVER_WRITES.includes(name));

  it.each(onTheStep.map((write) => [write.name, write] as const))("%s takes its room and caller from it", (_, write) => {
    expect(write.handler).toContain("requireRoomWrite(");
    expect(withoutStepTarget(write.handler)).not.toMatch(RESOLVES_ITSELF);
  });
});

describe("the reads of a room's contents", () => {
  const contents = reads.filter(({ name }) => !ROOM_SHELL.includes(name));

  it.each(contents.map((read) => [read.name, read] as const))("%s takes room access", (_, read) => {
    expect(read.handler).toContain("requireRoomReader(");
  });
});
