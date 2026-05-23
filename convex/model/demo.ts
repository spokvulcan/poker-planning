import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import * as Rooms from "./rooms";
import * as VotingRound from "./votingRound";
import * as Canvas from "./canvas";

// Bot configuration with famous developer names
export const BOT_CONFIGS = [
  { name: "Ada Lovelace", preferredCards: ["2", "3", "5"] },
  { name: "Grace Hopper", preferredCards: ["5", "8", "13"] },
  { name: "Alan Turing", preferredCards: ["3", "5", "8"] },
  { name: "Katherine Johnson", preferredCards: ["5", "8"] },
  { name: "Dennis Ritchie", preferredCards: ["8", "13", "21"] },
  { name: "Margaret Hamilton", preferredCards: ["3", "5", "8", "13"] },
] as const;

export type BotConfig = (typeof BOT_CONFIGS)[number];

/**
 * Gets the demo room ID if it exists
 */
export async function getDemoRoomId(
  ctx: QueryCtx
): Promise<Id<"rooms"> | null> {
  const demoRoom = await ctx.db
    .query("rooms")
    .filter((q) => q.eq(q.field("isDemoRoom"), true))
    .first();

  return demoRoom?._id ?? null;
}

// Sample issues for the demo room
const DEMO_ISSUES = [
  { title: "Add user authentication", status: "voting" as const },
  { title: "Setup CI/CD pipeline", status: "pending" as const },
  { title: "Database migration", status: "pending" as const },
] as const;

/**
 * Ensures the demo room exists, creating it if necessary
 */
export async function ensureDemoRoom(
  ctx: MutationCtx
): Promise<Id<"rooms">> {
  // Check if demo room already exists
  const existingRoom = await ctx.db
    .query("rooms")
    .filter((q) => q.eq(q.field("isDemoRoom"), true))
    .first();

  if (existingRoom) {
    // Verify bots exist via memberships
    const botMemberships = await ctx.db
      .query("roomMemberships")
      .withIndex("by_room", (q) => q.eq("roomId", existingRoom._id))
      .filter((q) => q.eq(q.field("isBot"), true))
      .collect();

    if (botMemberships.length < BOT_CONFIGS.length) {
      // Recreate missing bots
      await createDemoBots(ctx, existingRoom._id);
    }

    // Verify issues exist
    const existingIssues = await ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", existingRoom._id))
      .collect();

    if (existingIssues.length === 0) {
      await createDemoIssues(ctx, existingRoom._id);
    }

    return existingRoom._id;
  }

  // Create new demo room
  const roomId = await ctx.db.insert("rooms", {
    name: "Planning Poker Demo",
    roomType: "canvas",
    autoCompleteVoting: true,
    isDemoRoom: true,
    isGameOver: false,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    nextIssueNumber: DEMO_ISSUES.length + 1,
  });

  // Initialize canvas nodes
  await Canvas.initializeCanvasNodes(ctx, { roomId });

  // Create bot users
  await createDemoBots(ctx, roomId);

  // Create demo issues
  const currentIssueId = await createDemoIssues(ctx, roomId);

  // Set the current issue (the one being voted on)
  if (currentIssueId) {
    await ctx.db.patch(roomId, { currentIssueId });
  }

  return roomId;
}

/**
 * Creates sample issues for the demo room
 */
async function createDemoIssues(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<Id<"issues"> | null> {
  const now = Date.now();
  let currentIssueId: Id<"issues"> | null = null;

  for (let i = 0; i < DEMO_ISSUES.length; i++) {
    const issue = DEMO_ISSUES[i];
    const issueId = await ctx.db.insert("issues", {
      roomId,
      sequentialId: i + 1,
      title: issue.title,
      status: issue.status,
      createdAt: now,
      order: i,
    });

    // Track the voting issue as the current one
    if (issue.status === "voting") {
      currentIssueId = issueId;
    }
  }

  return currentIssueId;
}

/**
 * Creates bot users for the demo room
 */
export async function createDemoBots(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<void> {
  const now = Date.now();

  // Fetch all existing bot memberships once before the loop
  const existingMemberships = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .filter((q) => q.eq(q.field("isBot"), true))
    .collect();

  const existingBotUserIds = existingMemberships.map((m) => m.userId);
  const existingBotUsers = await Promise.all(
    existingBotUserIds.map((id) => ctx.db.get(id))
  );
  const existingBotNames = new Set(existingBotUsers.map((u) => u?.name));

  for (const botConfig of BOT_CONFIGS) {
    // Skip if bot already exists in this room
    if (existingBotNames.has(botConfig.name)) continue;

    // Create global bot user with a unique authUserId
    const authUserId = `bot-${botConfig.name.toLowerCase().replace(/\s+/g, "-")}`;

    // Check if global user already exists
    let userId: Id<"users">;
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .first();

    if (existingUser) {
      userId = existingUser._id;
    } else {
      userId = await ctx.db.insert("users", {
        authUserId,
        name: botConfig.name,
        createdAt: now,
      });
    }

    // Create membership for bot in this room
    await ctx.db.insert("roomMemberships", {
      roomId,
      userId,
      isSpectator: false,
      isBot: true,
      joinedAt: now,
    });

    // Create player node for bot
    await Canvas.upsertPlayerNode(ctx, { roomId, userId });
  }
}

/**
 * Generates a vote for a bot based on their preferences
 */
export function generateBotVote(botName: string): string {
  const botConfig = BOT_CONFIGS.find((b) => b.name === botName);
  if (!botConfig) {
    // Fallback to random card
    const defaultCards = ["3", "5", "8"];
    return defaultCards[Math.floor(Math.random() * defaultCards.length)];
  }

  const cards = botConfig.preferredCards;
  return cards[Math.floor(Math.random() * cards.length)];
}

/**
 * Resets the demo room to a clean state
 */
export async function resetDemoRoom(ctx: MutationCtx): Promise<void> {
  const demoRoomId = await getDemoRoomId(ctx);
  if (!demoRoomId) return;

  await VotingRound.reset(ctx, demoRoomId);
}

/**
 * Gets full demo room data for rendering
 */
export async function getDemoRoomData(ctx: QueryCtx) {
  const demoRoomId = await getDemoRoomId(ctx);
  if (!demoRoomId) return null;

  return await Rooms.getRoomWithRelatedData(ctx, demoRoomId);
}
