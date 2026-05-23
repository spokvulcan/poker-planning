import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import * as Demo from "./model/demo";
import * as VotingRound from "./model/votingRound";
import {
  DEMO_VOTE_PROBABILITY,
  DEMO_RESULTS_DISPLAY_MS,
} from "./constants";

// v is imported for consistency with other API layer files
void v;

/**
 * Get the demo room ID (creates if doesn't exist)
 */
export const getDemoRoomId = query({
  args: {},
  handler: async (ctx) => {
    return await Demo.getDemoRoomId(ctx);
  },
});

/**
 * Get full demo room data for rendering
 */
export const getDemoRoom = query({
  args: {},
  handler: async (ctx) => {
    return await Demo.getDemoRoomData(ctx);
  },
});

/**
 * Initialize the demo room (admin/setup action)
 */
export const initializeDemo = mutation({
  args: {},
  handler: async (ctx) => {
    return await Demo.ensureDemoRoom(ctx);
  },
});

/**
 * Reset the demo room to a clean state
 */
export const resetDemo = mutation({
  args: {},
  handler: async (ctx) => {
    await Demo.resetDemoRoom(ctx);
  },
});

/**
 * Internal mutation called by cron to drive the demo room.
 *
 * Drives the bots *through the voting round*, exactly like real players: they
 * cast via `VotingRound.castVote`, which arms the auto-reveal countdown once
 * the table is full and schedules the real `autoReveal`. The cron no longer
 * arms the countdown or polls for the reveal by hand — the round owns that.
 * Phases: voting → (round arms countdown, scheduler reveals) → hold → reset.
 */
export const runDemoCycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demoRoomId = await Demo.ensureDemoRoom(ctx);
    const room = await ctx.db.get(demoRoomId);
    if (!room) return;

    const phase = VotingRound.phaseOf(room);

    // Revealed: hold the results on screen, then start a fresh round.
    if (phase === "revealed") {
      if (Date.now() - room.lastActivityAt > DEMO_RESULTS_DISPLAY_MS) {
        await Demo.resetDemoRoom(ctx);
      }
      return;
    }

    // Counting down: the round armed a real scheduled reveal when the last bot
    // voted — let it fire on its own. Don't vote, don't poll.
    if (phase === "counting down") return;

    // Voting: let a few more bots cast their card through the round.
    const [botMemberships, votes] = await Promise.all([
      ctx.db
        .query("roomMemberships")
        .withIndex("by_room", (q) => q.eq("roomId", demoRoomId))
        .filter((q) => q.eq(q.field("isBot"), true))
        .collect(),
      ctx.db
        .query("votes")
        .withIndex("by_room", (q) => q.eq("roomId", demoRoomId))
        .collect(),
    ]);

    const bots = await Promise.all(
      botMemberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return { ...user!, userId: m.userId };
      })
    );

    const votedUserIds = new Set(votes.map((v) => v.userId.toString()));
    const botsWhoHaventVoted = bots.filter(
      (bot) => !votedUserIds.has(bot.userId.toString())
    );
    if (botsWhoHaventVoted.length === 0) return;

    // Random chance to vote this cycle (more natural pacing).
    if (Math.random() > DEMO_VOTE_PROBABILITY) return;

    // Shuffle and pick 1-3 bots to vote this cycle.
    const shuffled = [...botsWhoHaventVoted].sort(() => Math.random() - 0.5);
    const maxVoters = Math.min(shuffled.length, Math.floor(Math.random() * 3) + 1);
    const botsToVote = shuffled.slice(0, maxVoters);

    // Cast sequentially so the round's all-in check (and the countdown it arms)
    // observes each prior vote — voting through castVote, never inserting by hand.
    for (const bot of botsToVote) {
      const cardLabel = Demo.generateBotVote(bot.name);
      const cardValue = parseInt(cardLabel) || 0;
      await VotingRound.castVote(ctx, {
        roomId: demoRoomId,
        userId: bot.userId,
        cardLabel,
        cardValue,
      });
    }
  },
});
