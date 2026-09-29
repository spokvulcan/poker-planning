import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import * as Canvas from "./canvas";
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

/** What a timer action does to a timer's state at `now`. */
function transition(state: TimerState, action: TimerAction, now: number): TimerState {
  switch (action) {
    case "start":
      return { ...state, isRunning: true, startedAt: now, pausedAt: null, lastAction: "start" };
    case "pause":
      return {
        ...state,
        isRunning: false,
        startedAt: null,
        pausedAt: now,
        elapsedSeconds: calculateCurrentTime(state, now).currentSeconds,
        lastAction: "pause",
      };
    case "reset":
      return { ...state, isRunning: false, startedAt: null, pausedAt: null, elapsedSeconds: 0, lastAction: "reset" };
  }
}

/**
 * Runs a timer action on a canvas timer: the timer's rules are here and in
 * timerState, its storage is the canvas's.
 */
export async function updateTimerState(ctx: MutationCtx, args: UpdateTimerStateArgs): Promise<void> {
  const now = Date.now();
  await Canvas.updateTimer(ctx, args.roomId, args.nodeId, args.userId, (state) => {
    validateTimerAction(state, args.action);
    return transition(state, args.action, now);
  });
  // A timer action is room activity — a room driven only by its timer must not
  // read as abandoned to the cleanup cascade.
  await Rooms.updateRoomActivity(ctx, args.roomId);
}
