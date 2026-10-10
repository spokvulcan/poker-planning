import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import * as Rooms from "./rooms";
import { refusal, requireValid } from "./refusal";
import { rulesOf, ceremonyOf, NOT_THIS_CEREMONY } from "../ceremony";
import { DISCUSSION_NOTE } from "../constants";
import {
  computeHorizontalLayout,
  NOTE_POSITION,
  RESULTS_POSITION,
  SESSION_INITIAL_POSITION,
  TIMER_POSITION,
  type Position,
} from "../canvasLayout";
import {
  actionsPosition,
  nextPadPosition,
  padNodeId,
  padPositions,
  RETRO_NODE_POSITION,
  RETRO_TIMER_POSITION,
} from "../retroLayout";
import { IDLE_TIMER, type TimerState } from "../timerState";
import type { UserRows } from "./userRows";

/**
 * The room canvas: every node on a room's whiteboard, and the one module that
 * reads and writes `canvasNodes`. Other modules say what happened (a member
 * joined, a round was revealed, a column was added, an issue went) and this
 * module decides what that does to the board. Node ids and each node type's
 * stored data stay in here: the schema keeps `data` as `v.any()`, so the
 * typed contract below is this module's, and no other module casts it.
 */

/**
 * The stored `data` of each node type, and the read-side contract of
 * {@link getCanvasNodes}: callers narrow `data` by `type`.
 */
export type CanvasNodeData =
  | { type: "player"; data: { userId: Id<"users"> } }
  | { type: "timer"; data: TimerState }
  | {
      type: "note";
      data: {
        issueId: Id<"issues">;
        issueTitle: string;
        content: string;
        lastUpdatedBy?: string; // a display name, not an Id
        lastUpdatedAt?: number;
      };
    }
  // session / results / story carry no stored payload
  | { type: "session"; data: Record<string, never> }
  | { type: "results"; data: Record<string, never> }
  | { type: "story"; data: Record<string, never> }
  // Retro boards: the retro node, a column's pad, the action items
  | { type: "retro"; data: Record<string, never> }
  | { type: "pad"; data: { columnId: string } }
  | { type: "actions"; data: Record<string, never> };

export type CanvasNode = {
  roomId: Id<"rooms">;
  nodeId: string;
  position: Position;
  isLocked?: boolean;
  lastUpdatedBy?: Id<"users">;
  lastUpdatedAt: number;
} & CanvasNodeData;

type NodeType = CanvasNodeData["type"];
type DataOf<T extends NodeType> = Extract<CanvasNodeData, { type: T }>["data"];

/** Most nodes one drop can move. */
export const MAX_MOVES = 200;

const SESSION_NODE_ID = "session-current";
const RESULTS_NODE_ID = "results";
const TIMER_NODE_ID = "timer";

function playerNodeId(userId: Id<"users">): string {
  return `player-${userId}`;
}

function noteNodeId(issueId: Id<"issues">): string {
  return `note-${issueId}`;
}

// --- Storage --------------------------------------------------------------------

async function nodesOf(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Doc<"canvasNodes">[]> {
  return await ctx.db
    .query("canvasNodes")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
}

async function nodeById(ctx: QueryCtx, roomId: Id<"rooms">, nodeId: string): Promise<Doc<"canvasNodes"> | null> {
  return await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) => q.eq("roomId", roomId).eq("nodeId", nodeId))
    .unique();
}

async function insertNode<T extends NodeType>(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  node: { nodeId: string; type: T; position: Position; data: DataOf<T> }
): Promise<Id<"canvasNodes">> {
  return await ctx.db.insert("canvasNodes", {
    roomId,
    nodeId: node.nodeId,
    type: node.type,
    position: { ...node.position },
    data: node.data,
    lastUpdatedAt: Date.now(),
  });
}

/** A node's stored data (the `v.any()` column), typed by the type the caller expects it to be. */
function dataOf<T extends NodeType>(node: Doc<"canvasNodes">, type: T): DataOf<T> {
  if (node.type !== type) throw new Error(`Expected a ${type} node, found ${node.type}`);
  return node.data as DataOf<T>;
}

