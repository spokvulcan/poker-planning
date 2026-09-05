import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import type { ResolvedDecision } from "../permissions";
import { resolveRoomAction } from "./auth";
import { updateRoomActivity } from "./rooms";
import { requireRetro } from "./retro";
import { refusal } from "./refusal";
import {
  ANONYMOUS_CARDS_NOT_YET,
  CARD_NOT_FOUND,
  CARD_TEXT_REQUIRED,
  CARD_TEXT_TOO_LONG,
  PROMPT_NOT_FOUND,
} from "../retroCopy";

/**
 * Cards (spec §8.1, ADR-0012 named half, ADR-0022): writing, own-card
 * rights, the one move batch, and the text edit and delete. Every act here
 * is a person's and correct in every stage; the shared pointer never
 * forbids one (ADR-0010). Every rule-based refusal is a `ConvexError` with
 * one of the four codes (spec §4.5).
 */

export const MAX_CARD_TEXT = 2000;

export interface Position {
  x: number;
  y: number;
}

/** The actor a card mutation runs as: their user and their membership, from the guard. */
export interface CardActor {
  user: Doc<"users">;
  membership: Doc<"roomMemberships">;
}

/** The text a card stores: trimmed, non-empty, bounded. */
function validateCardText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw refusal("forbidden", CARD_TEXT_REQUIRED);
  }
  if (trimmed.length > MAX_CARD_TEXT) {
    throw refusal("forbidden", CARD_TEXT_TOO_LONG);
  }
  return trimmed;
}

/** A card of the room by its client-minted id, or null. */
export async function getCardByClientId(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  clientId: string
): Promise<Doc<"retroCards"> | null> {
  return ctx.db
    .query("retroCards")
    .withIndex("by_room_client", (q) => q.eq("roomId", roomId).eq("clientId", clientId))
    .unique();
}

async function requireCard(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  clientId: string
): Promise<Doc<"retroCards">> {
  const card = await getCardByClientId(ctx, roomId, clientId);
  if (!card) {
    throw refusal("missing", CARD_NOT_FOUND);
  }
  return card;
}

/**
 * Write a card (spec §8.1). The client mints `clientId`, so a retried
 * create finds its row and inserts nothing. In a named retro the caller
 * becomes the author; the anonymous half (edit keys, ADR-0012) is not
 * built yet, so an anonymous retro refuses the write rather than store an
 * author it promised not to. `committedAt = createdAt = Date.now()` inside
 * the mutation (spec §23.6).
 */
export async function createCard(
  ctx: MutationCtx,
  args: {
    room: Doc<"rooms">;
    actor: CardActor;
    clientId: string;
    text: string;
    promptId: string;
    position: Position;
  }
): Promise<Id<"retroCards">> {
  const retro = await requireRetro(ctx, args.room._id);
  if (!retro.format.prompts.some((p) => p.id === args.promptId)) {
    throw refusal("missing", PROMPT_NOT_FOUND);
  }
  const text = validateCardText(args.text);
  if (retro.attribution !== "named") {
    throw refusal("forbidden", ANONYMOUS_CARDS_NOT_YET);
  }
  const existing = await getCardByClientId(ctx, args.room._id, args.clientId);
  if (existing) {
    return existing._id;
  }
  const now = Date.now();
  const cardId = await ctx.db.insert("retroCards", {
    roomId: args.room._id,
    clientId: args.clientId,
    text,
    promptId: args.promptId,
    position: args.position,
    authorId: args.actor.user._id,
    createdAt: now,
    updatedAt: now,
    committedAt: now,
  });
  await updateRoomActivity(ctx, args.room);
  return cardId;
}

/**
 * Own-card rights (spec §8.1): the author may edit, move and delete their
 * card; anyone else needs `cardManagement`. The decision is the guard's own
 * (`resolveRoomAction`), read back rather than thrown because whether the
 * category applies depends on the card, and a denial must be a `forbidden`
 * refusal the client can tell from a failure. One check per act: a batch
 * resolves the category once and tests authorship per card.
 */
function cardRights(
  ctx: QueryCtx,
  room: Doc<"rooms">,
  actor: CardActor
): (card: Doc<"retroCards">) => Promise<void> {
  let decision: Promise<ResolvedDecision> | undefined;
  return async (card) => {
    if (card.authorId !== undefined && card.authorId === actor.user._id) {
      return;
    }
    decision ??= resolveRoomAction(ctx, actor.user, actor.membership, room, {
      kind: "category",
      category: "cardManagement",
    }).then((r) => r.decision);
    const verdict = await decision;
    if (!verdict.allowed) {
      throw refusal("forbidden", verdict.message);
    }
  };
}

/** Edit a card's text; the author is untouched and no editor is recorded (ADR-0012). */
export async function updateCardText(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; clientId: string; text: string }
): Promise<void> {
  const card = await requireCard(ctx, args.room._id, args.clientId);
  await cardRights(ctx, args.room, args.actor)(card);
  await ctx.db.patch(card._id, { text: validateCardText(args.text), updatedAt: Date.now() });
  await updateRoomActivity(ctx, args.room);
}

export interface CardMove {
  clientId: string;
  position: Position;
}

/**
 * The one move mutation (ADR-0022): a batch, one transaction and one
 * invalidation whether it is a single drop, a marquee drag or a tidy. A
 * move never changes a card's prompt (ADR-0016). Last write wins.
 */
export async function moveCards(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; moves: CardMove[] }
): Promise<void> {
  const cards = await Promise.all(
    args.moves.map((move) => requireCard(ctx, args.room._id, move.clientId))
  );
  const mayTouch = cardRights(ctx, args.room, args.actor);
  for (const card of cards) {
    await mayTouch(card);
  }
  const now = Date.now();
  await Promise.all(
    cards.map((card, i) =>
      ctx.db.patch(card._id, { position: args.moves[i].position, updatedAt: now })
    )
  );
  await updateRoomActivity(ctx, args.room);
}

/** Delete a card: own, or under `cardManagement`. */
export async function deleteCard(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; clientId: string }
): Promise<void> {
  const card = await requireCard(ctx, args.room._id, args.clientId);
  await cardRights(ctx, args.room, args.actor)(card);
  await ctx.db.delete(card._id);
  await updateRoomActivity(ctx, args.room);
}
