/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";

// Room ownership (ADR-0029): who owns a room is three stored facts that must
// agree, the room's owner, that person's owner role, and whether the room is
// kept. These tests read all three after every path that changes them.
// Account deletion's hand-off and a guest signing in are in
// accountLifecycle.test.ts.

const modules = import.meta.glob("./**/*.*s");


/** The three facts, read together. */
async function ownershipOf(t: T, roomId: Id<"rooms">) {
  return t.run(async (ctx) => {
    const room = (await ctx.db.get("rooms", roomId))!;
    const owners = (
      await ctx.db
        .query("roomMemberships")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect()
    )
      .filter((m) => m.role === "owner")
      .map((m) => m.userId);
    return { ownerId: room.ownerId, owners, retained: room.retained };
  });
}

describe("creating a room", () => {
  it("seats its owner in it with the owner role, for either ceremony", async () => {
    const t = withComponents(convexTest(schema, modules));
    const ownerId = await seedUser(t, "owner", "permanent");

    const poker = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
    const retro = await as(t, "owner").mutation(api.retro.create, { name: "Sprint 41 retro" });

    expect(await ownershipOf(t, poker)).toEqual({ ownerId, owners: [ownerId], retained: false });
    expect(await ownershipOf(t, retro)).toEqual({ ownerId, owners: [ownerId], retained: true });
  });

  it("gives the owner their seat before the room page opens, so they land on its canvas", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });

    expect(await as(t, "owner").query(api.users.getMyMembership, { roomId })).toMatchObject({ role: "owner" });
  });
});

describe("transferring a room", () => {
  it("moves the owner, the owner role and retention together", async () => {
    const t = withComponents(convexTest(schema, modules));
    const guestId = await seedUser(t, "guest");
    const heirId = await seedUser(t, "heir", "permanent");
    const roomId = await as(t, "guest").mutation(api.retro.create, { name: "Sprint 41 retro" });
    await join(t, roomId, "heir");
    expect(await ownershipOf(t, roomId)).toEqual({ ownerId: guestId, owners: [guestId], retained: false });

    await as(t, "guest").mutation(api.roles.transferOwnership, { roomId, targetUserId: heirId });

    expect(await ownershipOf(t, roomId)).toEqual({ ownerId: heirId, owners: [heirId], retained: true });
  });
});

describe("a returning owner", () => {
  it("gets the owner role back, which ends the lockdown", async () => {
    const t = withComponents(convexTest(schema, modules));
    const ownerId = await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
    await join(t, roomId, "member");

    await as(t, "owner").mutation(api.users.leave, { roomId, userId: ownerId });
    expect((await as(t, "member").query(api.rooms.get, { roomId }))?.isOwnerAbsent).toBe(true);

    await join(t, roomId, "owner");
    expect(await ownershipOf(t, roomId)).toEqual({ ownerId, owners: [ownerId], retained: false });
    expect((await as(t, "member").query(api.rooms.get, { roomId }))?.isOwnerAbsent).toBe(false);
  });
});
