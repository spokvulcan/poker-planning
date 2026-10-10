/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

/** A poker room storing no scale (so it deals the default deck), and one voter in it. */
async function seedVoter(
  t: T,
  authUserId: string
): Promise<{ roomId: Id<"rooms">; userId: Id<"users"> }> {
  return t.run(async (ctx) => {
    const roomId = await ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
    });
    const userId = await ctx.db.insert("users", {
      authUserId,
      name: "U",
      createdAt: Date.now(),
    });
    await ctx.db.insert("roomMemberships", {
      roomId,
      userId,
      isSpectator: false,
      joinedAt: Date.now(),
    });
    return { roomId, userId };
  });
}

async function votesIn(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("votes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

describe("pickCard — the ballot a browser sends", () => {
  it("is the card's label alone: the deck reads its value", async () => {
    const t = convexTest(schema, modules);
    const { roomId, userId } = await seedVoter(t, "auth-a");

    await t
      .withIdentity({ subject: "auth-a" })
      .mutation(api.votes.pickCard, { roomId, userId, cardLabel: "13" });

    expect(await votesIn(t, roomId)).toMatchObject([
      { userId, cardLabel: "13", cardValue: 13 },
    ]);
  });

  it("still takes the card value an old browser sends, and ignores it", async () => {
    const t = convexTest(schema, modules);
    const { roomId, userId } = await seedVoter(t, "auth-a");

    await t
      .withIdentity({ subject: "auth-a" })
      .mutation(api.votes.pickCard, { roomId, userId, cardLabel: "13", cardValue: 999 });

    expect(await votesIn(t, roomId)).toMatchObject([
      { userId, cardLabel: "13", cardValue: 13 },
    ]);
  });
});
