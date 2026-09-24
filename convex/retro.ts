import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import * as Retro from "./model/retro";
import { renameRoom, updateRoomActivity } from "./model/rooms";
import {
  getOptionalAuthUser,
  requireAuthUser,
  requireCan,
  requireRoomMember,
  requireRoomReader,
} from "./model/auth";
import { gifValidator, retroPermissionsValidator, retroStepValidator, stickyColorValidator } from "./schema";
import { refusal } from "./model/refusal";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const positionValidator = v.object({ x: v.number(), y: v.number() });

type MemberRoom = { user: Doc<"users">; membership: Doc<"roomMemberships">; room: Doc<"rooms"> };

/** The room a retro write lands in, loaded after the attendance guard. */
async function memberRoom(ctx: MutationCtx, roomId: Id<"rooms">): Promise<MemberRoom> {
  const { user, membership } = await requireRoomMember(ctx, roomId);
  const room = await ctx.db.get(roomId);
  if (!room) throw refusal("missing", "This retro is gone.");
  return { user, membership, room };
}

/** A sticky and the room it lives in, for writes addressed by sticky. */
async function memberSticky(
  ctx: MutationCtx,
  stickyId: Id<"retroStickies">
): Promise<MemberRoom & { sticky: Doc<"retroStickies"> }> {
  const sticky = await ctx.db.get(stickyId);
  if (!sticky) throw refusal("missing", "That sticky is gone.");
  return { ...(await memberRoom(ctx, sticky.roomId)), sticky };
}

// --- Retros -------------------------------------------------------------------

/** Opens a retro and returns its room. The creator joins it like any room. */
export const create = mutation({
  args: { name: v.string(), templateId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await requireAuthUser(ctx);
    return await Retro.createRetro(ctx, { name: args.name, templateId: args.templateId, owner: user });
  },
});

/** The retros the signed-in person has joined, newest first; none for a visitor without an account. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) return [];
    return await Retro.listRetrosOf(ctx, user._id);
  },
});

export const rename = mutation({
  args: { roomId: v.id("rooms"), name: v.string() },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "category", category: "retroSettings" });
    Retro.retroOf(room);
    await renameRoom(ctx, args);
  },
});

/** Who may run the steps, manage stickies and actions, and change settings. Owner only. */
export const updatePermissions = mutation({
  args: { roomId: v.id("rooms"), permissions: retroPermissionsValidator },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "relationship", verb: "changePerms" });
    Retro.retroOf(room);
    await ctx.db.patch(room._id, { permissions: args.permissions });
    await updateRoomActivity(ctx, room);
  },
});

/** Deletes the retro for everyone. Owner only. */
export const remove = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "relationship", verb: "delete" });
    await Retro.deleteRetro(ctx, room);
  },
});

/** Opens the next retro, carrying open action items; returns its room. */
export const startNext = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room, user } = await requireCan(ctx, args.roomId, { kind: "category", category: "stageFlow" });
    return await Retro.startNextRetro(ctx, room, user);
  },
});

// --- Steps and the discussion ---------------------------------------------------

export const setStep = mutation({
  args: { roomId: v.id("rooms"), step: retroStepValidator },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "category", category: "stageFlow" });
    await Retro.setStep(ctx, room, args.step);
  },
});

export const stepDiscussion = mutation({
  args: { roomId: v.id("rooms"), direction: v.union(v.literal("next"), v.literal("previous")) },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "category", category: "stageFlow" });
    await Retro.stepDiscussion(ctx, room, args.direction);
  },
});

export const focusTopic = mutation({
  args: { roomId: v.id("rooms"), stickyId: v.id("retroStickies") },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "category", category: "stageFlow" });
    await Retro.focusTopic(ctx, room, args.stickyId);
  },
});

// --- Settings and columns -------------------------------------------------------

export const updateSettings = mutation({
  args: {
    roomId: v.id("rooms"),
    votesPerPerson: v.optional(v.number()),
    showAuthors: v.optional(v.boolean()),
  },
  handler: async (ctx, { roomId, ...patch }) => {
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    await Retro.updateSettings(ctx, room, patch);
  },
});

export const updateColumn = mutation({
  args: {
    roomId: v.id("rooms"),
    columnId: v.string(),
    title: v.optional(v.string()),
    emoji: v.optional(v.string()),
    color: v.optional(stickyColorValidator),
  },
  handler: async (ctx, { roomId, columnId, ...patch }) => {
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    await Retro.updateColumn(ctx, room, columnId, patch);
  },
});

export const addColumn = mutation({
  args: { roomId: v.id("rooms"), title: v.string(), emoji: v.string(), color: stickyColorValidator },
  handler: async (ctx, { roomId, ...column }) => {
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "retroSettings" });
    return await Retro.addColumn(ctx, room, column);
  },
});

