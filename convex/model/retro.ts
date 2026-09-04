import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { DEFAULT_RETRO_PERMISSIONS } from "../permissions";
import { validateRoomName } from "./rooms";
import { findFormat, seedStages, stampFormat } from "./retroFormats";
import { UNKNOWN_FORMAT } from "../retroCopy";

/**
 * The retro (ADR-0016): one room with its ceremony state in a `retros` row
 * beside it. This module holds creation and the board read; cards, clusters,
 * dots and the walk arrive with their own tickets.
 */

export interface CreateRetroArgs {
  name: string;
  ownerId: Id<"users">;
  /** A library format's name; the edited-copy seam is #290's. */
  formatName: string;
  /** Advisory cards-due date (ADR-0020). */
  collectUntil?: number;
}

/**
 * Creates a teamless retro: the room (`roomType: "retro"`, always owned,
 * `joinPolicy: "anyone"`, the retro permission defaults, not retained) and
 * the `retros` row (attribution `named`, the format copied whole, the stamped
 * stage list with the first entry current) in one mutation, then the
 * creator's owner membership. Its own function rather than a branch of
 * `Rooms.createRoom`, which hard-codes the canvas type and seeds canvas
 * nodes a retro never has.
 */
export async function createRetro(
  ctx: MutationCtx,
  args: CreateRetroArgs
): Promise<Id<"rooms">> {
  const format = findFormat(args.formatName);
  if (!format) {
    throw new Error(UNKNOWN_FORMAT);
  }
  const name = validateRoomName(args.name);
  const now = Date.now();

  const roomId = await ctx.db.insert("rooms", {
    name,
    roomType: "retro",
    autoCompleteVoting: false,
    isGameOver: false,
    createdAt: now,
    lastActivityAt: now,
    retained: false,
    ownerId: args.ownerId,
    joinPolicy: "anyone",
    permissions: { ...DEFAULT_RETRO_PERMISSIONS },
  });

  const stages = seedStages(format, { hasTeam: false });
  await ctx.db.insert("retros", {
    roomId,
    attribution: "named",
    format: stampFormat(format),
    stages,
    currentStageId: stages[0].id,
    currentStageEnteredAt: now,
    ...(args.collectUntil !== undefined ? { collectUntil: args.collectUntil } : {}),
  });

  await ctx.db.insert("roomMemberships", {
    roomId,
    userId: args.ownerId,
    isSpectator: false,
    role: "owner",
    joinedAt: now,
  });

  return roomId;
}

/** The retros row of a room, or null for a poker room. */
export async function getRetro(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"retros"> | null> {
  return ctx.db
    .query("retros")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .unique();
}

/**
 * The board's structure read (spec §9): the `retros` row. Identity-free, so
 * every viewer shares one cached result. Cards and clusters join it with
 * the cards ticket.
 */
export async function getBoard(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"retros">> {
  const retro = await getRetro(ctx, roomId);
  if (!retro) {
    throw new Error("Not a retro");
  }
  return retro;
}
