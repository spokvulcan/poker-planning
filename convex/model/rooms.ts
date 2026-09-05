import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import * as Canvas from "./canvas";
import * as Users from "./users";
import { VOTING_SCALES, VotingScaleType, validateCustomScale } from "../scales";
import { MAX_ROOM_NAME_LENGTH } from "../constants";
import { isRoomOwnerAbsent } from "./permissions";

export interface CreateRoomArgs {
  name: string;
  roomType?: "canvas"; // Optional, defaults to canvas
  autoCompleteVoting?: boolean;
  votingScale?: {
    type: VotingScaleType | "custom";
    cards?: string[]; // Required only for custom type
  };
}

/**
 * Validates a room name (trims, enforces non-empty and a length cap).
 */
export function validateRoomName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Room name is required");
  }
  if (trimmed.length > MAX_ROOM_NAME_LENGTH) {
    throw new Error(`Room name must be ${MAX_ROOM_NAME_LENGTH} characters or less`);
  }
  return trimmed;
}

export interface SanitizedVote extends Doc<"votes"> {
  hasVoted: boolean;
}

export interface RoomWithRelatedData {
  room: Doc<"rooms">;
  users: Users.RoomUserData[];
  votes: SanitizedVote[];
  isOwnerAbsent: boolean;
  /** The owning Team's name (ADR-0008); undefined for a teamless room. */
  teamName?: string;
}

/**
 * Resolves voting scale configuration from user input
 */
function resolveVotingScale(scaleConfig?: CreateRoomArgs["votingScale"]) {
  // Default to Fibonacci if no scale provided
  if (!scaleConfig) {
    const fibonacci = VOTING_SCALES.fibonacci;
    return {
      type: fibonacci.type,
      cards: [...fibonacci.cards],
      isNumeric: fibonacci.isNumeric,
    };
  }

  // Handle custom scales
  if (scaleConfig.type === "custom") {
    if (!scaleConfig.cards || scaleConfig.cards.length === 0) {
      throw new Error("Custom scale requires cards array");
    }
    // The one custom-scale validator (../scales) — direct Convex clients
    // can't bypass it with oversized card arrays.
    validateCustomScale(scaleConfig.cards);
    return {
      type: "custom" as const,
      cards: scaleConfig.cards,
      isNumeric: false, // Custom scales default to non-numeric
    };
  }

  // Handle predefined scales
  const predefinedScale = VOTING_SCALES[scaleConfig.type];
  return {
    type: predefinedScale.type,
    cards: [...predefinedScale.cards],
    isNumeric: predefinedScale.isNumeric,
  };
}

/**
 * Creates a new room with the specified configuration
 */
export async function createRoom(
  ctx: MutationCtx,
  args: CreateRoomArgs & { ownerId?: Id<"users"> }
): Promise<Id<"rooms">> {
  const votingScale = resolveVotingScale(args.votingScale);

  const roomId = await ctx.db.insert("rooms", {
    name: validateRoomName(args.name),
    roomType: "canvas", // Always canvas now
    autoCompleteVoting: args.autoCompleteVoting ?? false,
    isGameOver: false,
    votingScale,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    // Always false until rooms can belong to a Team (ADR-0019).
    retained: false,
    ...(args.ownerId ? { ownerId: args.ownerId } : {}),
  });

  // Always initialize canvas nodes
  await Canvas.initializeCanvasNodes(ctx, { roomId });

  return roomId;
}

/**
 * Fetches a room with all related data (users and votes)
 */
export async function getRoomWithRelatedData(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  currentUserId?: Id<"users">
): Promise<RoomWithRelatedData | null> {
  const room = await ctx.db.get(roomId);
  if (!room) return null;

  // Get users (via memberships), votes, and owner-absent status in parallel
  const [users, votes, ownerAbsent, team] = await Promise.all([
    Users.getRoomUsers(ctx, roomId),
    ctx.db
      .query("votes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    room.ownerId ? isRoomOwnerAbsent(ctx, room) : Promise.resolve(false),
    room.teamId ? ctx.db.get(room.teamId) : Promise.resolve(null),
  ]);

  // Sanitize votes based on game state
  const sanitizedVotes = sanitizeVotes(votes, room.isGameOver, currentUserId);

  return {
    room,
    users,
    votes: sanitizedVotes,
    isOwnerAbsent: ownerAbsent,
    // The owning Team's name is readable by anyone with the link, on
    // purpose (ADR-0008): the write-time disclosure needs it before the
    // first card is typed. The Team's roster and history stay guarded.
    ...(team ? { teamName: team.name } : {}),
  };
}

/**
 * Sanitizes vote data based on game state.
 * Hides card values when the game is not over, except for the current user's
 * own vote (they already know what they voted for).
 */
export function sanitizeVotes(
  votes: Doc<"votes">[],
  isGameOver: boolean,
  currentUserId?: Id<"users">
): SanitizedVote[] {
  return votes.map((vote) => {
    const isOwnVote = currentUserId && vote.userId === currentUserId;
    const showCardData = isGameOver || isOwnVote;
    return {
      ...vote,
      cardLabel: showCardData ? vote.cardLabel : undefined,
      cardValue: showCardData ? vote.cardValue : undefined,
      cardIcon: showCardData ? vote.cardIcon : undefined,
      hasVoted: !!vote.cardLabel,
    };
  });
}

/**
 * How stale a retro room's clock must be before the chokepoint patches it
 * (ADR-0018). The sweep and the listings need day-level precision; the room
 * row is every guard's read and every member's subscription, so a retro
 * patches it at most once an hour instead of once per write.
 */
export const RETRO_ACTIVITY_GRANULARITY_MS = 60 * 60 * 1000;

/**
 * The single chokepoint for room activity writes (ADR-0005). Every
 * user-initiated mutation touching room-scoped state routes its bump through
 * here, so the cleanup cascade's inactivity window (model/cleanup.ts)
 * reflects real use — a room worked only via its timer or canvas must not
 * read as abandoned.
 *
 * The chokepoint owns the clock's precision (ADR-0018): a retro room is
 * patched only when its stored clock is over an hour old; every other room
 * unconditionally, because poker analytics compares `computedAt` to this
 * clock exactly (ADR-0007). A room that is gone returns without patching —
 * the join path bumps before it reads the room.
 */
export async function updateRoomActivity(
  ctx: MutationCtx,
  roomOrId: Doc<"rooms"> | Id<"rooms">
): Promise<void> {
  // A caller whose guard already loaded the room passes the row; the id
  // form re-reads it.
  const room = typeof roomOrId === "string" ? await ctx.db.get(roomOrId) : roomOrId;
  if (!room) return;
  const now = Date.now();
  if (
    room.roomType === "retro" &&
    now - room.lastActivityAt <= RETRO_ACTIVITY_GRANULARITY_MS
  ) {
    return;
  }
  await ctx.db.patch(room._id, { lastActivityAt: now });
}

/**
 * Renames a room. The permission guard runs in the endpoint handler; the model
 * owns the validation, the write, and the activity bump.
 */
export async function renameRoom(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; name: string }
): Promise<void> {
  await ctx.db.patch(args.roomId, { name: validateRoomName(args.name) });
  await updateRoomActivity(ctx, args.roomId);
}