export const removeColumn = mutation({
  args: { roomId: v.id("rooms"), columnId: v.string() },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "category", category: "retroSettings" });
    await Retro.removeColumn(ctx, room, args.columnId);
  },
});

// --- The board ------------------------------------------------------------------

/** Every sticky as the viewer may see it, plus the writer and the viewer's vote counts. */
export const board = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { user, room } = await requireRoomReader(ctx, args.roomId);
    return await Retro.getBoard(ctx, room, user._id);
  },
});

/** How many votes everyone has cast: its own query, so a vote doesn't re-send every board. */
export const votesCast = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Retro.countVotes(ctx, args.roomId);
  },
});

export const addSticky = mutation({
  args: {
    roomId: v.id("rooms"),
    clientId: v.string(),
    columnId: v.string(),
    text: v.string(),
    gif: v.optional(gifValidator),
    position: positionValidator,
  },
  handler: async (ctx, { roomId, ...args }) => {
    const { user, room } = await memberRoom(ctx, roomId);
    return await Retro.addSticky(ctx, room, user, args);
  },
});

export const updateSticky = mutation({
  args: {
    stickyId: v.id("retroStickies"),
    text: v.optional(v.string()),
    gif: v.optional(v.union(gifValidator, v.null())),
    columnId: v.optional(v.string()),
  },
  handler: async (ctx, { stickyId, ...patch }) => {
    const { membership, room, sticky } = await memberSticky(ctx, stickyId);
    await Retro.updateSticky(ctx, room, membership, sticky, patch);
  },
});

export const moveStickies = mutation({
  args: {
    roomId: v.id("rooms"),
    moves: v.array(v.object({ stickyId: v.id("retroStickies"), position: positionValidator })),
  },
  handler: async (ctx, args) => {
    const { room } = await memberRoom(ctx, args.roomId);
    await Retro.moveStickies(ctx, room, args.moves);
  },
});

/** The author's browser says how tall it draws their stickies; kept for the reveal, never sent back. */
export const measureStickies = mutation({
  args: {
    roomId: v.id("rooms"),
    heights: v.array(v.object({ stickyId: v.id("retroStickies"), height: v.number() })),
  },
  handler: async (ctx, args) => {
    const { user, room } = await memberRoom(ctx, args.roomId);
    await Retro.measureStickies(ctx, room, user, args.heights);
  },
});

export const deleteSticky = mutation({
  args: { stickyId: v.id("retroStickies") },
  handler: async (ctx, args) => {
    const { membership, room, sticky } = await memberSticky(ctx, args.stickyId);
    await Retro.deleteSticky(ctx, room, membership, sticky);
  },
});

export const stackSticky = mutation({
  args: { stickyId: v.id("retroStickies"), ontoId: v.id("retroStickies") },
  handler: async (ctx, args) => {
    const { user, room, sticky } = await memberSticky(ctx, args.stickyId);
    await Retro.stackSticky(ctx, room, user, sticky, args.ontoId);
  },
});

export const unstackSticky = mutation({
  args: { stickyId: v.id("retroStickies"), position: positionValidator },
  handler: async (ctx, args) => {
    const { room, sticky } = await memberSticky(ctx, args.stickyId);
    await Retro.unstackSticky(ctx, room, sticky, args.position);
  },
});

export const toggleVote = mutation({
  args: { stickyId: v.id("retroStickies") },
  handler: async (ctx, args) => {
    const { user, room, sticky } = await memberSticky(ctx, args.stickyId);
    await Retro.toggleVote(ctx, room, user, sticky);
  },
});

// --- Action items ---------------------------------------------------------------

export const actionItems = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Retro.getActionItems(ctx, args.roomId);
  },
});

export const addActionItem = mutation({
  args: { roomId: v.id("rooms"), text: v.string(), ownerId: v.optional(v.id("users")) },
  handler: async (ctx, { roomId, ...args }) => {
    const { room } = await requireCan(ctx, roomId, { kind: "category", category: "actionManagement" });
    return await Retro.addActionItem(ctx, room, args);
  },
});

export const updateActionItem = mutation({
  args: {
    itemId: v.id("retroActionItems"),
    text: v.optional(v.string()),
    done: v.optional(v.boolean()),
    ownerId: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (ctx, { itemId, ...patch }) => {
    const item = await ctx.db.get(itemId);
    if (!item) throw refusal("missing", "That action item is gone.");
    const { room } = await requireCan(ctx, item.roomId, { kind: "category", category: "actionManagement" });
    await Retro.updateActionItem(ctx, room, item, patch);
  },
});

export const deleteActionItem = mutation({
  args: { itemId: v.id("retroActionItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return;
    const { room } = await requireCan(ctx, item.roomId, { kind: "category", category: "actionManagement" });
    await Retro.deleteActionItem(ctx, room, item);
  },
});
