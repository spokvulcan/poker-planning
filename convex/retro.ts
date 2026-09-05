import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import * as Retro from "./model/retro";
import * as RetroCards from "./model/retroCards";
import * as RetroClusters from "./model/retroClusters";
import * as RetroVotes from "./model/retroVotes";
import * as RetroWalk from "./model/retroWalk";
import {
  joinPolicyValidator,
  retroFormatValidator,
  retroStageValidator,
  stageKindValidator,
  topicRefValidator,
  visibilityValidator,
} from "./schema";
import { refusal } from "./model/refusal";
import { ROOM_NOT_FOUND } from "./retroCopy";
import {
  getOptionalAuthUser,
  requireAuthUser,
  requireCan,
  requireRoomMember,
  requireRoomReader,
  requireTeamRole,
} from "./model/auth";

/**
 * Create a retro (spec §6.1): anyone, anonymous included, creates a teamless
 * one; any Team member creates one the Team keeps. Returns the room id; the
 * creator holds the owner membership already.
 */
export const create = mutation({
  args: {
    name: v.string(),
    /** A library format by name, stamped as shipped. */
    formatName: v.optional(v.string()),
    /** The create form's edited copy (spec §6.1); wins over `formatName`. */
    format: v.optional(retroFormatValidator),
    /** The create form's edited stage list; the standard seed when absent. */
    stages: v.optional(v.array(retroStageValidator)),
    collectUntil: v.optional(v.number()),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAuthUser(ctx);
    const { teamId, ...rest } = args;
    const team = teamId ? (await requireTeamRole(ctx, teamId, "member")).team : undefined;
    return await Retro.createRetro(ctx, { ...rest, ownerId: user._id, team });
  },
});

/**
 * The board (spec §9): the retros row, every cluster and every card through
 * the projection, identical for every viewer. Room access, not attendance
 * (ADR-0009).
 */
export const board = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Retro.board(ctx, args.roomId);
  },
});

/**
 * The viewer's own cards in full, whatever the shared pointer hides (spec
 * §9): by author in a named retro, by the presented edit keys in an
 * anonymous one (ADR-0012).
 */
export const mine = query({
  args: { roomId: v.id("rooms"), editKeys: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const { user } = await requireRoomReader(ctx, args.roomId);
    return await Retro.mine(ctx, args.roomId, user._id, args.editKeys);
  },
});

// --- Stages (ADR-0010, spec §7) ---

/** Move the shared pointer to any entry, forward or back (`stageFlow`). */
export const advance = mutation({
  args: { roomId: v.id("rooms"), toStageId: v.string() },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "stageFlow" });
    await Retro.advance(ctx, { room, ...rest });
  },
});

/** The in-place reveal toggle on the current entry (`stageFlow`, ADR-0015). */
export const setCardsVisible = mutation({
  args: { roomId: v.id("rooms"), stageId: v.string(), value: visibilityValidator },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "stageFlow" });
    await Retro.setCardsVisible(ctx, { room, ...rest });
  },
});

/** The current entry's advisory timebox, in whole minutes; omit to clear (`stageFlow`). */
export const setTimebox = mutation({
  args: { roomId: v.id("rooms"), stageId: v.string(), minutes: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "stageFlow" });
    await Retro.setTimebox(ctx, { room, ...rest });
  },
});

// --- The discussion walk (ADR-0023, spec §12.2) ---

// Attendance is the guard here; `stageFlow` is decided in the model as a
// `forbidden` refusal the client can tell from a failure (ADR-0022).

