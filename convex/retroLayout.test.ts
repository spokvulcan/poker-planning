import { describe, it, expect } from "vitest";
import type { Position } from "./canvasLayout";
import {
  FACE_DOWN_HEIGHT,
  nextStickyPosition,
  PAD_HEIGHT,
  PAD_WIDTH,
  padPositions,
  settleOnReveal,
  STICKY_WIDTH,
} from "./retroLayout";

// Where stickies land on the retro board: a pad puts a new sticky under the
// lowest one below it, and the reveal moves stickies clear of the ones that
// turn out taller than their face-down size (ADR-0027).

const [pad, nextPad] = padPositions(2);
const GAP = 16;
/** A sticky with a GIF on it, face-up: about 120 px taller than face-down. */
const WITH_GIF = FACE_DOWN_HEIGHT + 120;

const box = (id: string, position: Position, height = FACE_DOWN_HEIGHT) => ({ id, position, height });
const faceDown = (position: Position) => ({ position, height: FACE_DOWN_HEIGHT });

describe("nextStickyPosition", () => {
  it("puts a pad's first sticky centred under the pad", () => {
    expect(nextStickyPosition(pad, [])).toEqual({
      x: pad.x + (PAD_WIDTH - STICKY_WIDTH) / 2,
      y: pad.y + PAD_HEIGHT + 2 * GAP,
    });
  });

  it("puts the next one under the lowest sticky below that pad, at the height it is drawn", () => {
    const first = nextStickyPosition(pad, []);
    expect(nextStickyPosition(pad, [{ position: first, height: WITH_GIF }])).toEqual({
      x: first.x,
      y: first.y + WITH_GIF + GAP,
    });
  });

  it("doesn't count stickies under another pad", () => {
    const beside = nextStickyPosition(nextPad, []);
    expect(nextStickyPosition(pad, [{ position: beside, height: WITH_GIF }])).toEqual(nextStickyPosition(pad, []));
  });
});

describe("settleOnReveal", () => {
  // Ann sticks a GIF under the pad. Bob's browser has it face-down, so his
  // pad puts his sticky under its face-down size.
  const ann = box("ann", nextStickyPosition(pad, []), WITH_GIF);
  const bobAt = nextStickyPosition(pad, [faceDown(ann.position)]);

  it("moves a sticky put under a face-down one to where the pad would have put it, had it known", () => {
    const moves = settleOnReveal([ann, box("bob", bobAt)]);

    expect(moves).toEqual(new Map([["bob", nextStickyPosition(pad, [ann])]]));
    expect(moves.get("bob")!.y).toBeGreaterThan(ann.position.y + ann.height);
  });

  it("takes the stickies under it along, each clear of the one above", () => {
    // Cy's pad put his under Bob's, both face-down to him. Bob's is tall too.
    const cyAt = nextStickyPosition(pad, [faceDown(ann.position), faceDown(bobAt)]);

    const moves = settleOnReveal([box("cy", cyAt), box("bob", bobAt, WITH_GIF), ann]);

    const bob = moves.get("bob")!;
    expect(bob).toEqual({ x: bobAt.x, y: ann.position.y + WITH_GIF + GAP });
    expect(moves.get("cy")).toEqual({ x: cyAt.x, y: bob.y + WITH_GIF + GAP });
  });

  it("moves nothing when no sticky is taller than face-down", () => {
    expect(settleOnReveal([box("ann", ann.position), box("bob", bobAt)]).size).toBe(0);
  });

  it("leaves a sticky alone when the taller one above doesn't reach it", () => {
    const farBelow = { x: bobAt.x, y: ann.position.y + WITH_GIF + GAP + 50 };
    expect(settleOnReveal([ann, box("bob", farBelow)]).size).toBe(0);
  });

  it("keeps a sticky that sat closer than the usual gap just as close", () => {
    const tight = { x: bobAt.x, y: ann.position.y + FACE_DOWN_HEIGHT + 4 };
    expect(settleOnReveal([ann, box("bob", tight)]).get("bob")).toEqual({
      x: tight.x,
      y: ann.position.y + WITH_GIF + 4,
    });
  });

  it("moves a sticky put across a face-down one along with it, not off it", () => {
    // Cy dropped his half over Bob's face-down sticky, which he could see.
    const cyAt = { x: bobAt.x + 40, y: bobAt.y + 60 };

    const moves = settleOnReveal([ann, box("bob", bobAt), box("cy", cyAt)]);

    const shift = moves.get("bob")!.y - bobAt.y;
    expect(shift).toBe(WITH_GIF - FACE_DOWN_HEIGHT);
    expect(moves.get("cy")).toEqual({ x: cyAt.x, y: cyAt.y + shift });
  });

  it("leaves the stickies under another pad alone", () => {
    const beside = box("dee", { x: nextStickyPosition(nextPad, []).x, y: bobAt.y });
    expect(settleOnReveal([ann, box("bob", bobAt), beside]).has("dee")).toBe(false);
  });
});
