/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import * as Rooms from "./model/rooms";
import { seedRoom } from "./analytics.seeds";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

/**
 * Retention (ADR-0019): `retained` is the sweep's only discriminator. Every
 * writer stamps it on new rows, and the sweep deletes a non-retained room
 * after five quiet days while leaving a retained one alone regardless of
 * age or room type.
 */

const TEN_DAYS_AGO = Date.now() - 10 * 24 * 60 * 60 * 1000;

async function seedStaleRoom(
  t: T,
  opts: { retained: boolean; roomType?: "canvas" }
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
    const t = convexTest(schema, modules);
    const roomId = await t.run((ctx) =>
      Rooms.createRoom(ctx, { name: "New", votingScale: { type: "fibonacci" } })
    );
    const room = await t.run((ctx) => ctx.db.get(roomId));
    expect(room?.retained).toBe(false);
  });

  it("the analytics seed helper stamps retained: false", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const room = await t.run((ctx) => ctx.db.get(roomId));
    expect(room?.retained).toBe(false);
  });
});

describe("removeInactiveRooms: retention", () => {
  it("a retained room outlives five quiet days", async () => {
    const t = convexTest(schema, modules);
    const keptId = await seedStaleRoom(t, { retained: true });

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});

    expect(result.roomsScheduled).toBe(0);
    expect(await scheduledCascadeRoomIds(t)).toEqual(new Set());
    expect(await t.run((ctx) => ctx.db.get(keptId))).not.toBeNull();
  });

  it("a non-retained room is scheduled for deletion after five quiet days", async () => {
    const t = convexTest(schema, modules);
    const staleId = await seedStaleRoom(t, { retained: false });
    const activeId = await seedRoom(t, "active");

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});

    expect(result.roomsScheduled).toBe(1);
    expect(await scheduledCascadeRoomIds(t)).toEqual(new Set([staleId]));
    expect(await t.run((ctx) => ctx.db.get(activeId))).not.toBeNull();
  });

  it("retention is the only discriminator: roomType does not matter", async () => {
    const t = convexTest(schema, modules);
    const staleCanvas = await seedStaleRoom(t, { retained: false, roomType: "canvas" });
    const staleUntyped = await seedStaleRoom(t, { retained: false });
    await seedStaleRoom(t, { retained: true, roomType: "canvas" });
    await seedStaleRoom(t, { retained: true });

    const result = await t.mutation(internal.cleanup.removeInactiveRooms, {});

    expect(result.roomsScheduled).toBe(2);
    expect(await scheduledCascadeRoomIds(t)).toEqual(
      new Set([staleCanvas, staleUntyped])
    );
  });
});
