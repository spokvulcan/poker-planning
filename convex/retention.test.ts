/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { withComponents } from "./components.setup";
import type { Id } from "./_generated/dataModel";
import * as Rooms from "./model/rooms";
import * as Retro from "./model/retro";
import { seedRoom, seedUser } from "./analytics.seeds";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

/**
 * Retention: `retained` is the sweep's only discriminator. Every writer
 * stamps it on new rows (a poker room never; a retro when its owner has a
 * permanent account), account linking retains the retros a guest owns once
 * the account turns permanent, and the sweep deletes a non-retained room
 * after five quiet days while leaving a retained one alone regardless of
 * age or room type.
 */

const TEN_DAYS_AGO = Date.now() - 10 * 24 * 60 * 60 * 1000;

async function seedStaleRoom(
  t: T,
  opts: { retained: boolean; roomType?: "canvas" | "retro" }
): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: opts.retained ? "kept" : "stale",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: TEN_DAYS_AGO,
      lastActivityAt: TEN_DAYS_AGO,
      retained: opts.retained,
      ...(opts.roomType ? { roomType: opts.roomType } : {}),
    })
  );
}

async function scheduledCascadeRoomIds(t: T): Promise<Set<string>> {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  );
  return new Set(
    jobs
      .filter((j) => j.name.endsWith(":deleteRoomAggregateChunk"))
      .map((j) => (j.args as [{ roomId: string }])[0].roomId)
  );
}

describe("retained: writers", () => {
  it("createRoom stamps a new room retained: false", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await t.run((ctx) =>
      Rooms.createRoom(ctx, { name: "New", votingScale: { type: "fibonacci" } })
    );
    const room = await t.run((ctx) => ctx.db.get("rooms", roomId));
    expect(room?.retained).toBe(false);
  });

  it("the analytics seed helper stamps retained: false", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedRoom(t);
    const room = await t.run((ctx) => ctx.db.get("rooms", roomId));
    expect(room?.retained).toBe(false);
  });

  it("createRetro stamps retained by the owner's account: true for a permanent account, false for a guest", async () => {
    const t = withComponents(convexTest(schema, modules));
    const guestId = await seedUser(t, "auth-guest", "G");
    const permanentId = await seedUser(t, "auth-perm", "P", "permanent");

    const retainedFor = async (ownerId: Id<"users">) => {
      const roomId = await t.run(async (ctx) =>
        Retro.createRetro(ctx, { name: "Retro", owner: (await ctx.db.get("users", ownerId))! })
      );
      return (await t.run((ctx) => ctx.db.get("rooms", roomId)))?.retained;
    };

    expect(await retainedFor(guestId)).toBe(false);
    expect(await retainedFor(permanentId)).toBe(true);
  });
});

describe("retained: account linking", () => {
  /** A guest who owns a retro and a poker room, both unretained. */
  async function seedGuestRooms(t: T) {
    const guestId = await seedUser(t, "auth-guest", "G");
    const retroId = await t.run(async (ctx) =>
      Retro.createRetro(ctx, { name: "Retro", owner: (await ctx.db.get("users", guestId))! })
    );
    const pokerId = await t.run((ctx) => Rooms.createRoom(ctx, { name: "Poker", ownerId: guestId }));
    return { retroId, pokerId };
  }

  const retainedOf = async (t: T, roomId: Id<"rooms">) =>
    (await t.run((ctx) => ctx.db.get("rooms", roomId)))?.retained;

  it("a guest who signs in keeps the retros they own, and only the retros", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { retroId, pokerId } = await seedGuestRooms(t);
    expect(await retainedOf(t, retroId)).toBe(false);

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "auth-guest",
      newAuthUserId: "auth-new",
      email: "guest@example.com",
    });

    expect(await retainedOf(t, retroId)).toBe(true);
    expect(await retainedOf(t, pokerId)).toBe(false);
  });

  it("a guest merged into an existing permanent account hands it their retros, retained", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { retroId } = await seedGuestRooms(t);
    const permanentId = await seedUser(t, "auth-perm", "P", "permanent");

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "auth-guest",
      newAuthUserId: "auth-perm",
      email: "perm@example.com",
    });

    expect(await t.run((ctx) => ctx.db.get("rooms", retroId))).toMatchObject({
      ownerId: permanentId,
      retained: true,
    });
  });
});

describe("removeInactiveRooms: retention", () => {
  it("a retained room outlives five quiet days", async () => {
    const t = withComponents(convexTest(schema, modules));
    const keptId = await seedStaleRoom(t, { retained: true });

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});

    expect(result.roomsScheduled).toBe(0);
    expect(await scheduledCascadeRoomIds(t)).toEqual(new Set());
    expect(await t.run((ctx) => ctx.db.get("rooms", keptId))).not.toBeNull();
  });

  it("a non-retained room is scheduled for deletion after five quiet days", async () => {
    const t = withComponents(convexTest(schema, modules));
    const staleId = await seedStaleRoom(t, { retained: false });
    const activeId = await seedRoom(t, "active");

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});

    expect(result.roomsScheduled).toBe(1);
    expect(await scheduledCascadeRoomIds(t)).toEqual(new Set([staleId]));
    expect(await t.run((ctx) => ctx.db.get("rooms", activeId))).not.toBeNull();
  });

  it("retention is the only discriminator: roomType does not matter", async () => {
    const t = withComponents(convexTest(schema, modules));
    const staleCanvas = await seedStaleRoom(t, { retained: false, roomType: "canvas" });
    const staleUntyped = await seedStaleRoom(t, { retained: false });
    const staleGuestRetro = await seedStaleRoom(t, { retained: false, roomType: "retro" });
    await seedStaleRoom(t, { retained: true, roomType: "canvas" });
    await seedStaleRoom(t, { retained: true });
    await seedStaleRoom(t, { retained: true, roomType: "retro" });

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});

    expect(result.roomsScheduled).toBe(3);
    expect(await scheduledCascadeRoomIds(t)).toEqual(
      new Set([staleCanvas, staleUntyped, staleGuestRetro])
    );
  });
});
