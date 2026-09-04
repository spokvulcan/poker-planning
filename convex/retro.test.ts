/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_PERMISSIONS } from "./permissions";
import { RETRO_FORMATS, DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { type T } from "./analytics.seeds";

// Creating a teamless retro (spec §6, ADR-0016, ADR-0021): one mutation
// writes the room and the retros row, then the creator's owner membership.
// The board read takes the reader guard; a retro join is never a spectator.

const modules = import.meta.glob("./**/*.*s");

async function seedUser(
  t: T,
  authUserId: string,
  accountType?: "anonymous" | "permanent"
): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId,
      name: authUserId,
      createdAt: Date.now(),
      ...(accountType ? { accountType } : {}),
    })
  );
}

const as = (t: T, subject: string) => t.withIdentity({ subject });

async function retroRow(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("retros")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .unique()
  );
}

async function membershipsOf(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("roomMemberships")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

describe("retro.create — a teamless retro", () => {
  it("an anonymous account writes the room, the retros row and the owner membership", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "anon", "anonymous");

    const roomId = await as(t, "anon").mutation(api.retro.create, {
      name: "Sprint 12",
      formatName: DEFAULT_RETRO_FORMAT.name,
    });

    const room = (await t.run((ctx) => ctx.db.get(roomId)))!;
    expect(room).toMatchObject({
      name: "Sprint 12",
      roomType: "retro",
      ownerId: userId,
      joinPolicy: "anyone",
      permissions: DEFAULT_RETRO_PERMISSIONS,
      retained: false,
    });
    expect(room.teamId).toBeUndefined();

    const retro = (await retroRow(t, roomId))!;
    expect(retro.attribution).toBe("named");
    expect(retro.currentStageId).toBe(retro.stages[0].id);
    expect(retro.currentStageEnteredAt).toBeGreaterThan(0);
    expect(retro.collectUntil).toBeUndefined();
    expect(retro.walk).toBeUndefined();

    const rows = await membershipsOf(t, roomId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId, role: "owner", isSpectator: false });
  });

  it("a permanent account creates one too, with the cards-due date", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "perm", "permanent");
    const due = Date.now() + 86_400_000;

    const roomId = await as(t, "perm").mutation(api.retro.create, {
      name: "Sprint 13",
      formatName: DEFAULT_RETRO_FORMAT.name,
      collectUntil: due,
    });

    expect((await t.run((ctx) => ctx.db.get(roomId)))?.ownerId).toBe(userId);
    expect((await retroRow(t, roomId))?.collectUntil).toBe(due);
  });

  it("seeds no poker canvas nodes", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "anon");

    const roomId = await as(t, "anon").mutation(api.retro.create, {
      name: "R",
      formatName: DEFAULT_RETRO_FORMAT.name,
    });

    const nodes = await t.run((ctx) =>
      ctx.db.query("canvasNodes").withIndex("by_room", (q) => q.eq("roomId", roomId)).collect()
    );
    expect(nodes).toEqual([]);
  });

  it("refuses an unauthenticated caller, a blank name and an unknown format", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "anon");

    await expect(
      t.mutation(api.retro.create, { name: "R", formatName: DEFAULT_RETRO_FORMAT.name })
    ).rejects.toThrow("Not authenticated");
    await expect(
      as(t, "anon").mutation(api.retro.create, { name: "  ", formatName: DEFAULT_RETRO_FORMAT.name })
    ).rejects.toThrow("Room name is required");
    await expect(
      as(t, "anon").mutation(api.retro.create, { name: "R", formatName: "Fishbone" })
    ).rejects.toThrow("Unknown retro format");
    expect(await t.run((ctx) => ctx.db.query("rooms").collect())).toEqual([]);
  });
});

