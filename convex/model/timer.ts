import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import * as Canvas from "./canvas";
import * as Rooms from "./rooms";
import { refusal } from "./refusal";
import { NOT_THIS_CEREMONY, rulesOf } from "../ceremony";
import {
  calculateCurrentTime,
  validateTimerAction,
  type TimerAction,
  type TimerState,
} from "../timerState";

export interface UpdateTimerStateArgs {
  /** The room the timer is in, as the room-scoped step loaded it. */
  room: Doc<"rooms">;
  nodeId: string;
  action: TimerAction;
  /** Who runs the action: the caller. */
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
 * Runs a timer action on a retro's timer, the manual stopwatch: the timer's
 * rules are here and in timerState, its storage is the canvas's. A poker
 * room's timer reads the round clock (ADR-0032), so it refuses the act as the
 * other ceremony's (ADR-0031).
 */
export async function updateTimerState(ctx: MutationCtx, args: UpdateTimerStateArgs): Promise<void> {
  if (!rulesOf(args.room).stopwatch) throw refusal("missing", NOT_THIS_CEREMONY);
  const now = Date.now();
  await Canvas.updateTimer(ctx, args.room._id, args.nodeId, args.userId, (state) => {
    validateTimerAction(state, args.action);
    return transition(state, args.action, now);
  });
  // A timer action is room activity — a room driven only by its timer must not
  // read as abandoned to the sweep.
  await Rooms.updateRoomActivity(ctx, args.room);
}
