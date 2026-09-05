import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import * as Retro from "./model/retro";
import { visibilityValidator } from "./schema";
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
    formatName: v.string(),
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
 * The board's structure (spec §9): the retros row — format, stages, the
 * shared pointer, `collectUntil`. Room access, not attendance (ADR-0009).
 */
export const board = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Retro.getBoard(ctx, args.roomId);
  },
});

// --- Stages (ADR-0010, spec §7) ---

/** Move the shared pointer to any entry, forward or back (`stageFlow`). */
export const advance = mutation({
  args: { roomId: v.id("rooms"), toStageId: v.string() },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "stageFlow" });
    await Retro.advance(ctx, args);
  },
});

/** The in-place reveal toggle on the current entry (`stageFlow`, ADR-0015). */
export const setCardsVisible = mutation({
  args: { roomId: v.id("rooms"), stageId: v.string(), value: visibilityValidator },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "stageFlow" });
    await Retro.setCardsVisible(ctx, args);
  },
});

/** The current entry's advisory timebox, in whole minutes; omit to clear (`stageFlow`). */
export const setTimebox = mutation({
  args: { roomId: v.id("rooms"), stageId: v.string(), minutes: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "stageFlow" });
    await Retro.setTimebox(ctx, args);
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