/** Move the walk's cursor to an index of its order (`stageFlow`). */
export const setWalkCursor = mutation({
  args: { roomId: v.id("rooms"), index: v.number() },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroWalk.setWalkCursor(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Tick or untick a topic of the order (`stageFlow`); `topicId` is the bare row id. */
export const markCovered = mutation({
  args: { roomId: v.id("rooms"), topicId: v.string(), covered: v.boolean() },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroWalk.markCovered(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Put a topic outside the walk next after the cursor (`stageFlow`); a no-op inside it. */
export const raise = mutation({
  args: { roomId: v.id("rooms"), topicRef: topicRefValidator },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroWalk.raise(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

// --- Settings (ADR-0021, spec §6.4) ---

/** Rename the retro (`retroSettings`). */
export const rename = mutation({
  args: { roomId: v.id("rooms"), name: v.string() },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    await Retro.renameRetro(ctx, { room, ...rest });
  },
});

/** Edit who may join (`retroSettings`); `teamMembers` only on a team retro. */
export const setJoinPolicy = mutation({
  args: { roomId: v.id("rooms"), joinPolicy: joinPolicyValidator },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, {
      kind: "category",
      category: "retroSettings",
    });
    await Retro.setJoinPolicy(ctx, { room, joinPolicy: args.joinPolicy });
  },
});

/** The advisory cards-due date; omit to clear (`retroSettings`). */
export const setCollectUntil = mutation({
  args: { roomId: v.id("rooms"), collectUntil: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    await Retro.setCollectUntil(ctx, { room, ...rest });
  },
});

/** Edit a prompt's label or hint at any stage (`retroSettings`). */
export const updatePrompt = mutation({
  args: {
    roomId: v.id("rooms"),
    promptId: v.string(),
    label: v.optional(v.string()),
    hint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    await Retro.updatePrompt(ctx, { room, ...rest });
  },
});

/** Add a prompt at any stage, up to ten (`retroSettings`). Returns its id. */
export const addPrompt = mutation({
  args: {
    roomId: v.id("rooms"),
    label: v.string(),
    hint: v.optional(v.string()),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    return await Retro.addPrompt(ctx, { room, ...rest });
  },
});

/** Remove a prompt no card answers (`retroSettings`). */
export const removePrompt = mutation({
  args: { roomId: v.id("rooms"), promptId: v.string() },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    await Retro.removePrompt(ctx, { room, ...rest });
  },
});

/** Add a stage entry of a kind, at an index or at the end (`retroSettings`). Returns its id. */
export const addStage = mutation({
  args: { roomId: v.id("rooms"), kind: stageKindValidator, index: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    return await Retro.addStage(ctx, { room, ...rest });
  },
});

/** Remove a stage entry except collect, discuss and the current one (`retroSettings`). */
export const removeStage = mutation({
  args: { roomId: v.id("rooms"), stageId: v.string() },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    await Retro.removeStage(ctx, { room, ...rest });
  },
});

/** Reorder the stage list; collect, discuss and the current entry hold their place (`retroSettings`). */
export const reorderStages = mutation({
  args: { roomId: v.id("rooms"), stageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    await Retro.reorderStages(ctx, { room, ...rest });
  },
});

/**
 * Give a teamless retro to a Team (spec §5): the room owner, who must also
 * be a member of the Team. Attendance and Team membership are guarded here;
 * ownership is the model's identity rule.
 */
export const adoptIntoTeam = mutation({
  args: { roomId: v.id("rooms"), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    await requireTeamRole(ctx, args.teamId, "member");
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw refusal("missing", ROOM_NOT_FOUND);
    }
    await Retro.adoptIntoTeam(ctx, { room, actorUserId: user._id, teamId: args.teamId });
  },
});

/** A team admin takes ownership of a team retro whose owner is gone (ADR-0013). */
export const claim = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room, membership } = await requireCan(ctx, args.roomId, {
      kind: "relationship",
      verb: "claim",
    });
    await Retro.claim(ctx, { room, actorMembership: membership });
  },
});

/**
 * The owner-only ratchet (ADR-0012, spec §4.3): named to anonymous, once,
 * forever; every author stripped, the first batch here and the rest by
 * schedule.
 */
export const ratchet = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "relationship", verb: "ratchet" });
    await Retro.ratchet(ctx, room);
  },
});

/** Owner-level hard delete through the room cascade (ADR-0019). */
export const remove = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "relationship", verb: "delete" });
    await Retro.deleteRetro(ctx, room);
  },
});

/** The counts the delete confirmation names (spec §19). Room access. */
export const deleteCounts = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Retro.deleteCounts(ctx, args.roomId);
  },
});

/** The create form's pre-selection: the Team's newest retro's format, or null. */
export const lastFormat = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "member");
    return await Retro.lastFormat(ctx, args.teamId);
  },
});

/** The team page's listing: the Team's retros in creation order (members only). */
export const listForTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "member");
    return await Retro.listForTeam(ctx, args.teamId);
  },
});

