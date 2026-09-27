/**
 * The retro as one browser sees it (the board from `retro.board`, the state
 * on `rooms.get`), and what the topic and step rules do to it. The optimistic
 * updates apply these, so the board moves the moment a person acts, by the
 * same rules the server applies a moment later (convex/retroTopics.ts,
 * convex/retroSteps.ts). Where a browser can't know something, such as other
 * people's duplicate votes or the discussion's first topic before the totals
 * show, it leaves that to the server's answer rather than guess. Pure.
 */
import type { Id } from "@/convex/_generated/dataModel";
import type { BoardView, RetroState, StickyView } from "@/convex/model/retro";
import type { RetroColumn } from "@/convex/retroTemplates";
import * as Topics from "@/convex/retroTopics";
import { discussionOrder, walk, withSpotlight } from "@/convex/retroSteps";

type StickyId = Id<"retroStickies">;

/** The discussion's order of topics, from the totals the board carries from Discuss on. */
export function topicOrder(board: BoardView | undefined, columns: readonly RetroColumn[]): StickyId[] {
  if (!board) return [];
  const totals = new Map(board.stickies.map((s) => [s._id as string, s.votes ?? 0]));
  return discussionOrder(board.stickies, totals, columns);
}

/**
 * A topic change on the board a browser sees: stickies restacked, moved or
 * removed, and the viewer's votes and the totals following their topics.
 */
export function applyTopicChange(board: BoardView, change: Topics.TopicChange<StickyId>): BoardView {
  const myTopics = new Set(board.stickies.filter((s) => s.myVote).map((s) => s._id));
  const shown = board.stickies.filter((s) => s.votes !== undefined);
  const votes = Topics.followVotesInView(
    { myTopics, ...(shown.length > 0 ? { totals: new Map(shown.map((s) => [s._id, s.votes!])) } : {}) },
    change
  );
  const stickies = board.stickies
    .filter((sticky) => !change.removed.has(sticky._id))
    .map((sticky): StickyView => {
      const { myVote: _myVote, votes: _votes, ...moved } = Topics.patched(sticky, change);
      if (moved.stackId) return moved;
      // Only a topic carries its votes.
      return {
        ...moved,
        myVote: votes.myTopics.has(sticky._id),
        ...(votes.totals ? { votes: votes.totals.get(sticky._id) ?? 0 } : {}),
      };
    });
  return { ...board, stickies, myVotes: votes.myTopics.size };
}

/**
 * A click on a topic's vote button, on the board a browser sees: the vote
 * cast or taken back, or nothing when the budget refuses it (the server says
 * so). `cast` is the change to everyone's count.
 */
export function applyVoteToggle(
  board: BoardView,
  stickyId: StickyId,
  budget: number
): { board: BoardView; cast: number } | null {
  const sticky = board.stickies.find((s) => s._id === stickyId);
  if (!sticky) return null;
  const topic = Topics.rootOf(sticky);
  const mine = board.stickies.filter((s) => s.myVote).map((s) => ({ _id: s._id, topic: s._id }));
  const outcome = Topics.toggleVote(topic, mine, budget);
  if (outcome.kind === "refused") return null;
  const voting = outcome.kind === "cast";
  return {
    board: {
      ...board,
      stickies: board.stickies.map((s) => (s._id === topic ? { ...s, myVote: voting } : s)),
      myVotes: board.myVotes + (voting ? 1 : -1),
    },
    cast: voting ? 1 : -1,
  };
}

/** The discussion one topic on or back, on the state a browser sees. */
export function applyWalk(retro: RetroState, board: BoardView, direction: "next" | "previous"): RetroState {
  return withSpotlight(retro, walk(topicOrder(board, retro.columns), retro.focusStickyId, direction));
}
