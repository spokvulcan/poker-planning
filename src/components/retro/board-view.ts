/**
 * The retro as one browser sees it (the board from `retro.board`, everyone's
 * votes from `retro.votesCast`, the action items from `retro.actionItems`,
 * the state and the people on `rooms.get`), and what each write does to it.
 * The optimistic updates apply these, so the board moves the moment a person
 * acts, by the same rules the server applies a moment later: the topic and
 * step rules (convex/retroTopics.ts, convex/retroSteps.ts), the sticky
 * projection (convex/retroStickyView.ts) and the text fields' rules
 * (convex/retroTemplates.ts). A new row wears a stand-in id until the
 * server's arrives. Where a browser can't know something, such as other
 * people's duplicate votes or the discussion's first topic before the totals
 * show, it leaves that to the server's answer rather than guess. Pure.
 */
import type { Id, TableNames } from "@/convex/_generated/dataModel";
import type { ActionItemView, BoardView, Gif, RetroState, StickyView } from "@/convex/model/retro";
import { ACTION_ITEM_TEXT, STICKY_TEXT, type RetroColumn, type RetroStep } from "@/convex/retroTemplates";
import * as Topics from "@/convex/retroTopics";
import { discussionOrder, stepShows, walk, withSpotlight } from "@/convex/retroSteps";
import { stickyView, type StickyRow, type Viewer } from "@/convex/retroStickyView";

type StickyId = Id<"retroStickies">;

/** The id a row wears until the server's arrives. */
export const OPTIMISTIC_PREFIX = "optimistic:";

