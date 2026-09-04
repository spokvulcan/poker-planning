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
 * Retention flag, widen release (#284, ADR-0019). Every writer stamps
 * `retained` on new rows; legacy rows are stamped by the self-scheduling
 * backfill. The sweep is untouched here — its tests live in
 * roomAggregate.test.ts and still read `by_activity`.
 */

/** A legacy row: written before the field existed, so `retained` is absent. */
async function seedLegacyRoom(t: T, name: string): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name,
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    })
  );
}

async function retainedById(t: T): Promise<Map<Id<"rooms">, boolean | undefined>> {
  const rooms = await t.run((ctx) => ctx.db.query("rooms").collect());
  return new Map(rooms.map((r) => [r._id, r.retained]));
}

async function pendingBackfills(t: T): Promise<number> {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  );
  return jobs.filter(
    (j) => j.name.endsWith("backfillRoomsRetained") && j.state.kind === "pending"
  ).length;
}

/** Fires runAfter(0) continuations until none are pending. */
async function drainScheduled(t: T): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await t.finishInProgressScheduledFunctions();
    if ((await pendingBackfills(t)) === 0) return;
  }
  throw new Error("backfill continuations did not drain");
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

describe("backfillRoomsRetained", () => {
  it("stamps only rows where retained is undefined, batching until done", async () => {
    const t = convexTest(schema, modules);
    const legacy = await Promise.all(
      ["L1", "L2", "L3"].map((name) => seedLegacyRoom(t, name))
    );
    const alreadyTrue = await t.run((ctx) =>
      ctx.db.insert("rooms", {
        name: "kept",
        autoCompleteVoting: false,
        isGameOver: false,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        retained: true,
      })
    );
    const alreadyFalse = await seedRoom(t, "fresh");

    const first = await t.mutation(internal.migrations.backfillRoomsRetained, {
      batchSize: 2,
    });
    expect(first).toEqual({ found: 2, stamped: 2, rescheduled: true });
    expect(await pendingBackfills(t)).toBe(1);

    await drainScheduled(t);

    const retained = await retainedById(t);
    for (const id of legacy) expect(retained.get(id)).toBe(false);
    expect(retained.get(alreadyTrue)).toBe(true);
    expect(retained.get(alreadyFalse)).toBe(false);
    expect(await pendingBackfills(t)).toBe(0);
  });

  it("terminates without rescheduling once the batch comes back short", async () => {
    const t = convexTest(schema, modules);
    await seedLegacyRoom(t, "L1");

    const result = await t.mutation(internal.migrations.backfillRoomsRetained, {
      batchSize: 2,
    });
    expect(result).toEqual({ found: 1, stamped: 1, rescheduled: false });
    expect(await pendingBackfills(t)).toBe(0);

    // Idempotent: a re-run finds nothing left to stamp.
    const again = await t.mutation(internal.migrations.backfillRoomsRetained, {});
    expect(again).toEqual({ found: 0, stamped: 0, rescheduled: false });
  });

  it("dryRun reports the unstamped count, bounded by batchSize, and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const legacy = await Promise.all(
      ["L1", "L2", "L3"].map((name) => seedLegacyRoom(t, name))
    );
    await seedRoom(t, "fresh");

    const result = await t.mutation(internal.migrations.backfillRoomsRetained, {
      dryRun: true,
    });
    expect(result).toEqual({ found: 3, stamped: 0, rescheduled: false });

    const bounded = await t.mutation(internal.migrations.backfillRoomsRetained, {
      dryRun: true,
      batchSize: 2,
    });
    expect(bounded).toEqual({ found: 2, stamped: 0, rescheduled: false });

    const retained = await retainedById(t);
    for (const id of legacy) expect(retained.get(id)).toBeUndefined();
    expect(await pendingBackfills(t)).toBe(0);
  });
});
