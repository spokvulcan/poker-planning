/**
 * The retro's steps (CONTEXT.md: Step, Reveal, Discussion, Spotlight): what
 * each step allows, what it shows, and what moving from one step to another
 * does. The model's refusals, the board read and the board itself all read
 * these, so the server and the board can't disagree about a step. Pure: no
 * IO, no Convex runtime.
 *
 * Steps are soft for writing and strict for voting (ADR-0026). In every step
 * stickies are written and moved, and a person changes, stacks and unstacks
 * their own. Before the reveal nobody touches a sticky they can't read. Votes
 * are cast only in Vote, and the discussion walks the topics only in Discuss.
 * Other people's stickies are face-down only in Write; the totals show from
 * Discuss on, and the spotlight only in Discuss.
 * The permission decision stays separate (ADR-0013): a step says whether an
 * act can happen now at all, a permission says whether this person may.
 */

import type { ResolvedDecision } from "./permissions";
import type { RetroColumn, RetroStep } from "./retroTemplates";
import { followSpotlight, grouped, rootOf, type TopicChange, type TopicSticky } from "./retroTopics";

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
      if (step === "write") return refuse("Reveal the stickies first.");
      return step === "done" ? refuse("The retro is complete. Go back to Discuss to discuss a topic.") : ALLOWED;
    case "walk":
      return step === "discuss" ? ALLOWED : refuse("The topics are walked in Discuss.");
  }
}

/** What a step shows, the same to everyone: read from the room's step, never the viewer's. */
export interface StepShows {
  /** Someone else's sticky reaches a viewer face-down: its place and colour, nothing it says. */
  faceDown: boolean;
  /** Each topic's vote total, and so the discussion's order. */
  totals: boolean;
  /** The topic in the spotlight is drawn there, the others dimmed, and everyone's view follows it. */
  spotlight: boolean;
}

const SHOWS: Record<RetroStep, StepShows> = {
  write: Object.freeze({ faceDown: true, totals: false, spotlight: false }),
  vote: Object.freeze({ faceDown: false, totals: false, spotlight: false }),
  discuss: Object.freeze({ faceDown: false, totals: true, spotlight: true }),
  done: Object.freeze({ faceDown: false, totals: true, spotlight: false }),
};

/** What the retro's step shows: on everyone's board, and in the board read. */
export function stepShows(step: RetroStep): StepShows {
  return SHOWS[step];
}

/** An act on the board's topics: a drop of one sticky on another, or one sticky taken off its stack. */
export type TopicAct<S extends string = string> =
  | { kind: "stack"; stickyId: S; ontoId: S }
  | { kind: "unstack"; stickyId: S };

/**
 * Whether a topic act can happen now: always when every sticky it touches is
 * the actor's own, otherwise only once the step allows touching others'.
 * Which stickies an act touches is decided here, not by the caller: an
 * unstack touches the one sticky it takes off, and a drop every sticky it
 * groups (`grouped`): the dragged one, the stack a root brings along and the
 * whole topic it joins, so nobody groups what they cannot read. `stickies`
 * must hold the topics the act touches whole, as the act itself needs them,
 * and `isMine` says whether a sticky is the actor's.
 */
