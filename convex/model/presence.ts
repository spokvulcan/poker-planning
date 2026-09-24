import { Presence } from "@convex-dev/presence";
import { components } from "../_generated/api";
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Presence lives in the @convex-dev/presence component: its own tables, keyed
 * by room and user id strings, outside the app schema. Its rows stay until
 * something deletes them, so whatever deletes a room or a user deletes their
 * presence here too.
 */
export const presence = new Presence(components.presence);

/** Rooms read per listing while clearing a user's presence. */
const USER_PRESENCE_BATCH = 100;

/** Drops a room's presence: every user's row, their sessions and the room's list token. */
export async function removeRoomPresence(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  await presence.removeRoom(ctx, roomId);
}

/**
 * Drops a user's presence in every room it was ever recorded in, including
 * rooms they have since left. Each removal takes that room off the next
 * listing, so the loop ends once a listing comes back short.
 */
export async function removeUserPresence(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  for (;;) {
    const rooms = await presence.listUser(ctx, userId, false, USER_PRESENCE_BATCH);
    for (const { roomId } of rooms) {
      await presence.removeRoomUser(ctx, roomId, userId);
    }
    if (rooms.length < USER_PRESENCE_BATCH) return;
  }
}