describe("retro.create — format stamping and the seed", () => {
  it("copies only the name and the prompts, never the picker line", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "anon");

    const roomId = await as(t, "anon").mutation(api.retro.create, {
      name: "R",
      formatName: DEFAULT_RETRO_FORMAT.name,
    });

    const retro = (await retroRow(t, roomId))!;
    expect(retro.format).toEqual({
      name: DEFAULT_RETRO_FORMAT.name,
      prompts: DEFAULT_RETRO_FORMAT.prompts,
    });
    expect("description" in retro.format).toBe(false);
  });

  it("a teamless retro has no review entry and the standard seed values", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "anon");

    const roomId = await as(t, "anon").mutation(api.retro.create, {
      name: "R",
      formatName: DEFAULT_RETRO_FORMAT.name,
    });

    const retro = (await retroRow(t, roomId))!;
    expect(retro.stages.map((s) => s.kind)).toEqual(["collect", "group", "vote", "discuss", "close"]);
    const byKind = Object.fromEntries(retro.stages.map((s) => [s.kind, s]));
    expect(byKind.collect).toMatchObject({ cardsVisible: "hidden", tallyVisible: "visible" });
    expect(byKind.vote).toMatchObject({ cardsVisible: "visible", tallyVisible: "hidden", voteBudget: 5 });
    expect(byKind.vote.maxPerTopic).toBeUndefined();
    for (const kind of ["group", "discuss", "close"]) {
      expect(byKind[kind]).toMatchObject({ cardsVisible: "visible", tallyVisible: "visible" });
      expect(byKind[kind].voteBudget).toBeUndefined();
    }
    for (const stage of retro.stages) {
      expect(stage.timeboxMinutes).toBeUndefined();
    }
    expect(new Set(retro.stages.map((s) => s.id)).size).toBe(retro.stages.length);
  });

  it("Lean Coffee's collect is visible; every other format's is hidden", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "anon");

    for (const format of RETRO_FORMATS) {
      const roomId = await as(t, "anon").mutation(api.retro.create, {
        name: format.name,
        formatName: format.name,
      });
      const retro = (await retroRow(t, roomId))!;
      const collect = retro.stages.find((s) => s.kind === "collect")!;
      expect(collect.cardsVisible).toBe(format.name === "Lean Coffee" ? "visible" : "hidden");
      expect(retro.format.prompts.map((p) => p.label)).toEqual(format.prompts.map((p) => p.label));
    }
  });
});

describe("retro.board", () => {
  it("returns the retros row to a member and refuses a non-member", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "owner");
    await seedUser(t, "stranger");
    const roomId = await as(t, "owner").mutation(api.retro.create, {
      name: "R",
      formatName: DEFAULT_RETRO_FORMAT.name,
    });

    const board = await as(t, "owner").query(api.retro.board, { roomId });
    expect(board.roomId).toBe(roomId);
    expect(board.currentStageId).toBe(board.stages[0].id);
    expect(board.stages[0].kind).toBe("collect");
    expect(board.format.name).toBe(DEFAULT_RETRO_FORMAT.name);

    await expect(
      as(t, "stranger").query(api.retro.board, { roomId })
    ).rejects.toThrow("You don't have access to this room");
  });
});

describe("joining a retro", () => {
  it("never sets isSpectator and creates no player node", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.retro.create, {
      name: "R",
      formatName: DEFAULT_RETRO_FORMAT.name,
    });

    const joinerId = await as(t, "joiner").mutation(api.users.join, {
      roomId,
      name: "Joiner",
      isSpectator: true,
      authUserId: "joiner",
    });

    const rows = await membershipsOf(t, roomId);
    const joiner = rows.find((row) => row.userId === joinerId)!;
    expect(joiner.isSpectator).toBe(false);
    expect(joiner.role).toBeUndefined();
    const nodes = await t.run((ctx) =>
      ctx.db.query("canvasNodes").withIndex("by_room", (q) => q.eq("roomId", roomId)).collect()
    );
    expect(nodes).toEqual([]);
  });

  it("the join policy is enforced before the insert with the forbidden refusal", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "owner");
    await seedUser(t, "anon", "anonymous");
    await seedUser(t, "perm", "permanent");
    const roomId = await as(t, "owner").mutation(api.retro.create, {
      name: "R",
      formatName: DEFAULT_RETRO_FORMAT.name,
    });
    await t.run((ctx) => ctx.db.patch(roomId, { joinPolicy: "permanentAccounts" }));

    await expect(
      as(t, "anon").mutation(api.users.join, { roomId, name: "A", authUserId: "anon" })
    ).rejects.toThrow("This retro is for signed-in accounts. Sign in to join.");
    expect((await membershipsOf(t, roomId)).map((row) => row.userId)).not.toContain(
      await t.run((ctx) =>
        ctx.db.query("users").withIndex("by_auth_user", (q) => q.eq("authUserId", "anon")).unique()
      ).then((u) => u!._id)
    );

    await as(t, "perm").mutation(api.users.join, { roomId, name: "P", authUserId: "perm" });
    expect(await membershipsOf(t, roomId)).toHaveLength(2);
  });

  it("a poker room still honours the spectator toggle", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "P" });

    const joinerId = await as(t, "joiner").mutation(api.users.join, {
      roomId,
      name: "Joiner",
      isSpectator: true,
      authUserId: "joiner",
    });

    const rows = await membershipsOf(t, roomId);
    expect(rows.find((row) => row.userId === joinerId)?.isSpectator).toBe(true);
  });
});