export function topicActAllowed<S extends string, T extends TopicSticky<S>>(
  step: RetroStep,
  act: TopicAct<S>,
  stickies: readonly T[],
  isMine: (sticky: T) => boolean
): RetroDecision {
  const touched =
    act.kind === "stack"
      ? grouped(stickies, act.stickyId, act.ontoId)
      : stickies.filter((sticky) => sticky._id === act.stickyId);
  if (touched.every(isMine)) return ALLOWED;
  return stepAllows(step, act.kind === "stack" ? "stackOthers" : "unstackOthers");
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
  if (mine) return ALLOWED;
  const byStep = stepAllows(step, "editOthers");
  if (!byStep.allowed) return byStep;
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

/**
 * Moving the retro to a step, forward or back. Null when it is already there.
 * Write and Vote start with the spotlight off, and the discussion on its
 * first topic. Finishing leaves the spotlight where the walk was, undrawn, so
 * going back from Done to Discuss resumes the walk there.
 */
export function stepChange(from: RetroStep, to: RetroStep): StepChange | null {
  if (from === to) return null;
  const spotlight =
    to === "write" || to === "vote" ? "clear" : to === "discuss" && from !== "done" ? "first" : "keep";
  return { to, spotlight, reveal: from === "write" };
}

/**
 * Where the discussion is, held on the retro: the topic in the spotlight and,
 * while a person has put a topic off the discussion's order there (one nobody
 * voted for), the topic the walk left for it.
 */
export interface DiscussionState<S extends string = string> {
  focusStickyId?: S;
  walkStickyId?: S;
}

/** The retro with its spotlight and the place a detour left as given: optional fields dropped, not set to undefined. */
function withDiscussion<S extends string, R extends DiscussionState<S>>(
  retro: R,
  spotlight: S | undefined,
  walkStickyId: S | undefined
): R {
  if (spotlight === retro.focusStickyId && walkStickyId === retro.walkStickyId) return retro;
  const { focusStickyId: _spotlight, walkStickyId: _walk, ...rest } = retro;
  return {
    ...rest,
    ...(spotlight ? { focusStickyId: spotlight } : {}),
    ...(walkStickyId ? { walkStickyId } : {}),
  } as R;
}

/**
 * Where the walk stands along `order`, by index: `spotlight` is the
 * spotlight's place on the order (-1 off it, or with none), and `walk` the
 * place the walk stands on: the spotlight's, else the one a detour left, else -1.
 */
function standing<S extends string>(order: readonly S[], at: DiscussionState<S>): { spotlight: number; walk: number } {
  const spotlight = at.focusStickyId === undefined ? -1 : order.indexOf(at.focusStickyId);
  const walk = spotlight !== -1 || at.walkStickyId === undefined ? spotlight : order.indexOf(at.walkStickyId);
  return { spotlight, walk };
}

/**
 * The retro with `topic` in the spotlight, or none. On the discussion's
 * `order`, and whenever no order is given, the walk stands where the
 * spotlight is. A topic off the order is a detour: the walk keeps the place
 * it left, so Next carries on from there and Previous goes back to it.
 */
export function withSpotlight<S extends string, R extends DiscussionState<S>>(
  retro: R,
  topic: S | undefined,
  order?: readonly S[]
): R {
  const detour = topic !== undefined && order !== undefined && !order.includes(topic);
  const left = detour ? standing(order, retro).walk : -1;
  return withDiscussion(retro, topic, left === -1 ? undefined : order![left]);
}

/**
 * The discussion after a topic change (retroTopics): the spotlight and the
 * place a detour left follow their topics, and go when their topic leaves
 * the board.
 */
export function followDiscussion<S extends string, R extends DiscussionState<S>>(retro: R, change: TopicChange<S>): R {
  return withDiscussion(retro, followSpotlight(retro.focusStickyId, change), followSpotlight(retro.walkStickyId, change));
}

/**
 * The retro after a step change: at its new step, with the spotlight on the
 * topic a person picked (placed against the discussion's `order`, when the
 * caller knows it), or off or kept as the change says. A change to the
 * discussion's first topic keeps it where it is here: naming that topic
 * takes everyone's votes, so the server puts it there.
 */
export function stepped<S extends string, R extends { step: RetroStep } & DiscussionState<S>>(
  retro: R,
  change: StepChange | null,
  picked?: S,
  order?: readonly S[]
): R {
  const next = change ? { ...retro, step: change.to } : retro;
  if (picked) return withSpotlight(next, picked, order);
  return change?.spotlight === "clear" ? withSpotlight(next, undefined) : next;
}

/**
 * Where putting a topic in the spotlight takes the retro: nowhere when its
 * step draws the spotlight (Discuss), otherwise to the discussion. The
 * spotlight itself goes on the chosen topic, whatever `spotlight` says.
 */
export function spotlightStepChange(from: RetroStep): StepChange | null {
  return stepShows(from).spotlight ? null : stepChange(from, "discuss");
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
 * The topic after (or before) where the walk stands in the discussion's
 * `order`. From a topic on the order it steps one on or back, and stays put
 * past either end. From a detour, Next carries on after the place the walk
 * left and Previous goes back to it; with no place yet, either starts from
 * the top. Nothing on an empty order.
 */
export function walk<S extends string>(
  order: readonly S[],
  at: DiscussionState<S>,
  direction: "next" | "previous"
): S | undefined {
  if (order.length === 0) return undefined;
  const last = order.length - 1;
  const { spotlight, walk: left } = standing(order, at);
  if (spotlight !== -1) return order[direction === "next" ? Math.min(spotlight + 1, last) : Math.max(spotlight - 1, 0)];
  if (left === -1) return order[0];
  if (direction === "previous") return order[left];
  return left < last ? order[left + 1] : at.focusStickyId;
}

/**
 * The retro after the walk moves one topic on or back along `order` (`walk`):
 * the same retro when it stays put, past either end, keeping any place a
 * detour left. The server's step and the board's optimistic update both take it.
 */
export function walked<S extends string, R extends DiscussionState<S>>(
  retro: R,
  order: readonly S[],
  direction: "next" | "previous"
): R {
  const topic = walk(order, retro, direction);
  return topic === retro.focusStickyId ? retro : withSpotlight(retro, topic, order);
}

/** Where the discussion stands, as a board draws it: the walk's controls and each topic's mark read this one answer. */
export interface DiscussionPlace<S extends string = string> {
  /** Whether the order is known: the board carries the totals it is worked out from. */
  known: boolean;
  /** How many topics the order walks. */
  count: number;
  /** The spotlight: on a topic of the order, on one off it (a detour), or on nothing. */
  spotlight: "onOrder" | "detour" | "none";
  /** The topic the walk stands on, counted from 1: the spotlight's, or the one a detour left; 0 before it starts. */
  at: number;
  /** The topic Next puts in the spotlight, when it moves it. */
  next?: S;
  /** The topic Previous puts in the spotlight, when it moves it. */
  previous?: S;
  /** Nothing comes after where the walk stands: what's left is finishing the retro. */
  atEnd: boolean;
  /** A topic's number in the order, from 1, when it is on it. */
  rank(topic: S): number | undefined;
  /** Whether the discussion is past a topic: before the spotlight, the topic a detour left, or every topic once done. */
  discussed(topic: S): boolean;
}

/**
 * Where the discussion stands, from the order (null while it isn't known:
 * the board doesn't carry the totals yet) and the retro's step and
 * spotlight. What Next and Previous do is `walk`'s answer, so the board
 * offers only the moves the server makes.
 */
export function discussionAt<S extends string>(
  order: readonly S[] | null,
  retro: { step: RetroStep } & DiscussionState<S>
): DiscussionPlace<S> {
  const topics = order ?? [];
  const index = new Map(topics.map((topic, i) => [topic, i] as const));
  const { spotlight, walk: left } = standing(topics, retro);
  const at = left + 1;
  // A topic in the spotlight is being discussed; the one a detour left was.
  const passed = retro.step === "done" ? topics.length : spotlight !== -1 ? spotlight : at;
  const moves = (direction: "next" | "previous") => {
    const topic = order === null ? undefined : walk(topics, retro, direction);
    return topic === retro.focusStickyId ? undefined : topic;
  };
  const next = moves("next");
  const previous = at > 0 ? moves("previous") : undefined;
  return {
    known: order !== null,
    count: topics.length,
    spotlight: retro.focusStickyId === undefined ? "none" : spotlight !== -1 ? "onOrder" : "detour",
    at,
    ...(next !== undefined ? { next } : {}),
    ...(previous !== undefined ? { previous } : {}),
    atEnd: order !== null && next === undefined,
    rank: (topic) => {
      const i = index.get(topic);
      return i === undefined ? undefined : i + 1;
    },
    discussed: (topic) => {
      const i = index.get(topic);
      return i !== undefined && i < passed;
    },
  };
}
