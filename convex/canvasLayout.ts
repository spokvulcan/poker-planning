/**
 * Canvas geometry — the ONE owner of the whiteboard's layout constants and
 * position math, kept at the Convex root (alongside the permission decision,
 * `summarize`, and the scales) so the server canvas model, the client canvas
 * hook, and the demo fixtures all import the same numbers and the same
 * formulas instead of re-deriving them (issue #228).
 *
 * Everything here is pure: no Convex context, no DOM. All positions are
 * top-left coordinates (React Flow format).
 */

export interface Position {
  x: number;
  y: number;
}

export interface NodePosition {
  nodeId: string;
  position: Position;
}

// --- Geometry constants ----------------------------------------------------

export const CANVAS_CENTER: Position = { x: 0, y: 0 };

/** Vertical position of the session node row. */
export const SESSION_Y = -300;

export const TIMER_POSITION: Position = { x: -500, y: -250 };
export const NOTE_POSITION: Position = { x: 400, y: -200 };
export const RESULTS_POSITION: Position = {
  x: CANVAS_CENTER.x + 400,
  y: SESSION_Y + 100,
};

/** Layout configuration for session + player node positioning. */
export const LAYOUT_CONFIG = {
  nodesep: 150, // Horizontal spacing between players
  ranksep: 400, // Vertical spacing between session and players
};

/** Node dimensions for layout calculations. */
export const NODE_DIMENSIONS = {
  session: { width: 280, height: 150 },
  player: { width: 80, height: 130 },
};

/**
 * Where the session node starts life — derived from its dimensions so it can
 * never drift from the centering math in {@link computeHorizontalLayout}.
 */
export const SESSION_INITIAL_POSITION: Position = {
  x: CANVAS_CENTER.x - NODE_DIMENSIONS.session.width / 2,
  y: SESSION_Y,
};

/** Vertical position of the voting-card row. */
export const VOTING_CARD_Y = 450;

/** Horizontal spacing between voting cards. */
export const VOTING_CARD_SPACING = 70;

// --- Layout computations -----------------------------------------------------

/**
 * Computes horizontal layout for session and player nodes.
 * Places session node centered at (0, SESSION_Y) and player nodes
 * in a horizontal row below, evenly spaced.
 *
 * Return order is a guarantee: the session node first, then the player nodes
 * in input order — consumers zip the result back to node identifiers by
 * position.
 */
export function computeHorizontalLayout(
  sessionNodeId: string,
  playerNodeIds: string[]
): NodePosition[] {
  const positions: NodePosition[] = [];

  // Session node: centered horizontally at CANVAS_CENTER.x
  positions.push({
    nodeId: sessionNodeId,
    position: { ...SESSION_INITIAL_POSITION },
  });

  // Player nodes: horizontally distributed below session
  if (playerNodeIds.length > 0) {
    const spacing = LAYOUT_CONFIG.nodesep;
    const totalWidth = (playerNodeIds.length - 1) * spacing;
    const startX = CANVAS_CENTER.x - totalWidth / 2;
    const playerY =
      SESSION_Y + NODE_DIMENSIONS.session.height / 2 + LAYOUT_CONFIG.ranksep;

    playerNodeIds.forEach((playerId, index) => {
      const centerX = startX + index * spacing;
      positions.push({
        nodeId: playerId,
        position: {
          x: centerX - NODE_DIMENSIONS.player.width / 2,
          y: playerY - NODE_DIMENSIONS.player.height / 2,
        },
      });
    });
  }

  return positions;
}

/**
 * Computes the voting-card row: one position per card, centered on the canvas
 * center at the card row, in card order.
 */
export function computeVotingCardRow(cardCount: number): Position[] {
  const totalWidth = (cardCount - 1) * VOTING_CARD_SPACING;
  const startX = CANVAS_CENTER.x - totalWidth / 2;
  return Array.from({ length: cardCount }, (_, index) => ({
    x: startX + index * VOTING_CARD_SPACING,
    y: VOTING_CARD_Y,
  }));
}
