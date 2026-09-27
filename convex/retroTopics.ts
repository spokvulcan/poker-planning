/**
 * The retro's topics (CONTEXT.md: Topic, Stack, Vote, Spotlight): what a
 * topic is, and what each act on the board does to the stickies, the votes
 * and the spotlight. The model's writes and the board's optimistic updates
 * both apply these, so the two can't drift. Pure: no IO, no Convex runtime.
 *
 * A topic is a loose sticky or a whole stack, named by its root: the sticky
 * on top. Every act that changes topics says where each touched topic ends
 * up (`TopicChange.topics`), and votes and the spotlight follow by one rule
 * each (ADR-0028): a vote is filed under its topic's root and moves with it;
 * a person left with two votes on one topic keeps one and gets the other back;
 * a topic that leaves the board takes its votes back to their voters, and the
 * spotlight off it. Unstacking a sticky leaves the votes with the stack.
 */

import type { Position } from "./canvasLayout";

/** The fields of a sticky the topic rules read. */
export interface TopicSticky<S extends string = string> {
  _id: S;
  /** The root this sticky is stacked under; stacks are one level deep. */
  stackId?: S;
  createdAt: number;
  position: Position;
}

/** A vote as the topic rules see it. */
export interface TopicVote<S extends string = string, V extends string = string> {
  _id: V;
  /** The sticky it is filed under: its topic's root once the rules have touched it. */
  stickyId: S;
  voterId: string;
}

/** The topic a sticky belongs to: the sticky itself when loose, or the stack's root. */
export function rootOf<S extends string>(sticky: { _id: S; stackId?: S }): S {
  return sticky.stackId ?? sticky._id;
}

/** Who tops a stack once its top is gone: the oldest sticky left in it. */
export function heirOf<T extends { createdAt: number }>(members: readonly T[]): T | undefined {
  let heir: T | undefined;
  for (const member of members) if (!heir || member.createdAt < heir.createdAt) heir = member;
  return heir;
}

