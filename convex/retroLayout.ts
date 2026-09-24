/**
 * Retro board geometry, shared by the model (where a new board's nodes are
 * placed, and where the reveal moves stickies) and the board (where a new
 * sticky lands). Top-left coordinates, React Flow format. Pure.
 *
 * The board reads like the poker room: the retro node on top with the timer
 * beside it, the column pads in a row beneath, stickies flowing down under
 * each pad, and the action items at the end of the row.
 */

import type { Position } from "./canvasLayout";

export const STICKY_WIDTH = 220;
export const STICKY_MIN_HEIGHT = 124;
/**
 * How tall a face-down sticky is drawn, whatever it holds: a GIF or a long
 * text would make it taller, and that would say something about what it
 * says (ADR-0027).
 */
export const FACE_DOWN_HEIGHT = STICKY_MIN_HEIGHT;
const STICKY_GAP = 16;

export const PAD_WIDTH = 240;
export const PAD_HEIGHT = 88;
const PAD_GAP = 48;

export const RETRO_NODE_WIDTH = 300;
export const RETRO_NODE_POSITION: Position = { x: -RETRO_NODE_WIDTH / 2, y: -400 };
export const RETRO_TIMER_POSITION: Position = { x: -RETRO_NODE_WIDTH / 2 - 260, y: -330 };

export const ACTIONS_WIDTH = 300;
const ACTIONS_GAP = 96;

/** The canvas node id of a column's pad. */
export function padNodeId(columnId: string): string {
  return `pad-${columnId}`;
}

/** The pads' row, centred under the retro node. */
export function padPositions(count: number): Position[] {
  const total = count * PAD_WIDTH + Math.max(count - 1, 0) * PAD_GAP;
  const left = -total / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: left + i * (PAD_WIDTH + PAD_GAP),
    y: 0,
  }));
}

/** Where the action items sit: at the end of the pads' row. */
export function actionsPosition(columnCount: number): Position {
  const pads = padPositions(columnCount);
  const last = pads[pads.length - 1] ?? { x: -PAD_WIDTH / 2, y: 0 };
  return { x: last.x + PAD_WIDTH + ACTIONS_GAP, y: 0 };
}

/** A pad added later goes one step right of the rightmost pad. */
export function nextPadPosition(pads: readonly Position[]): Position {
  if (pads.length === 0) return padPositions(1)[0];
  const rightmost = pads.reduce((a, b) => (b.x > a.x ? b : a));
  return { x: rightmost.x + PAD_WIDTH + PAD_GAP, y: rightmost.y };
}

/** A box on the board: a sticky's position and its drawn height. */
export interface StickyBox {
  position: Position;
  height: number;
}

/**
 * Where a new sticky from a pad lands: centred under the pad, below the
 * lowest sticky already sitting in that column's lane (whoever put it there),
 * so a column fills downwards like a real one. While writing, someone else's
 * sticky counts at FACE_DOWN_HEIGHT, all the writer's browser knows of it;
 * if it turns out taller, the reveal makes room (settleOnReveal).
 */
export function nextStickyPosition(pad: Position, stickies: readonly StickyBox[]): Position {
  const x = pad.x + (PAD_WIDTH - STICKY_WIDTH) / 2;
  let y = pad.y + PAD_HEIGHT + STICKY_GAP * 2;
  for (const sticky of stickies) {
    // In the lane: overlapping this column by more than half a sticky.
    const inLane = Math.abs(sticky.position.x - x) < STICKY_WIDTH / 2;
    if (inLane && sticky.position.y >= pad.y) {
      y = Math.max(y, sticky.position.y + sticky.height + STICKY_GAP);
    }
  }
  return { x, y };
}

/**
 * Where the reveal moves stickies (ADR-0027). While writing, other people's
 * stickies are drawn at FACE_DOWN_HEIGHT, so a sticky can be put right under
 * one that turns out taller face-up. Going down the board, a sticky that sat
 * clear of a face-down sticky above it stays clear of it face-up, as close
 * as it was (up to the usual gap); one that overlapped it even face-down was
 * put there on purpose, and only moves along with it. Nothing moves up or
 * sideways.
 *
 * Takes the topics (loose stickies and stacks' tops) at their face-up
 * heights and returns the ones that move.
 */
export function settleOnReveal<Id extends string>(
  stickies: readonly (StickyBox & { id: Id })[]
): Map<Id, Position> {
  // Top to bottom, so a sticky that moves takes the ones under it along.
  const sorted = [...stickies].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const settled: { box: StickyBox; y: number }[] = [];
  const moves = new Map<Id, Position>();
  for (const sticky of sorted) {
    let y = sticky.position.y;
    for (const above of settled) {
      // Side by side, they can't touch.
      if (Math.abs(above.box.position.x - sticky.position.x) >= STICKY_WIDTH) continue;
      const clearance = sticky.position.y - (above.box.position.y + FACE_DOWN_HEIGHT);
      const moved = above.y - above.box.position.y;
      y = Math.max(
        y,
        clearance >= 0 ? above.y + above.box.height + Math.min(clearance, STICKY_GAP) : sticky.position.y + moved
      );
    }
    settled.push({ box: sticky, y });
    if (y !== sticky.position.y) moves.set(sticky.id, { x: sticky.position.x, y });
  }
  return moves;
}
