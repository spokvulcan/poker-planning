import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { resolveRoomAction } from "./auth";
import { updateRoomActivity } from "./rooms";
import { refusal } from "./refusal";
import { getCardByClientId, type CardActor } from "./retroCards";
import {
  CARD_NOT_FOUND,
  CLUSTER_NAME_REQUIRED,
  CLUSTER_NAME_TOO_LONG,
  CLUSTER_NOT_FOUND,
  CLUSTER_SELECTION_REQUIRED,
  MERGE_INTO_SELF,
  nextGroupName,
} from "../retroCopy";

/**
 * Clusters (spec §10.3, ADR-0011, ADR-0016): a cluster is an identity, not
 * a location. The row is a name and nothing else — no position, no member
 * list, no count — and membership is the `clusterId` on each card. Forming
 * one and changing membership is open to every attendee (spec §4.2 keeps
 * it out of the config); rename, merge and dissolve are `cardManagement`.
 * No member ever moves here: tidy is the client computing positions and
 * calling the one move batch. Every act is correct in every stage
 * (ADR-0010) and bumps the activity chokepoint (spec §14).
 *
 * Dots and action sources arrive with #294 and #296: merge re-points dots,
 * dissolve deletes them behind the confirmation and nulls an action's
 * source. A cluster emptied by a membership change is removed as a dissolve
 * of nothing; those tickets treat it as one.
 */

export const MAX_CLUSTER_NAME = 80;

async function requireCluster(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  clusterId: Id<"retroClusters">
): Promise<Doc<"retroClusters">> {
  const cluster = await ctx.db.get(clusterId);
  if (!cluster || cluster.roomId !== roomId) {
    throw refusal("missing", CLUSTER_NOT_FOUND);
  }
  return cluster;
}

/** The room's cards named by the selection, each a `missing` refusal when gone. */
async function requireCards(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  clientIds: readonly string[]
): Promise<Doc<"retroCards">[]> {
  if (clientIds.length === 0) {
    throw refusal("forbidden", CLUSTER_SELECTION_REQUIRED);
  }
  const unique = [...new Set(clientIds)];
  return Promise.all(
    unique.map(async (clientId) => {
      const card = await getCardByClientId(ctx, roomId, clientId);
      if (!card) throw refusal("missing", CARD_NOT_FOUND);
      return card;
    })
  );
}

async function membersOf(ctx: QueryCtx, clusterId: Id<"retroClusters">): Promise<Doc<"retroCards">[]> {
  return ctx.db
    .query("retroCards")
    .withIndex("by_cluster", (q) => q.eq("clusterId", clusterId))
    .collect();
}

/** The `cardManagement` decision as a `forbidden` refusal the client can tell from a failure. */
async function requireCardManagement(ctx: QueryCtx, room: Doc<"rooms">, actor: CardActor): Promise<void> {
  const { decision } = await resolveRoomAction(ctx, actor.user, actor.membership, room, {
    kind: "category",
    category: "cardManagement",
  });
  if (!decision.allowed) {
    throw refusal("forbidden", decision.message);
  }
}

function validateClusterName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw refusal("forbidden", CLUSTER_NAME_REQUIRED);
  if (trimmed.length > MAX_CLUSTER_NAME) throw refusal("forbidden", CLUSTER_NAME_TOO_LONG);
  return trimmed;
}

/** The default name at formation, by the rule the copy register keeps. */
async function defaultName(ctx: QueryCtx, roomId: Id<"rooms">): Promise<string> {
  return nextGroupName(
    await ctx.db
      .query("retroClusters")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

/**
 * Point cards at a cluster (or at none), then drop any cluster the change
 * emptied. Positions are untouched.
 */
async function repoint(
  ctx: MutationCtx,
  cards: readonly Doc<"retroCards">[],
  clusterId: Id<"retroClusters"> | undefined
): Promise<void> {
  const vacated = new Set<Id<"retroClusters">>();
  for (const card of cards) {
    if (card.clusterId !== undefined && card.clusterId !== clusterId) vacated.add(card.clusterId);
  }
  await Promise.all(
    cards.map((card) =>
      ctx.db.patch(card._id, clusterId === undefined ? { clusterId: undefined } : { clusterId })
    )
  );
  for (const id of vacated) {
    if ((await membersOf(ctx, id)).length === 0) await ctx.db.delete(id);
  }
}

/**
 * Form a cluster from a selection (everyone): the row named "Group {n}",
 * every selected card pointed at it. A card already in another cluster is
 * re-pointed; members never move.
 */
export async function formCluster(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; clientIds: string[] }
): Promise<Id<"retroClusters">> {
  const cards = await requireCards(ctx, args.room._id, args.clientIds);
  const clusterId = await ctx.db.insert("retroClusters", {
    roomId: args.room._id,
    name: await defaultName(ctx, args.room._id),
    createdAt: Date.now(),
  });
  await repoint(ctx, cards, clusterId);
  await updateRoomActivity(ctx, args.room);
  return clusterId;
}

/** Add cards to a cluster (everyone). */
export async function addToCluster(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; clusterId: Id<"retroClusters">; clientIds: string[] }
): Promise<void> {
  const cluster = await requireCluster(ctx, args.room._id, args.clusterId);
  const cards = await requireCards(ctx, args.room._id, args.clientIds);
  await repoint(ctx, cards, cluster._id);
  await updateRoomActivity(ctx, args.room);
}

/** Take cards out of whatever cluster they are in (everyone); a cluster left empty is removed. */
export async function removeFromCluster(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; clientIds: string[] }
): Promise<void> {
  const cards = await requireCards(ctx, args.room._id, args.clientIds);
  await repoint(ctx, cards, undefined);
  await updateRoomActivity(ctx, args.room);
}

/** Rename a cluster (`cardManagement`). */
export async function renameCluster(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; clusterId: Id<"retroClusters">; name: string }
): Promise<void> {
  const cluster = await requireCluster(ctx, args.room._id, args.clusterId);
  await requireCardManagement(ctx, args.room, args.actor);
  await ctx.db.patch(cluster._id, { name: validateClusterName(args.name) });
  await updateRoomActivity(ctx, args.room);
}

/** Merge one cluster into another (`cardManagement`): members re-pointed, the empty row deleted. */
export async function mergeClusters(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; from: Id<"retroClusters">; into: Id<"retroClusters"> }
): Promise<void> {
  if (args.from === args.into) throw refusal("forbidden", MERGE_INTO_SELF);
  const from = await requireCluster(ctx, args.room._id, args.from);
  const into = await requireCluster(ctx, args.room._id, args.into);
  await requireCardManagement(ctx, args.room, args.actor);
  const members = await membersOf(ctx, from._id);
  await Promise.all(members.map((card) => ctx.db.patch(card._id, { clusterId: into._id })));
  await ctx.db.delete(from._id);
  await updateRoomActivity(ctx, args.room);
}

/** Dissolve a cluster (`cardManagement`): every member's `clusterId` nulled, the row deleted. */
export async function dissolveCluster(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; clusterId: Id<"retroClusters"> }
): Promise<void> {
  const cluster = await requireCluster(ctx, args.room._id, args.clusterId);
  await requireCardManagement(ctx, args.room, args.actor);
  const members = await membersOf(ctx, cluster._id);
  await Promise.all(members.map((card) => ctx.db.patch(card._id, { clusterId: undefined })));
  await ctx.db.delete(cluster._id);
  await updateRoomActivity(ctx, args.room);
}