/** The stickies stacked under a root, oldest first. */
function membersOf<T extends TopicSticky>(stickies: readonly T[], root: string): T[] {
  return stickies.filter((s) => s.stackId === root).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * What an act does to the board's topics. The act's own writes are
 * `stickies` and `removed`; `topics` says where each topic it touched ends
 * up, which is all the votes and the spotlight need to follow.
 */
export interface TopicChange<S extends string = string> {
  /** Stickies that join or leave a stack, or move. `stackId: null` takes one off its stack. */
  stickies: ReadonlyMap<S, { stackId?: S | null; position?: Position }>;
  /** Stickies taken off the board. */
  removed: ReadonlySet<S>;
  /** Topics now under another root (merged, or handed to an heir), or off the board (`null`). */
  topics: ReadonlyMap<S, S | null>;
}

/** A sticky as a change leaves it: joined to a stack, taken off one or left, and moved where the change says. */
export function patched<S extends string, T extends TopicSticky<S>>(sticky: T, change: TopicChange<S>): T {
  const patch = change.stickies.get(sticky._id);
  if (!patch) return sticky;
  const { stackId: current, ...rest } = sticky;
  const stackId = patch.stackId === undefined ? current : (patch.stackId ?? undefined);
  return { ...rest, ...(stackId ? { stackId } : {}), ...(patch.position ? { position: patch.position } : {}) } as T;
}

function indexOf<T extends TopicSticky>(stickies: readonly T[]): Map<string, T> {
  return new Map(stickies.map((s) => [s._id, s]));
}

/**
 * Dropping a sticky on another. A stack's root brings its whole stack along;
 * a sticky from inside a stack moves on its own. Either way it lands in the
 * other sticky's topic, under that topic's root: stacks stay one level deep.
 * Null when both are already one topic, or either is gone.
 *
 * `stickies` must hold both stickies, the other one's root, and the dragged
 * one's stack when it is a root.
 */
export function stack<S extends string>(
  stickies: readonly TopicSticky<S>[],
  stickyId: S,
  ontoId: S
): TopicChange<S> | null {
  const byId = indexOf(stickies);
  const sticky = byId.get(stickyId);
  const onto = byId.get(ontoId);
  if (!sticky || !onto) return null;
  const target = rootOf(onto);
  if (target === stickyId || rootOf(sticky) === target) return null;

  const moves = new Map<S, { stackId: S }>([[stickyId, { stackId: target }]]);
  const topics = new Map<S, S | null>();
  if (sticky.stackId === undefined) {
    for (const member of membersOf(stickies, stickyId)) moves.set(member._id, { stackId: target });
    topics.set(stickyId, target);
  }
  return { stickies: moves, removed: new Set(), topics };
}

/**
 * Taking a sticky off its stack and putting it down at `position`. It starts
 * a topic of its own with no votes: the votes stay with the stack. Null for a
 * sticky that isn't in a stack.
 */
export function unstack<S extends string>(
  stickies: readonly TopicSticky<S>[],
  stickyId: S,
  position: Position
): TopicChange<S> | null {
  const sticky = indexOf(stickies).get(stickyId);
  if (!sticky || sticky.stackId === undefined) return null;
  return {
    stickies: new Map([[stickyId, { stackId: null, position }]]),
    removed: new Set(),
    topics: new Map(),
  };
}

/**
 * Taking a sticky off the board. A stack keeps its other stickies: the
 * oldest becomes its root, in the old root's place, and the topic goes to it.
 * A loose sticky's topic leaves the board with it.
 *
 * `stickies` must hold the sticky and, when it is a root, its stack.
 */
export function remove<S extends string>(stickies: readonly TopicSticky<S>[], stickyId: S): TopicChange<S> {
  const sticky = indexOf(stickies).get(stickyId);
  const removed = new Set<S>([stickyId]);
  if (!sticky || sticky.stackId !== undefined) {
    return { stickies: new Map(), removed, topics: new Map() };
  }
  const members = membersOf(stickies, stickyId);
  const heir = heirOf(members);
  if (!heir) {
    return { stickies: new Map(), removed, topics: new Map([[stickyId, null]]) };
  }
  const moves = new Map<S, { stackId?: S | null; position?: Position }>([
    [heir._id, { stackId: null, position: sticky.position }],
  ]);
  for (const member of members) if (member._id !== heir._id) moves.set(member._id, { stackId: heir._id });
  return { stickies: moves, removed, topics: new Map([[stickyId, heir._id]]) };
}

/** Where a topic ends up after a change: itself, another root, or off the board (`null`). */
function followTopic<S extends string>(topic: S, change: TopicChange<S>): S | null {
  return change.topics.has(topic) ? change.topics.get(topic)! : topic;
}

/** The spotlight after a change: it follows its topic, and goes off when the topic does. */
export function followSpotlight<S extends string>(spotlight: S | undefined, change: TopicChange<S>): S | undefined {
  return spotlight === undefined ? undefined : (followTopic(spotlight, change) ?? undefined);
}

/**
 * Where votes go after a change: each follows its topic and is filed under
 * the topic's root; a vote whose topic left the board goes back to its voter;
 * a voter left with two votes on one topic keeps one and gets the rest back.
 *
 * `votes` are the votes on every sticky of the topics the change touched,
 * `topicOf` names each vote's topic before the change. A vote already filed
 * under its topic's root stays put rather than being refiled.
 */
export function followVotes<S extends string, V extends string>(
  votes: readonly TopicVote<S, V>[],
  topicOf: (vote: TopicVote<S, V>) => S,
  change: TopicChange<S>
): { refile: Map<V, S>; refund: Set<V> } {
  const destination = new Map<V, S | null>(votes.map((vote) => [vote._id, followTopic(topicOf(vote), change)]));
  // Settle the votes already in place first, so a duplicate refunds the one that would have moved.
  const ordered = [...votes].sort(
    (a, b) => Number(destination.get(b._id) === b.stickyId) - Number(destination.get(a._id) === a.stickyId)
  );
  const kept = new Set<string>();
  const refile = new Map<V, S>();
  const refund = new Set<V>();
  for (const vote of ordered) {
    const topic = destination.get(vote._id);
    if (topic === null || topic === undefined) {
      refund.add(vote._id);
      continue;
    }
    const key = `${vote.voterId}\u0000${topic}`;
    if (kept.has(key)) {
      refund.add(vote._id);
      continue;
    }
    kept.add(key);
    if (vote.stickyId !== topic) refile.set(vote._id, topic);
  }
  return { refile, refund };
}

/**
 * Votes per topic: the voters for each topic, counted once each, whichever
 * sticky of the topic their vote is filed under.
 */
export function voteTotals<S extends string>(
  stickies: readonly Pick<TopicSticky<S>, "_id" | "stackId">[],
  votes: readonly Pick<TopicVote<S>, "stickyId" | "voterId">[]
): Map<S, number> {
  const rootById = new Map<string, S>(stickies.map((s) => [s._id, rootOf(s)]));
  const counted = new Set<string>();
  const totals = new Map<S, number>();
  for (const vote of votes) {
    const root = rootById.get(vote.stickyId);
    if (root === undefined) continue;
    const key = `${vote.voterId}\u0000${root}`;
    if (counted.has(key)) continue;
    counted.add(key);
    totals.set(root, (totals.get(root) ?? 0) + 1);
  }
  return totals;
}

const OUT_OF_VOTES = "You're out of votes. Take one back to vote again.";

/** What a click on a topic's vote button does. */
export type VoteToggle<S extends string = string, V extends string = string> =
  | { kind: "cast"; stickyId: S }
  | { kind: "takeBack"; votes: V[] }
  | { kind: "refused"; code: "budget"; message: string };

/**
 * Voting for a topic, or taking the vote back: at most one vote per person
 * per topic, and no more topics than the retro's vote budget. `mine` is every
 * vote the voter has cast in the retro, each with the topic it counts for.
 */
export function toggleVote<S extends string, V extends string>(
  topic: S,
  mine: readonly { _id: V; topic: S }[],
  budget: number
): VoteToggle<S, V> {
  const onTopic = mine.filter((vote) => vote.topic === topic);
  if (onTopic.length > 0) return { kind: "takeBack", votes: onTopic.map((vote) => vote._id) };
  if (new Set(mine.map((vote) => vote.topic)).size >= budget) {
    return { kind: "refused", code: "budget", message: OUT_OF_VOTES };
  }
  return { kind: "cast", stickyId: topic };
}

/**
 * A guest's votes in a retro once they sign in to an account that voted
 * there too: one vote per topic, the account's own first, then the guest's
 * in the order they were cast, up to the vote budget. The rest go back.
 */
export function foldVotes<S extends string, V extends string>(
  accountVotes: readonly { _id: V; topic: S }[],
  guestVotes: readonly { _id: V; topic: S }[],
  budget: number
): { reassign: V[]; refund: V[] } {
  const topics = new Set<S>(accountVotes.map((vote) => vote.topic));
  const reassign: V[] = [];
  const refund: V[] = [];
  for (const vote of guestVotes) {
    if (topics.has(vote.topic) || topics.size >= budget) {
      refund.push(vote._id);
    } else {
      topics.add(vote.topic);
      reassign.push(vote._id);
    }
  }
  return { reassign, refund };
}

/**
 * The same rule seen from one board: the topics the viewer voted for and the
 * totals they are shown, after a change. Another person's duplicate votes
 * can't be seen from a board, so a merged total can count them twice until
 * the server's answer arrives.
 */
export function followVotesInView<S extends string>(
  view: { myTopics: ReadonlySet<S>; totals?: ReadonlyMap<S, number> },
  change: TopicChange<S>
): { myTopics: Set<S>; totals?: Map<S, number> } {
  const myTopics = new Set<S>();
  const myArrivals = new Map<S, number>();
  for (const topic of view.myTopics) {
    const after = followTopic(topic, change);
    if (after === null) continue;
    myTopics.add(after);
    myArrivals.set(after, (myArrivals.get(after) ?? 0) + 1);
  }
  if (!view.totals) return { myTopics };
  const totals = new Map<S, number>();
  for (const [topic, count] of view.totals) {
    const after = followTopic(topic, change);
    if (after === null) continue;
    totals.set(after, (totals.get(after) ?? 0) + count);
  }
  for (const [topic, arrivals] of myArrivals) {
    if (arrivals > 1) totals.set(topic, (totals.get(topic) ?? 0) - (arrivals - 1));
  }
  return { myTopics, totals };
}
