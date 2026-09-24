/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { T } from "./analytics.seeds";

// purgeLegacyRetros clears out the retired team retro. Its tables are gone
// from the schema, so this test writes them untyped, the way the migration
// reads them.

const modules = import.meta.glob("./**/*.*s");

const LEGACY_TABLES = [
  "retroCards",
  "retroClusters",
  "retroVotes",
  "retroActions",
  "retros",
  "teamMemberships",
  "teams",
] as const;

type UntypedDb = {
  insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
  query: (table: string) => { collect: () => Promise<unknown[]> };
};

/** Lets scheduled jobs due now run to the end; convex-test fires them on real timers. */
async function drainScheduled(t: T): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.finishInProgressScheduledFunctions();
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const due = jobs.filter((job) => job.state.kind === "pending" && job.scheduledTime < Date.now() + 60_000);
    if (due.length === 0) return;
  }
  throw new Error("scheduled functions did not drain");
}

describe("migrations.purgeLegacyRetros", () => {
  it("empties the legacy tables, cancels a pending reminder, deletes the old boards' rooms and strips the legacy room fields", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const legacy = ctx.db as unknown as UntypedDb;
      const room = (fields: { roomType?: "canvas" | "retro"; teamId?: string; joinPolicy?: "anyone" | "teamMembers" }) =>
        ctx.db.insert("rooms", {
          name: "R",
          autoCompleteVoting: false,
          isGameOver: false,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          retained: false,
          ...fields,
        });
      // An old board: a retro room without the whiteboard's state.
      const oldBoard = await room({ roomType: "retro", teamId: "team-1", joinPolicy: "teamMembers" });
      const poker = await room({ roomType: "canvas", joinPolicy: "anyone" });
      const whiteboard = await ctx.db.insert("rooms", {
        name: "W",
        roomType: "retro",
        autoCompleteVoting: false,
        isGameOver: false,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        retained: true,
        retro: { step: "write", columns: [], votesPerPerson: 3, showAuthors: false },
      });
      await ctx.db.insert("canvasNodes", {
        roomId: oldBoard,
        nodeId: "timer",
        type: "timer",
        position: { x: 0, y: 0 },
        data: {},
        lastUpdatedAt: Date.now(),
      });
      // A due-date reminder the old board scheduled, still pending a day out.
      const reminderJob = await ctx.scheduler.runAfter(86_400_000, internal.cleanup.removeInactiveRooms, {});
      await legacy.insert("teams", { name: "Acme" });
      await legacy.insert("teamMemberships", { teamId: "team-1", role: "admin" });
      await legacy.insert("retros", { roomId: oldBoard });
      await legacy.insert("retroCards", { roomId: oldBoard, text: "old" });
      await legacy.insert("retroActions", { roomId: oldBoard, text: "old", reminderJobId: reminderJob });
      return { oldBoard, poker, whiteboard, reminderJob };
    });

    const result = await t.mutation(internal.migrations.purgeLegacyRetros, {});
    await drainScheduled(t);

    expect(result).toEqual({ deleted: 5, roomsScheduled: 1, done: true });
    const leftOver = await t.run(async (ctx) => {
      const legacy = ctx.db as unknown as UntypedDb;
      return Promise.all(LEGACY_TABLES.map(async (table) => (await legacy.query(table).collect()).length));
    });
    expect(leftOver).toEqual(LEGACY_TABLES.map(() => 0));
    expect(await t.run((ctx) => ctx.db.system.get(seeded.reminderJob))).toMatchObject({
      state: { kind: "canceled" },
    });

    expect(await t.run((ctx) => ctx.db.get(seeded.oldBoard))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("canvasNodes").collect())).toEqual([]);
    const poker = await t.run((ctx) => ctx.db.get(seeded.poker));
    expect(poker).toMatchObject({ roomType: "canvas" });
    expect(poker).not.toHaveProperty("joinPolicy");
    expect(await t.run((ctx) => ctx.db.get(seeded.whiteboard))).toMatchObject({ roomType: "retro", retained: true });

    // Safe to re-run: nothing left to do.
    expect(await t.mutation(internal.migrations.purgeLegacyRetros, {})).toEqual({
      deleted: 0,
      roomsScheduled: 0,
      done: true,
    });
  });
});

describe("clearLegacyEmailOptOut", () => {
  it("strips the retired opt-out flag from every user and leaves the rest alone", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = { name: "U", createdAt: 0 };
      return Promise.all([
        ctx.db.insert("users", { ...base, authUserId: "a", emailOptOut: true }),
        ctx.db.insert("users", { ...base, authUserId: "b", emailOptOut: false }),
        ctx.db.insert("users", { ...base, authUserId: "c" }),
      ]);
    });

    await t.mutation(internal.migrations.clearLegacyEmailOptOut, {});
    await drainScheduled(t);

    const users = await t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get(id))));
    expect(users.map((u) => u && "emailOptOut" in u)).toEqual([false, false, false]);
    expect(users.map((u) => u?.authUserId)).toEqual(["a", "b", "c"]);
  });
});
