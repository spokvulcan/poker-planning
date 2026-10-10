/**
 * What one viewer sees of a sticky (CONTEXT.md: Face-down, Show authors,
 * Vote): the one projection of a sticky's row for whoever is looking. The
 * board read applies it to every sticky, and the board's optimistic add to
 * the viewer's own new sticky, so a sticky lands looking as the server's
 * answer will. Pure: no IO, no Convex runtime.
 *
 * Face-down is decided from the retro's step, the room's and never the
 * viewer's (ADR-0026): while it is in Write, someone else's sticky reaches a
 * viewer as its place, column, stack and age, and none of its words, GIF or
 * author. Once revealed, a sticky carries its author's name only while the
 * retro shows authors. A topic carries the viewer's own vote, and its total
 * once the step shows totals; a stacked sticky's votes are its stack's.
 */

import type { Doc, Id } from "./_generated/dataModel";
import type { Position } from "./canvasLayout";
import type { RetroStep } from "./retroTemplates";
import { stepShows } from "./retroSteps";

type StickyId = Id<"retroStickies">;

/** The fields of a sticky's row the projection reads. */
export type StickyRow = Pick<
  Doc<"retroStickies">,
  "_id" | "clientId" | "columnId" | "position" | "stackId" | "createdAt" | "authorId" | "text" | "gif"
>;

/**
 * A sticky as one viewer may see it. Someone else's sticky is face-down
 * while the retro is in `write`: its place and colour, nothing it says.
 * The author travels only when the retro shows authors; `mine` is how the
 * author finds their own while names are hidden.
 */
export interface StickyView {
  _id: StickyId;
  clientId: string;
  columnId: string;
  position: Position;
  stackId?: StickyId;
  createdAt: number;
  mine: boolean;
  hidden: boolean;
  text?: string;
  gif?: Doc<"retroStickies">["gif"];
  authorName?: string;
  /** On a topic (a loose sticky or a stack's root): whether the viewer voted for it. */
  myVote?: boolean;
  /** On a topic, from `discuss` on: its votes, the whole stack's. */
  votes?: number;
}

/** Who is looking, at which retro, and what was read for them. */
export interface Viewer {
  /** The retro's step and show-authors setting: the room's, never the viewer's. */
  retro: { step: RetroStep; showAuthors: boolean };
  viewerId: Id<"users">;
  /** The topics the viewer voted for. */
  myTopics: ReadonlySet<StickyId>;
  /** Authors' names, needed only while `authorsShown`. */
  names: ReadonlyMap<Id<"users">, string>;
  /** Each topic's votes, needed only while the step shows totals. */
  totals: ReadonlyMap<StickyId, number>;
}

/** Whether stickies carry their authors' names: once revealed, and only while the retro shows authors. */
export function authorsShown(retro: Viewer["retro"]): boolean {
  return retro.showAuthors && !stepShows(retro.step).faceDown;
}

/** A sticky as `viewer` may see it. */
export function stickyView(sticky: StickyRow, viewer: Viewer): StickyView {
  const shows = stepShows(viewer.retro.step);
  const mine = sticky.authorId === viewer.viewerId;
  const hidden = shows.faceDown && !mine;
  const authorName = authorsShown(viewer.retro) ? viewer.names.get(sticky.authorId) : undefined;
  const isTopic = sticky.stackId === undefined;
  return {
    _id: sticky._id,
    clientId: sticky.clientId,
    columnId: sticky.columnId,
    position: sticky.position,
    ...(sticky.stackId ? { stackId: sticky.stackId } : {}),
    createdAt: sticky.createdAt,
    mine,
    hidden,
    ...(hidden
      ? {}
      : {
          text: sticky.text,
          ...(sticky.gif ? { gif: sticky.gif } : {}),
          ...(authorName !== undefined ? { authorName } : {}),
        }),
    ...(isTopic ? { myVote: viewer.myTopics.has(sticky._id) } : {}),
    ...(isTopic && shows.totals ? { votes: viewer.totals.get(sticky._id) ?? 0 } : {}),
  };
}
