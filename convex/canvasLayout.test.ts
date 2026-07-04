import { describe, it, expect } from "vitest";
import {
  computeHorizontalLayout,
  computeVotingCardRow,
  SESSION_INITIAL_POSITION,
} from "./canvasLayout";

describe("computeHorizontalLayout — session node", () => {
  it("returns the session node first (documented order guarantee)", () => {
    const layout = computeHorizontalLayout("session-current", ["p1", "p2"]);
    expect(layout[0].nodeId).toBe("session-current");
  });

  it("centers the 280-wide session node on the canvas center at the session row", () => {
    const [session] = computeHorizontalLayout("session-current", []);
    // Top-left coordinates: x = 0 - 280/2, y = session row
    expect(session.position).toEqual({ x: -140, y: -300 });
  });
});

describe("computeHorizontalLayout — player row", () => {
  // Player row y, worked by hand: session row (-300) + half session height
  // (75) + rank separation (400) − half player height (65) = 110.
  const PLAYER_ROW_Y = 110;

  it("keeps players in input order after the session node", () => {
    const layout = computeHorizontalLayout("s", ["p1", "p2", "p3"]);
    expect(layout.map((n) => n.nodeId)).toEqual(["s", "p1", "p2", "p3"]);
  });

  it("centers an odd player count: middle player sits on the canvas center", () => {
    const [, ...players] = computeHorizontalLayout("s", ["p1", "p2", "p3"]);
    // Centers at -150, 0, 150 (150 apart), each shifted left by half the
    // 80-wide player node.
    expect(players.map((p) => p.position)).toEqual([
      { x: -190, y: PLAYER_ROW_Y },
      { x: -40, y: PLAYER_ROW_Y },
      { x: 110, y: PLAYER_ROW_Y },
    ]);
  });

  it("centers an even player count symmetrically around the canvas center", () => {
    const [, ...players] = computeHorizontalLayout("s", ["p1", "p2", "p3", "p4"]);
    // Row width 3 × 150 = 450, so centers at -225, -75, 75, 225.
    expect(players.map((p) => p.position)).toEqual([
      { x: -265, y: PLAYER_ROW_Y },
      { x: -115, y: PLAYER_ROW_Y },
      { x: 35, y: PLAYER_ROW_Y },
      { x: 185, y: PLAYER_ROW_Y },
    ]);
  });

  it("places a lone player centered under the session node", () => {
    const [, player] = computeHorizontalLayout("s", ["p1"]);
    expect(player.position).toEqual({ x: -40, y: PLAYER_ROW_Y });
  });
});

describe("SESSION_INITIAL_POSITION", () => {
  it("derives to the position the server historically hand-typed", () => {
    // The retired literal was `{ x: CANVAS_CENTER.x - 140, y: SESSION_Y }` in
    // convex/model/canvas.ts — the derived value must keep matching it.
    expect(SESSION_INITIAL_POSITION).toEqual({ x: -140, y: -300 });
  });

  it("matches where computeHorizontalLayout puts the session node", () => {
    const [session] = computeHorizontalLayout("s", []);
    expect(session.position).toEqual(SESSION_INITIAL_POSITION);
  });
});

describe("computeVotingCardRow", () => {
  it("centers an odd card count: middle card sits on the canvas center", () => {
    // 3 cards, 70 apart: row width 140, so x at -70, 0, 70 on the card row.
    expect(computeVotingCardRow(3)).toEqual([
      { x: -70, y: 450 },
      { x: 0, y: 450 },
      { x: 70, y: 450 },
    ]);
  });

  it("centers an even card count symmetrically around the canvas center", () => {
    // 4 cards: row width 210, so x at -105, -35, 35, 105.
    expect(computeVotingCardRow(4)).toEqual([
      { x: -105, y: 450 },
      { x: -35, y: 450 },
      { x: 35, y: 450 },
      { x: 105, y: 450 },
    ]);
  });

  it("returns an empty row for zero cards", () => {
    expect(computeVotingCardRow(0)).toEqual([]);
  });
});
