import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { resolveRoomAction } from "./auth";
import { updateRoomActivity } from "./rooms";
import type { CardActor } from "./retroCards";
import { refusal } from "./refusal";
import { requireRetro } from "./retro";
import { currentStageOf } from "./retroFormats";
import { topicId, type TopicRef, type Walk } from "./walk";
import { CARD_NOT_FOUND, CLUSTER_NOT_FOUND, NO_WALK, WALK_TOPIC_NOT_FOUND } from "../retroCopy";

/**
 * The walk's acts (spec §12.2, ADR-0023), all `stageFlow`, decided here as
 * a `forbidden` refusal (ADR-0022) the way a cluster's rename is: the
 * cursor, coverage ticks, and `raise`, the one writer of the order after
 * the snapshot. Each is refused with `stage`
 * unless the shared pointer is a `discuss` entry whose walk exists (spec
 * §7): they reference the current entry's state, which is the only kind
 * of stage-coded refusal a retro has. Every act bumps the chokepoint.
 */

interface WalkAct {
  room: Doc<"rooms">;
  actor: CardActor;
}

/**
 * The retro and its walk when the actor holds `stageFlow` and the current
 * entry is a `discuss` entry keyed to it: `forbidden` first, then `stage`.
 */
async function requireWalk(ctx: MutationCtx, args: WalkAct): Promise<{ retro: Doc<"retros">; walk: Walk }> {
  const { decision } = await resolveRoomAction(ctx, args.actor.user, args.actor.membership, args.room, {
    kind: "category",
    category: "stageFlow",
  });
  if (!decision.allowed) {
    throw refusal("forbidden", decision.message);
  }
  const retro = await requireRetro(ctx, args.room._id);
  const entry = currentStageOf(retro);
  if (entry.kind !== "discuss" || retro.walk === undefined || retro.walk.stageEntryId !== entry.id) {
    throw refusal("stage", NO_WALK);
  }
  return { retro, walk: retro.walk };
}

/** Move the cursor to an index of the order; outside it is `missing`. */
export async function setWalkCursor(ctx: MutationCtx, args: WalkAct & { index: number }): Promise<void> {
  const { retro, walk } = await requireWalk(ctx, args);
  if (!Number.isInteger(args.index) || args.index < 0 || args.index >= walk.order.length) {
    throw refusal("missing", WALK_TOPIC_NOT_FOUND);
  }
  await ctx.db.patch(retro._id, { walk: { ...walk, cursor: args.index } });
  await updateRoomActivity(ctx, args.room);
}

/** Tick or untick a topic of the order; one the order does not hold is `missing`. Idempotent. */
export async function markCovered(
  ctx: MutationCtx,
  args: WalkAct & { topicId: string; covered: boolean }
): Promise<void> {
  const { retro, walk } = await requireWalk(ctx, args);
  if (!walk.order.some((ref) => topicId(ref) === args.topicId)) {
    throw refusal("missing", WALK_TOPIC_NOT_FOUND);
  }
  const covered = walk.covered.filter((id) => id !== args.topicId);
  if (args.covered) covered.push(args.topicId);
  await ctx.db.patch(retro._id, { walk: { ...walk, covered } });
  await updateRoomActivity(ctx, args.room);
}

/**
 * Raise a topic into the walk (ADR-0023): inserted right after the cursor
 * so it is next and the current topic is not interrupted. A no-op for a
 * topic already in the order; a topic gone from the room is `missing`.
 */
export async function raise(ctx: MutationCtx, args: WalkAct & { topicRef: TopicRef }): Promise<void> {
  const { retro, walk } = await requireWalk(ctx, args);
  const topic = await ctx.db.get(args.topicRef.id);
  if (!topic || topic.roomId !== args.room._id) {
    throw refusal("missing", args.topicRef.kind === "card" ? CARD_NOT_FOUND : CLUSTER_NOT_FOUND);
  }
  if (!walk.order.some((ref) => topicId(ref) === args.topicRef.id)) {
    const order = [...walk.order];
    order.splice(Math.min(walk.cursor + 1, order.length), 0, args.topicRef);
    await ctx.db.patch(retro._id, { walk: { ...walk, order } });
  }
  await updateRoomActivity(ctx, args.room);
}
