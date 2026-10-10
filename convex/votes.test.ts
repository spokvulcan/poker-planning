/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedUser, addMembership } from "./analytics.seeds";

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

/** Another voter, seated in the same room. */
async function addVoter(t: T, roomId: Id<"rooms">, authUserId: string): Promise<Id<"users">> {
  const userId = await seedUser(t, authUserId);
  await addMembership(t, roomId, userId, Date.now());
  return userId;
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

describe("who a vote is from", () => {
  // Whoever is signed in. The user id old browsers still send with a card is
  // accepted and ignored, never compared.

  it("a card picked is the caller's, whatever user id comes with it, or none", async () => {
    const t = convexTest(schema, modules);
    const { roomId, userId: annId } = await seedVoter(t, "auth-ann");
    const bobId = await addVoter(t, roomId, "auth-bob");

    await t.withIdentity({ subject: "auth-ann" }).mutation(api.votes.pickCard, { roomId, userId: bobId, cardLabel: "5" });
    await t.withIdentity({ subject: "auth-bob" }).mutation(api.votes.pickCard, { roomId, cardLabel: "8" });

    expect(await votesIn(t, roomId)).toMatchObject([
      { userId: annId, cardLabel: "5" },
      { userId: bobId, cardLabel: "8" },
    ]);
  });

  it("a card taken back is the caller's, whatever user id comes with it, or none", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedVoter(t, "auth-ann");
    const bobId = await addVoter(t, roomId, "auth-bob");
    const ann = t.withIdentity({ subject: "auth-ann" });
    const bob = t.withIdentity({ subject: "auth-bob" });
    await ann.mutation(api.votes.pickCard, { roomId, cardLabel: "5" });
    await bob.mutation(api.votes.pickCard, { roomId, cardLabel: "8" });

    await ann.mutation(api.votes.removeCard, { roomId, userId: bobId });
    expect(await votesIn(t, roomId)).toMatchObject([{ userId: bobId, cardLabel: "8" }]);

    await bob.mutation(api.votes.removeCard, { roomId });
    expect(await votesIn(t, roomId)).toEqual([]);
  });
});