/**
 * `/dashboard/retros`: the retros the caller attended, grouped by Team with
 * teamless ones under "No team"; empty for a visitor without an account.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) return [];
    return await Retro.listMine(ctx, user._id);
  },
});

// --- Cards (spec §8.1, ADR-0022) ---

const positionValidator = v.object({ x: v.number(), y: v.number() });

/**
 * Write a card. Attendance is the only guard: writing is never in the
 * config (spec §4.2). The client mints `clientId`; a retry returns the row.
 * Returns `{ cardId, editKey? }`: in an anonymous retro the key rides back
 * once, and the client keeps it (ADR-0012).
 */
export const createCard = mutation({
  args: {
    roomId: v.id("rooms"),
    clientId: v.string(),
    text: v.string(),
    promptId: v.string(),
    position: positionValidator,
  },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    return await RetroCards.createCard(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Edit a card's text: own (by author or edit key), or under `cardManagement`; the model decides per card. */
export const updateCard = mutation({
  args: { roomId: v.id("rooms"), clientId: v.string(), text: v.string(), editKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroCards.updateCardText(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** The one move mutation: a batch of `{ clientId, position, editKey? }` (ADR-0022, ADR-0012). */
export const moveCards = mutation({
  args: {
    roomId: v.id("rooms"),
    moves: v.array(
      v.object({ clientId: v.string(), position: positionValidator, editKey: v.optional(v.string()) })
    ),
  },
  handler: async (ctx, args) => {
    await RetroCards.moveCards(ctx, { ...(await requireCardActor(ctx, args.roomId)), moves: args.moves });
  },
});

/** Delete a card: own (by author or edit key), or under `cardManagement`. */
export const deleteCard = mutation({
  args: { roomId: v.id("rooms"), clientId: v.string(), editKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroCards.deleteCard(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

// --- Clusters (spec §10.3, ADR-0011) ---

/**
 * Form a cluster from a selection: attendance is the only guard (forming
 * is never in the config, spec §4.2). Returns the new row's id; members
 * never move.
 */
export const formCluster = mutation({
  args: { roomId: v.id("rooms"), clientIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    return await RetroClusters.formCluster(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Add cards to a cluster (everyone). */
export const addToCluster = mutation({
  args: { roomId: v.id("rooms"), clusterId: v.id("retroClusters"), clientIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroClusters.addToCluster(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Take cards out of their cluster (everyone); a cluster left empty is removed. */
export const removeFromCluster = mutation({
  args: { roomId: v.id("rooms"), clientIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroClusters.removeFromCluster(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Rename a cluster: `cardManagement`, decided in the model as a `forbidden` refusal. */
export const renameCluster = mutation({
  args: { roomId: v.id("rooms"), clusterId: v.id("retroClusters"), name: v.string() },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroClusters.renameCluster(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Merge `from` into `into` (`cardManagement`): members re-pointed, the empty row deleted. */
export const mergeClusters = mutation({
  args: { roomId: v.id("rooms"), from: v.id("retroClusters"), into: v.id("retroClusters") },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroClusters.mergeClusters(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Dissolve a cluster (`cardManagement`): every member's `clusterId` nulled, the row deleted. */
export const dissolveCluster = mutation({
  args: { roomId: v.id("rooms"), clusterId: v.id("retroClusters"), removeVotes: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    return await RetroClusters.dissolveCluster(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Place one dot on a topic within the current entry's budget (spec §11). */
export const placeDot = mutation({
  args: { roomId: v.id("rooms"), target: topicRefValidator },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroVotes.placeDot(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** Take one of the viewer's own dots off a topic (spec §11). */
export const removeDot = mutation({
  args: { roomId: v.id("rooms"), target: topicRefValidator },
  handler: async (ctx, args) => {
    const { roomId, ...rest } = args;
    await RetroVotes.removeDot(ctx, { ...(await requireCardActor(ctx, roomId)), ...rest });
  },
});

/** The tally (spec §9): counts when the entry shows them, the viewer's own dots always. */
export const tally = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { user } = await requireRoomReader(ctx, args.roomId);
    return await RetroVotes.tally(ctx, { roomId: args.roomId, viewerId: user._id });
  },
});

/**
 * A card or cluster act's actor: the attendance guard (which does not load
 * the room) and the room row the model needs.
 */
async function requireCardActor(ctx: QueryCtx, roomId: Id<"rooms">) {
  const { user, membership } = await requireRoomMember(ctx, roomId);
  const room = await ctx.db.get(roomId);
  if (!room) {
    throw refusal("missing", ROOM_NOT_FOUND);
  }
  return { room, actor: { user, membership } };
}
