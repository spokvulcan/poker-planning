import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import * as Rooms from "./rooms";
import {
  calculateCurrentTime,
  validateTimerAction,
  type TimerAction,
  type TimerState,
} from "../timerState";

export interface UpdateTimerStateArgs {
  roomId: Id<"rooms">;
  nodeId: string;
  action: TimerAction;
  userId: Id<"users">;
}

/**
 * Updates timer state based on user action
 */
export async function updateTimerState(
  ctx: MutationCtx,
  args: UpdateTimerStateArgs
): Promise<void> {
  const now = Date.now();

  // Find the timer node
  const timerNode = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", args.nodeId)
    )
    .unique();

  if (!timerNode || timerNode.type !== "timer") {
    throw new Error("Timer node not found");
  }

  // Validate the action
  validateTimerAction(timerNode.data, args.action);

  // Calculate current elapsed time before updating
  const currentState = calculateCurrentTime(timerNode.data, now);

  let newData: TimerState;

  switch (args.action) {
    case "start":
      newData = {
        ...timerNode.data,
        isRunning: true,
        startedAt: now,
        pausedAt: null,
        lastUpdatedBy: args.userId,
        lastAction: "start",
      };
      break;

    case "pause":
      newData = {
        ...timerNode.data,
        isRunning: false,
        startedAt: null,
        pausedAt: now,
        elapsedSeconds: currentState.currentSeconds,
        lastUpdatedBy: args.userId,
        lastAction: "pause",
      };
      break;

    case "reset":
      newData = {
        ...timerNode.data,
        isRunning: false,
        startedAt: null,
        pausedAt: null,
        elapsedSeconds: 0,
        lastUpdatedBy: args.userId,
        lastAction: "reset",
      };
      break;

    default:
      throw new Error(`Invalid timer action: ${args.action}`);
  }

  // Update the timer node
  await ctx.db.patch(timerNode._id, {
    data: newData,
    lastUpdatedBy: args.userId,
    lastUpdatedAt: now,
  });

  // A timer action is room activity — a room driven only by its timer must not
  // read as abandoned to the cleanup cascade.
  await Rooms.updateRoomActivity(ctx, args.roomId);
}
