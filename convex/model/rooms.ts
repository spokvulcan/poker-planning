import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import * as Canvas from "./canvas";
import * as Memberships from "./memberships";
import * as Ownership from "./ownership";
import { DEFAULT_SCALE, VOTING_SCALES, VotingScaleType, validateCustomScale } from "../scales";
import { ROOM_NAME } from "../constants";
import { requireValid } from "./refusal";
import { rulesOf } from "../ceremony";
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

export interface SanitizedVote extends Doc<"votes"> {
  hasVoted: boolean;
}

export interface RoomWithRelatedData {
  room: Doc<"rooms">;
  users: Memberships.RoomUserData[];
  votes: SanitizedVote[];
  isOwnerAbsent: boolean;
}

/**
 * Resolves voting scale configuration from user input
 */
function resolveVotingScale(scaleConfig?: CreateRoomArgs["votingScale"]) {
  // Handle custom scales
  if (scaleConfig?.type === "custom") {
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

  // Handle predefined scales, and the default when none was picked
  const predefinedScale = scaleConfig ? VOTING_SCALES[scaleConfig.type] : DEFAULT_SCALE;
  return {
    type: predefinedScale.type,
    cards: [...predefinedScale.cards],
    isNumeric: predefinedScale.isNumeric,
  };
}

/** The fields a new room of either ceremony is written with, besides its own. */
type RoomFields = Omit<
  Doc<"rooms">,
  "_id" | "_creationTime" | "createdAt" | "lastActivityAt" | "ownerId" | "retained"
>;

/**
 * Opens a room of either ceremony: the row, its owner (ownership decides
 * whether it's kept), the board it starts with, and its owner seated in it,
 * so the person who made it lands straight on its canvas.
 */
export async function openRoom(ctx: MutationCtx, owner: Doc<"users">, fields: RoomFields): Promise<Id<"rooms">> {
  const now = Date.now();
  const roomId = await ctx.db.insert("rooms", {
    ...fields,
    name: requireValid(ROOM_NAME, fields.name),
    createdAt: now,
    lastActivityAt: now,
    ...Ownership.initialOwnership(fields, owner),
  });
  const room = (await ctx.db.get("rooms", roomId))!;
  await Canvas.openBoard(ctx, room);
  await Memberships.join(ctx, room, owner);
  return roomId;
}

/** Opens a planning poker room with its voting scale. */
export async function createRoom(
  ctx: MutationCtx,
  args: CreateRoomArgs & { owner: Doc<"users"> }
): Promise<Id<"rooms">> {
  return await openRoom(ctx, args.owner, {
    name: args.name,
    roomType: "canvas",
    autoCompleteVoting: args.autoCompleteVoting ?? false,
    isGameOver: false,
    votingScale: resolveVotingScale(args.votingScale),
  });
}

/**
 * Fetches a room with all related data (users and votes)
 */
export async function getRoomWithRelatedData(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  currentUserId?: Id<"users">
): Promise<RoomWithRelatedData | null> {
  const room = await ctx.db.get("rooms", roomId);
  if (!room) return null;

  // Get users (via memberships), votes, and owner-absent status in parallel
  const [users, votes, ownerAbsent] = await Promise.all([
    Memberships.getRoomUsers(ctx, roomId),
    ctx.db
      .query("votes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    room.ownerId ? isRoomOwnerAbsent(ctx, room) : Promise.resolve(false),
  ]);

  // Sanitize votes based on game state
  const sanitizedVotes = sanitizeVotes(votes, room.isGameOver, currentUserId);

  return {
    room,
    users,
    votes: sanitizedVotes,
    isOwnerAbsent: ownerAbsent,
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
 * The single chokepoint for room activity writes (ADR-0005). Every
 * user-initiated mutation touching room-scoped state routes its bump through
 * here, so the cleanup cascade's inactivity window (model/cleanup.ts)
 * reflects real use — a room worked only via its timer or canvas must not
 * read as abandoned.
 *
 * The chokepoint owns the clock's precision (ADR-0018), which the ceremony
 * sets: exact for a poker room, because poker analytics compares
 * `computedAt` to this clock exactly (ADR-0007); at most once an hour for a
 * retro, whose readers need only day-level precision. A room that is gone
 * returns without patching.
 */
export async function updateRoomActivity(
  ctx: MutationCtx,
  roomOrId: Doc<"rooms"> | Id<"rooms">
): Promise<void> {
  // A caller whose guard already loaded the room passes the row; the id
  // form re-reads it.
  const room = typeof roomOrId === "string" ? await ctx.db.get("rooms", roomOrId) : roomOrId;
  if (!room) return;
  const now = Date.now();
  const granularity = rulesOf(room).activityGranularityMs;
  if (granularity > 0 && now - room.lastActivityAt <= granularity) return;
  await ctx.db.patch("rooms", room._id, { lastActivityAt: now });
}

/**
 * Renames a room. The handler's room-scoped step runs the permission guard and
 * hands over the room; the model owns the validation, the write, and the
 * activity bump.
 */
export async function renameRoom(ctx: MutationCtx, room: Doc<"rooms">, name: string): Promise<void> {
  await ctx.db.patch("rooms", room._id, { name: requireValid(ROOM_NAME, name) });
  await updateRoomActivity(ctx, room);
}
