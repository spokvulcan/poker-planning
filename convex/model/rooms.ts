import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import * as Canvas from "./canvas";
import * as Memberships from "./memberships";
import * as Ownership from "./ownership";
import * as RoundClock from "./roundClock";
import { checkPick, type DeckPick } from "../scales";
import { ROOM_NAME } from "../constants";
import { refusal, requireValid } from "./refusal";
import { rulesOf } from "../ceremony";
import { isRoomOwnerAbsent } from "./permissions";

export interface CreateRoomArgs {
  name: string;
  roomType?: "canvas"; // Optional, defaults to canvas
  autoCompleteVoting?: boolean;
  /** Which time nodes the board shows; the room's defaults when absent. */
  timeNodes?: Canvas.TimeNodesShown;
  /** The deck its creator picked: a preset, or their own cards as typed; the default when absent. */
  votingScale?: DeckPick;
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
export async function openRoom(
  ctx: MutationCtx,
  owner: Doc<"users">,
  fields: RoomFields,
  timeNodes?: Canvas.TimeNodesShown
): Promise<Id<"rooms">> {
  const now = Date.now();
  const roomId = await ctx.db.insert("rooms", {
    ...fields,
    name: requireValid(ROOM_NAME, fields.name),
    createdAt: now,
    lastActivityAt: now,
    ...Ownership.initialOwnership(fields, owner),
  });
  const room = (await ctx.db.get("rooms", roomId))!;
  await Canvas.openBoard(ctx, room, timeNodes);
  await Memberships.join(ctx, room, owner);
  return roomId;
}

/**
 * Opens a planning poker room with the scale its creator's pick stores, read
 * as the create page read it (`checkPick`). A custom deck that breaks a rule
 * is refused in the rule's own words, whoever sent it.
 */
export async function createRoom(
  ctx: MutationCtx,
  args: CreateRoomArgs & { owner: Doc<"users"> }
): Promise<Id<"rooms">> {
  const checked = checkPick(args.votingScale);
  if (!checked.ok) throw refusal("forbidden", checked.message);
  return await openRoom(ctx, args.owner, {
    name: args.name,
    roomType: "canvas",
    autoCompleteVoting: args.autoCompleteVoting ?? false,
    isGameOver: false,
    votingScale: checked.scale,
  }, args.timeNodes);
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
 * here, so the sweep's inactivity window (model/roomEnding.ts)
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
  // A long quiet before this write is one the round clock leaves out (ADR-0032).
  await RoundClock.noteActivity(ctx, room, now);
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
