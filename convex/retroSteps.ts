/**
 * The retro's steps (CONTEXT.md: Step, Reveal, Discussion, Spotlight): what
 * each step allows, and what moving from one step to another does. The
 * model's refusals and the board's controls both read these, so the server
 * and the board can't disagree about a step. Pure: no IO, no Convex runtime.
 *
 * Steps are soft for writing and strict for voting (ADR-0026). In every step
 * stickies are written and moved, and a person changes, stacks and unstacks
 * their own. Before the reveal nobody touches a sticky they can't read. Votes
 * are cast only in Vote, and the discussion walks the topics only in Discuss.
 * The permission decision stays separate (ADR-0013): a step says whether an
 * act can happen now at all, a permission says whether this person may.
 */

import type { ResolvedDecision } from "./permissions";
import type { RetroColumn, RetroStep } from "./retroTemplates";
import { rootOf, type TopicSticky } from "./retroTopics";

/** Something done on the board that the step may refuse. */
export type StepAct =
  /** Change or delete a sticky someone else wrote. */
  | "editOthers"
  /** Stack stickies when either of them is someone else's. */
  | "stackOthers"
  /** Take someone else's sticky off a stack. */
  | "unstackOthers"
  | "vote"
  /** Put a topic in the spotlight. */
  | "spotlight"
  /** Move the discussion one topic on or back. */
  | "walk";

/** Why a retro act is refused: the step (`stage`) or the person's permission (`forbidden`). */
type RetroRefusalCode = "stage" | "forbidden";

export type RetroDecision =
  | { allowed: true; code?: never; message?: never }
  | { allowed: false; code: RetroRefusalCode; message: string };

const ALLOWED: RetroDecision = Object.freeze({ allowed: true });

function refuse(message: string): RetroDecision {
  return { allowed: false, code: "stage", message };
}

/** Whether the retro's step lets an act happen at all. */
export function stepAllows(step: RetroStep, act: StepAct): RetroDecision {
  switch (act) {
    case "editOthers":
      return step === "write" ? refuse("Stickies can be edited by others once they're revealed.") : ALLOWED;
    case "stackOthers":
      return step === "write" ? refuse("Stickies can be stacked once they're revealed.") : ALLOWED;
    case "unstackOthers":
      return step === "write" ? refuse("Stickies can be unstacked once they're revealed.") : ALLOWED;
    case "vote":
      return step === "vote" ? ALLOWED : refuse("Voting is closed.");
    case "spotlight":
      return step === "write" ? refuse("Reveal the stickies first.") : ALLOWED;
    case "walk":
      return step === "discuss" ? ALLOWED : refuse("The topics are walked in Discuss.");
  }
}

/**
 * Whether a sticky act can happen now: always when every sticky it touches
 * is the actor's own, otherwise only once the step allows touching others'.
 */
export function stickyActAllowed(step: RetroStep, act: "edit" | "stack" | "unstack", mine: boolean): RetroDecision {
  if (mine) return ALLOWED;
  return stepAllows(step, act === "edit" ? "editOthers" : act === "stack" ? "stackOthers" : "unstackOthers");
}

/**
 * Whether a person may change or delete a sticky: always their own; someone
 * else's once it's revealed, and only under the retro's `cardManagement`
 * permission, whose own message says who may.
 */
export function stickyEditDecision(
  step: RetroStep,
  mine: boolean,
  cardManagement: ResolvedDecision
): RetroDecision {
  const byStep = stickyActAllowed(step, "edit", mine);
  if (!byStep.allowed || mine) return byStep;
  return cardManagement.allowed ? ALLOWED : { allowed: false, code: "forbidden", message: cardManagement.message };
}

/** What moving the retro from one step to another does. */
export interface StepChange {
  to: RetroStep;
  /** The spotlight: off the board's topics, kept where it is, or on the discussion's first topic. */
  spotlight: "clear" | "keep" | "first";
  /**
   * The reveal: leaving Write turns every sticky face-up for everyone, and
   * the board makes room for the ones that turn out taller (ADR-0027).
   */
  reveal: boolean;
}

/** Moving the retro to a step, forward or back. Null when it is already there. */
export function stepChange(from: RetroStep, to: RetroStep): StepChange | null {
  if (from === to) return null;
  const spotlight =
    to === "write" || to === "vote" ? "clear" : to === "discuss" && (from === "write" || from === "vote") ? "first" : "keep";
  return { to, spotlight, reveal: from === "write" };
}

/** The retro's state with the spotlight on `topic`, or off (the optional field is dropped, not set to undefined). */
export function withSpotlight<S extends string, R extends { focusStickyId?: S }>(retro: R, topic: S | undefined): R {
  if (topic === retro.focusStickyId) return retro;
  const { focusStickyId: _dropped, ...rest } = retro;
  return (topic ? { ...rest, focusStickyId: topic } : rest) as R;
}

/**
 * The retro after a step change: at its new step, with the spotlight on the
 * topic a person picked, or off or kept as the change says. A change to the
 * discussion's first topic keeps it where it is here: naming that topic takes
 * everyone's votes, so the server puts it there.
 */
export function stepped<S extends string, R extends { step: RetroStep; focusStickyId?: S }>(
  retro: R,
  change: StepChange | null,
  picked?: S
): R {
  const next = change ? { ...retro, step: change.to } : retro;
  if (picked) return withSpotlight(next, picked);
  return change?.spotlight === "clear" ? withSpotlight(next, undefined) : next;
}

/**
 * Where putting a topic in the spotlight takes the retro: to the discussion,
 * unless it's done. Null when it is there already. The spotlight itself goes
 * on the chosen topic, whatever `spotlight` says.
 */
export function spotlightStepChange(from: RetroStep): StepChange | null {
  return stepChange(from, from === "done" ? "done" : "discuss");
}

/**
 * The order the discussion walks: every topic that got a vote, most votes
 * first. When nobody voted, every topic, column by column. Ties go to the
 * column order, then to whichever was written first.
 */
export function discussionOrder<S extends string>(
  stickies: readonly (Pick<TopicSticky<S>, "_id" | "stackId" | "createdAt"> & { columnId: string })[],
  totals: ReadonlyMap<string, number>,
  columns: readonly Pick<RetroColumn, "id">[]
): S[] {
  const columnIndex = new Map(columns.map((c, i) => [c.id, i]));
  const topics = stickies.filter((s) => rootOf(s) === s._id);
  const anyVotes = topics.some((s) => (totals.get(s._id) ?? 0) > 0);
  return topics
    .filter((s) => !anyVotes || (totals.get(s._id) ?? 0) > 0)
    .sort(
      (a, b) =>
        (totals.get(b._id) ?? 0) - (totals.get(a._id) ?? 0) ||
        (columnIndex.get(a.columnId) ?? Infinity) - (columnIndex.get(b.columnId) ?? Infinity) ||
        a.createdAt - b.createdAt
    )
    .map((s) => s._id);
}

/**
 * The topic after (or before) `current` in the discussion. An unknown or
 * missing `current` starts from the top; stepping past either end stays put.
 */
export function walk<S extends string>(
  order: readonly S[],
  current: S | undefined,
  direction: "next" | "previous"
): S | undefined {
  if (order.length === 0) return undefined;
  const index = current === undefined ? -1 : order.indexOf(current);
  if (index === -1) return order[0];
  const next = direction === "next" ? index + 1 : index - 1;
  return order[Math.min(Math.max(next, 0), order.length - 1)];
}
