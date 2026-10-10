import { mutation } from "./_generated/server";
import { v } from "convex/values";
import * as Memberships from "./model/memberships";
import * as Roles from "./model/roles";
import { requireRoomWrite } from "./model/auth";
import { pokerPermissionsValidator } from "./schema";

export const promoteFacilitator = mutation({
  args: {
    roomId: v.id("rooms"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { room, target } = await requireRoomWrite(
      ctx,
      args.roomId,
      { kind: "relationship", verb: "promote" },
      args.targetUserId
    );
    await Memberships.setRole(ctx, room, target!, "facilitator");
  },
});

export const demoteFacilitator = mutation({
  args: {
    roomId: v.id("rooms"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { room, target } = await requireRoomWrite(
      ctx,
      args.roomId,
      { kind: "relationship", verb: "demote" },
      args.targetUserId
    );
    await Memberships.setRole(ctx, room, target!, "participant");
  },
});

export const transferOwnership = mutation({
  args: {
    roomId: v.id("rooms"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { room, user, target } = await requireRoomWrite(
      ctx,
      args.roomId,
      { kind: "relationship", verb: "transfer" },
      args.targetUserId
    );
    await Roles.transferOwnership(ctx, room, user, target!);
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