/** A spot on the board: refused when it isn't a number, and kept within the board's bounds. */
export function validPosition(position: Position): Position {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw refusal("forbidden", "That spot is off the board.");
  }
  const clamp = (n: number) => Math.min(Math.max(n, -100_000), 100_000);
  return { x: clamp(position.x), y: clamp(position.y) };
}

// --- Reads ----------------------------------------------------------------------

/** Every node of a room's canvas, typed by node type. */
export async function getCanvasNodes(ctx: QueryCtx, roomId: Id<"rooms">): Promise<CanvasNode[]> {
  // `data` is stored as `v.any()`; this module's writes keep it to the per-type contract.
  return (await nodesOf(ctx, roomId)) as CanvasNode[];
}

/** Each issue's discussion note, for the issue export. */
export async function noteContents(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Map<Id<"issues">, string>> {
  const notes = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_type", (q) => q.eq("roomId", roomId).eq("type", "note"))
    .collect();
  return new Map(
    notes.map((note) => {
      const data = dataOf(note, "note");
      return [data.issueId, data.content] as const;
    })
  );
}

// --- The board a room starts with -----------------------------------------------

/**
 * Lays out a new room's board: a poker room's timer and session node, or a
 * retro's retro node, timer, action items and one pad per column.
 */
export async function openBoard(ctx: MutationCtx, room: Doc<"rooms">): Promise<void> {
  if (ceremonyOf(room) === "poker") {
    await Promise.all([
      insertNode(ctx, room._id, { nodeId: TIMER_NODE_ID, type: "timer", position: TIMER_POSITION, data: { ...IDLE_TIMER } }),
      insertNode(ctx, room._id, { nodeId: SESSION_NODE_ID, type: "session", position: SESSION_INITIAL_POSITION, data: {} }),
    ]);
    return;
  }

  const columns = room.retro?.columns ?? [];
  const pads = padPositions(columns.length);
  await Promise.all([
    insertNode(ctx, room._id, { nodeId: "retro", type: "retro", position: RETRO_NODE_POSITION, data: {} }),
    insertNode(ctx, room._id, { nodeId: TIMER_NODE_ID, type: "timer", position: RETRO_TIMER_POSITION, data: { ...IDLE_TIMER } }),
    insertNode(ctx, room._id, { nodeId: "actions", type: "actions", position: actionsPosition(columns.length), data: {} }),
    ...columns.map((column, i) =>
      insertNode(ctx, room._id, { nodeId: padNodeId(column.id), type: "pad", position: pads[i], data: { columnId: column.id } })
    ),
  ]);
}

// --- Members --------------------------------------------------------------------

/**
 * Lays the session and player nodes out again: the session centred, the
 * players in a row beneath it. Locked nodes stay where they are.
 */
async function relayoutPlayers(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const nodes = await nodesOf(ctx, roomId);
  const session = nodes.find((n) => n.type === "session");
  if (!session) return;
  const players = nodes.filter((n) => n.type === "player");
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const now = Date.now();
  await Promise.all(
    computeHorizontalLayout(session.nodeId, players.map((n) => n.nodeId)).map(({ nodeId, position }) => {
      const node = byId.get(nodeId);
      return node && !node.isLocked
        ? ctx.db.patch("canvasNodes", node._id, { position, lastUpdatedAt: now })
        : Promise.resolve();
    })
  );
}

/** A member arrived: in a poker room they get a player node, and the row makes room. */
export async function memberJoined(ctx: MutationCtx, room: Doc<"rooms">, userId: Id<"users">): Promise<void> {
  if (!rulesOf(room).playerNodes) return;
  if (await nodeById(ctx, room._id, playerNodeId(userId))) return;
  await insertNode(ctx, room._id, { nodeId: playerNodeId(userId), type: "player", position: { x: 0, y: 0 }, data: { userId } });
  await relayoutPlayers(ctx, room._id);
}

/** A member left: their player node goes, and the row closes up. */
export async function memberLeft(ctx: MutationCtx, room: Doc<"rooms">, userId: Id<"users">): Promise<void> {
  if (!rulesOf(room).playerNodes) return;
  const node = await nodeById(ctx, room._id, playerNodeId(userId));
  if (node) await ctx.db.delete("canvasNodes", node._id);
  await relayoutPlayers(ctx, room._id);
}

// --- The voting round -----------------------------------------------------------

/** A round was revealed: the results node shows up, once. */
export async function roundRevealed(ctx: MutationCtx, room: Doc<"rooms">): Promise<void> {
  if (!rulesOf(room).votingRounds) return;
  if (await nodeById(ctx, room._id, RESULTS_NODE_ID)) return;
  await insertNode(ctx, room._id, { nodeId: RESULTS_NODE_ID, type: "results", position: RESULTS_POSITION, data: {} });
}

// --- Retro columns --------------------------------------------------------------

/** A retro column was added: its pad goes one step right of the rightmost pad. */
export async function columnAdded(ctx: MutationCtx, roomId: Id<"rooms">, columnId: string): Promise<void> {
  const pads = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_type", (q) => q.eq("roomId", roomId).eq("type", "pad"))
    .take(32);
  await insertNode(ctx, roomId, {
    nodeId: padNodeId(columnId),
    type: "pad",
    position: nextPadPosition(pads.map((p) => p.position)),
    data: { columnId },
  });
}

/** A retro column was removed: its pad goes with it. */
export async function columnRemoved(ctx: MutationCtx, roomId: Id<"rooms">, columnId: string): Promise<void> {
  const pad = await nodeById(ctx, roomId, padNodeId(columnId));
  if (pad) await ctx.db.delete("canvasNodes", pad._id);
}

// --- Moves ----------------------------------------------------------------------

/**
 * Puts nodes where a drop left them. A node deleted mid-drag, or locked, is
 * skipped: a drop never fails on the one node that went away.
 */
export async function moveNodes(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  moves: readonly { nodeId: string; position: Position }[],
  userId: Id<"users">
): Promise<void> {
  if (moves.length > MAX_MOVES) throw refusal("forbidden", "Too many things at once.");
  const now = Date.now();
  await Promise.all(
    moves.map(async (move) => {
      const node = await nodeById(ctx, room._id, move.nodeId);
      if (!node || node.isLocked) return;
      await ctx.db.patch("canvasNodes", node._id, {
        position: validPosition(move.position),
        lastUpdatedBy: userId,
        lastUpdatedAt: now,
      });
    })
  );
  await Rooms.updateRoomActivity(ctx, room);
}

// --- Discussion notes -----------------------------------------------------------

/** Opens a discussion note for one of the room's issues; asking again returns the same note. */
export async function createNote(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  issueId: Id<"issues">,
  author: Doc<"users">
): Promise<Id<"canvasNodes">> {
  if (!rulesOf(room).votingRounds) throw new Error(NOT_THIS_CEREMONY);
  const issue = await ctx.db.get("issues", issueId);
  // An issue from another room is as good as missing: its title stays there.
  if (!issue || issue.roomId !== room._id) throw new Error("Issue not found");
  const existing = await nodeById(ctx, room._id, noteNodeId(issueId));
  if (existing) return existing._id;

  const id = await insertNode(ctx, room._id, {
    nodeId: noteNodeId(issueId),
    type: "note",
    position: NOTE_POSITION,
    data: { issueId, issueTitle: issue.title, content: "", lastUpdatedBy: author.name, lastUpdatedAt: Date.now() },
  });
  await Rooms.updateRoomActivity(ctx, room);
  return id;
}

async function noteNode(ctx: QueryCtx, roomId: Id<"rooms">, nodeId: string): Promise<Doc<"canvasNodes">> {
  const node = await nodeById(ctx, roomId, nodeId);
  if (!node) throw new Error("Note node not found");
  if (node.type !== "note") throw new Error("Node is not a note");
  return node;
}

/** Rewrites a discussion note, naming its last editor. */
export async function updateNote(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  nodeId: string,
  content: string,
  editor: Doc<"users">
): Promise<void> {
  const kept = requireValid(DISCUSSION_NOTE, content);
  const node = await noteNode(ctx, room._id, nodeId);
  const now = Date.now();
  await ctx.db.patch("canvasNodes", node._id, {
    data: { ...dataOf(node, "note"), content: kept, lastUpdatedBy: editor.name, lastUpdatedAt: now },
    lastUpdatedAt: now,
  });
  await Rooms.updateRoomActivity(ctx, room);
}

/** Takes a discussion note off the board. */
export async function deleteNote(ctx: MutationCtx, room: Doc<"rooms">, nodeId: string): Promise<void> {
  const node = await noteNode(ctx, room._id, nodeId);
  await ctx.db.delete("canvasNodes", node._id);
  await Rooms.updateRoomActivity(ctx, room);
}

/** An issue went: its discussion note goes too. */
export async function issueRemoved(ctx: MutationCtx, roomId: Id<"rooms">, issueId: Id<"issues">): Promise<void> {
  const note = await nodeById(ctx, roomId, noteNodeId(issueId));
  if (note) await ctx.db.delete("canvasNodes", note._id);
}

// --- The timer ------------------------------------------------------------------

/**
 * Moves a timer node on: `next` turns its current state into the new one
 * (the timer's own rules live in timerState). Throws when the node is not a timer.
 */
export async function updateTimer(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  nodeId: string,
  userId: Id<"users">,
  next: (state: TimerState) => TimerState
): Promise<void> {
  const node = await nodeById(ctx, roomId, nodeId);
  if (!node || node.type !== "timer") throw new Error("Timer node not found");
  await ctx.db.patch("canvasNodes", node._id, {
    data: next(dataOf(node, "timer")),
    lastUpdatedBy: userId,
    lastUpdatedAt: Date.now(),
  });
}

// --- Accounts -------------------------------------------------------------------

/**
 * A guest's seat in a room became the account's (model/memberships.ts, as a
 * guest signs in): the guest's player node becomes the account's, or goes
 * when the account has one in that room already.
 */
export async function seatFolded(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  from: Id<"users">,
  into: Id<"users">
): Promise<void> {
  const guestNode = await nodeById(ctx, roomId, playerNodeId(from));
  if (!guestNode) return;
  if (await nodeById(ctx, roomId, playerNodeId(into))) {
    await ctx.db.delete("canvasNodes", guestNode._id);
    await relayoutPlayers(ctx, roomId);
  } else {
    await ctx.db.patch("canvasNodes", guestNode._id, { nodeId: playerNodeId(into), data: { userId: into } });
  }
}

/** The nodes a person moved or ran last, found by the canvas's own index. */
async function nodesLastUpdatedBy(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"canvasNodes">[]> {
  return await ctx.db
    .query("canvasNodes")
    .withIndex("by_last_updated_by", (q) => q.eq("lastUpdatedBy", userId))
    .collect();
}

/**
 * What the canvas keeps about a person: their player nodes, and who last
 * touched a node. Player nodes follow the person's seats, which the
 * memberships module walks room by room (memberLeft, seatFolded); the rest
 * the canvas finds itself, so it can run anywhere in the lifecycle's order.
 */
export const canvasUserRows: UserRows = {
  fields: ["canvasNodes.lastUpdatedBy", "canvasNodes.data"],

  async forget(ctx, userId) {
    await Promise.all(
      (await nodesLastUpdatedBy(ctx, userId)).map((node) =>
        ctx.db.patch("canvasNodes", node._id, { lastUpdatedBy: undefined })
      )
    );
  },

  async fold(ctx, from, into) {
    await Promise.all(
      (await nodesLastUpdatedBy(ctx, from)).map((node) =>
        ctx.db.patch("canvasNodes", node._id, { lastUpdatedBy: into })
      )
    );
  },
};
