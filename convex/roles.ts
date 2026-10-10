import { mutation } from "./_generated/server";
import { v } from "convex/values";
import * as Roles from "./model/roles";
import { requireRoomWrite } from "./model/auth";
import { pokerPermissionsValidator } from "./schema";

export const promoteFacilitator = mutation({
  args: {
    roomId: v.id("rooms"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await Roles.promoteFacilitator(ctx, args);
  },
});

export const demoteFacilitator = mutation({
  args: {
    roomId: v.id("rooms"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await Roles.demoteFacilitator(ctx, args);
  },
});

export const transferOwnership = mutation({
  args: {
    roomId: v.id("rooms"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await Roles.transferOwnership(ctx, args);
  },
});

export const updatePermissions = mutation({
  args: {
    roomId: v.id("rooms"),
    permissions: pokerPermissionsValidator,
  },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "relationship", verb: "changePerms" });
    await Roles.updatePermissions(ctx, room, args.permissions);
  },
});