/** Whether an id is still the client's stand-in: nothing can be done to it yet. */
export function isOptimistic(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/** A new row's stand-in id, from a key the client made for it. */
function pendingId<T extends TableNames>(key: string): Id<T> {
  return `${OPTIMISTIC_PREFIX}${key}` as Id<T>;
}

/** Someone in the retro, as `rooms.get` lists them: how an author or an owner is named. */
export interface Member {
  _id: Id<"users">;
  name: string;
}

/** The discussion's order of topics, from the totals the board carries from Discuss on. */
export function topicOrder(board: BoardView | undefined, columns: readonly RetroColumn[]): StickyId[] {
  if (!board) return [];
  const totals = new Map(board.stickies.map((s) => [s._id as string, s.votes ?? 0]));
  return discussionOrder(board.stickies, totals, columns);
}

/** A sticky the viewer wrote, as its add sends it, and when. */
export type NewSticky = Pick<StickyRow, "clientId" | "columnId" | "position" | "text" | "gif" | "createdAt">;

/**
 * The viewer's new sticky on the board a browser sees, projected as the board
 * read will send it back (stickyView): its words as the field keeps them, no
 * votes yet, under its draft's `clientId`. Nothing when the words would be
 * refused.
 */
export function applyNewSticky(
  board: BoardView,
  sticky: NewSticky,
  by: { viewerId: Id<"users">; retro: Viewer["retro"]; members: readonly Member[] }
): BoardView {
  const text = STICKY_TEXT.check(sticky.text);
  if (!text.ok) return board;
  const view = stickyView(
    { ...sticky, _id: pendingId<"retroStickies">(sticky.clientId), authorId: by.viewerId, text: text.value },
    {
      retro: by.retro,
      viewerId: by.viewerId,
      myTopics: new Set(),
      names: new Map(by.members.map((member) => [member._id, member.name])),
      totals: new Map(),
    }
  );
  return { ...board, stickies: [...board.stickies, view] };
}

/** An edit of a sticky, as its update sends it: `gif: null` takes the GIF off. */
export interface StickyEdit {
  stickyId: StickyId;
  text?: string;
  gif?: Gif | null;
  columnId?: string;
}

/**
 * An edit of a sticky's words, GIF or column, on the board a browser sees:
 * the words as the field keeps them, and a GIF the edit leaves out kept.
 * Nothing when the words would be refused, or the sticky is gone.
 */
export function applyStickyEdit(board: BoardView, edit: StickyEdit): BoardView {
  const text = edit.text === undefined ? undefined : STICKY_TEXT.check(edit.text);
  if ((text && !text.ok) || !board.stickies.some((s) => s._id === edit.stickyId)) return board;
  return {
    ...board,
    stickies: board.stickies.map((sticky) => {
      if (sticky._id !== edit.stickyId) return sticky;
      const { gif: current, ...rest } = sticky;
      const gif = edit.gif === undefined ? current : (edit.gif ?? undefined);
      return {
        ...rest,
        ...(text?.ok ? { text: text.value } : {}),
        ...(gif ? { gif } : {}),
        ...(edit.columnId !== undefined ? { columnId: edit.columnId } : {}),
      };
    }),
  };
}

/**
 * A topic change on the board a browser sees: stickies restacked, moved or
 * removed, and the viewer's votes and, while the step shows them, the totals
 * following their topics.
 */
export function applyTopicChange(board: BoardView, change: Topics.TopicChange<StickyId>, step: RetroStep): BoardView {
  const myTopics = new Set(board.stickies.filter((s) => s.myVote).map((s) => s._id));
  const topics = board.stickies.filter((s) => !s.stackId);
  const votes = Topics.followVotesInView(
    { myTopics, ...(stepShows(step).totals ? { totals: new Map(topics.map((s) => [s._id, s.votes ?? 0])) } : {}) },
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

/** What a browser holds of the votes: its board, and everyone's count while it is in Vote. */
export interface VotesView {
  board: BoardView;
  votesCast?: number;
}

/**
 * A click on a topic's vote button, on what a browser sees: the viewer's
 * vote cast or taken back, and everyone's count with it when the browser
 * holds it; or nothing when the budget refuses it (the server says so).
 */
export function applyVoteToggle(seen: VotesView, stickyId: StickyId, budget: number): VotesView | null {
  const { board } = seen;
  const sticky = board.stickies.find((s) => s._id === stickyId);
  if (!sticky) return null;
  const topic = Topics.rootOf(sticky);
  const mine = board.stickies.filter((s) => s.myVote).map((s) => ({ _id: s._id, topic: s._id }));
  const outcome = Topics.toggleVote(topic, mine, budget);
  if (outcome.kind === "refused") return null;
  const voting = outcome.kind === "cast";
  const change = voting ? 1 : -1;
  return {
    board: {
      ...board,
      stickies: board.stickies.map((s) => (s._id === topic ? { ...s, myVote: voting } : s)),
      myVotes: board.myVotes + change,
    },
    ...(seen.votesCast !== undefined ? { votesCast: seen.votesCast + change } : {}),
  };
}

/** The discussion one topic on or back, on the state a browser sees. */
export function applyWalk(retro: RetroState, board: BoardView, direction: "next" | "previous"): RetroState {
  return withSpotlight(retro, walk(topicOrder(board, retro.columns), retro.focusStickyId, direction));
}

/** An action item as its add sends it, when, and a key the client made for it. */
export interface NewActionItem {
  text: string;
  createdAt: number;
  /** Unique among the items still pending: the item's stand-in id is made from it. */
  key: string;
}

/** An edit of an action item, as its update sends it: `ownerId: null` leaves it unowned. */
export interface ActionItemEdit {
  itemId: Id<"retroActionItems">;
  text?: string;
  done?: boolean;
  ownerId?: Id<"users"> | null;
}

/** An item's owner, named as the room lists them, the way the action items read names them. */
function ownedBy(
  ownerId: Id<"users"> | undefined,
  members: readonly Member[]
): Pick<ActionItemView, "ownerId" | "ownerName"> {
  if (!ownerId) return {};
  const name = members.find((member) => member._id === ownerId)?.name;
  return name === undefined ? { ownerId } : { ownerId, ownerName: name };
}

/**
 * A new action item at the end of the list a browser sees: its words as the
 * field keeps them, not done, under a stand-in id until the server's
 * arrives. Nothing when the words would be refused.
 */
export function applyNewActionItem(items: ActionItemView[], item: NewActionItem): ActionItemView[] {
  const text = ACTION_ITEM_TEXT.check(item.text);
  if (!text.ok) return items;
  return [
    ...items,
    {
      _id: pendingId<"retroActionItems">(item.key),
      text: text.value,
      done: false,
      carriedOver: false,
      createdAt: item.createdAt,
    },
  ];
}

/**
 * An edit of an action item on the list a browser sees: its words as the
 * field keeps them, done or not, and a new owner named, or none for
 * `ownerId: null`. Nothing when the words would be refused, or the item is gone.
 */
export function applyActionItemEdit(
  items: ActionItemView[],
  edit: ActionItemEdit,
  members: readonly Member[]
): ActionItemView[] {
  const text = edit.text === undefined ? undefined : ACTION_ITEM_TEXT.check(edit.text);
  if ((text && !text.ok) || !items.some((item) => item._id === edit.itemId)) return items;
  return items.map((item) => {
    if (item._id !== edit.itemId) return item;
    const edited = {
      ...item,
      ...(text?.ok ? { text: text.value } : {}),
      ...(edit.done !== undefined ? { done: edit.done } : {}),
    };
    if (edit.ownerId === undefined) return edited;
    const { ownerId: _ownerId, ownerName: _ownerName, ...unowned } = edited;
    return { ...unowned, ...ownedBy(edit.ownerId ?? undefined, members) };
  });
}
