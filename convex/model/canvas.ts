import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Layout constants for default positions
const CANVAS_CENTER = { x: 0, y: 0 };
const TIMER_X = -500;
const TIMER_Y = -250;
const SESSION_Y = -300;
const NOTE_X = 400;
const NOTE_Y = -200;

// Layout configuration for session + player node positioning
const LAYOUT_CONFIG = {
  nodesep: 150, // Horizontal spacing between players
  ranksep: 400, // Vertical spacing between session and players
};

// Node dimensions for layout calculations
const NODE_DIMENSIONS = {
  session: { width: 280, height: 150 },
  player: { width: 80, height: 130 },
};

export interface Position {
  x: number;
  y: number;
}

/**
 * Persisted `data` payload for each canvas node `type`. The column is stored as
 * `v.any()` in the schema (node shapes evolve independently of migrations), so
 * this discriminated union is the read-side contract asserted by
 * {@link getCanvasNodes} — it lets callers narrow `data` by `type`.
 */
export type CanvasNodeData =
  | { type: "player"; data: { userId: Id<"users"> } }
  | {
      type: "timer";
      data: {
        startedAt: number | null;
        pausedAt: number | null;
        elapsedSeconds: number;
        isRunning?: boolean;
        lastUpdatedBy: Id<"users"> | null;
        lastAction: "start" | "pause" | "reset" | null;
      };
    }
  | {
      type: "note";
      data: {
        issueId: Id<"issues">;
        issueTitle: string;
        content: string;
        lastUpdatedBy?: string;
        lastUpdatedAt?: number;
      };
    }
  // session / results / story carry no persisted payload
  | { type: "session"; data: Record<string, never> }
  | { type: "results"; data: Record<string, never> }
  | { type: "story"; data: Record<string, never> };

export type CanvasNode = {
  roomId: Id<"rooms">;
  nodeId: string;
  position: Position;
  isLocked?: boolean;
  lastUpdatedBy?: Id<"users">;
  lastUpdatedAt: number;
} & CanvasNodeData;

interface NodePosition {
  nodeId: string;
  position: Position;
}

// Maximum length for note content (10KB)
const MAX_NOTE_CONTENT_LENGTH = 10000;

/**
 * Verifies that a user belongs to a room (via membership)
 */
async function verifyUserInRoom(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<void> {
  const membership = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
    .first();

  if (!membership) {
    throw new Error("User not found in room");
  }
}

/**
 * Computes horizontal layout for session and player nodes.
 * Places session node centered at (0, SESSION_Y) and player nodes
 * in a horizontal row below, evenly spaced.
 * Returns positions as top-left coordinates (React Flow format).
 */
function computeHorizontalLayout(
  sessionNodeId: string,
  playerNodeIds: string[]
): NodePosition[] {
  const positions: NodePosition[] = [];

  // Session node: centered horizontally at CANVAS_CENTER.x
  positions.push({
    nodeId: sessionNodeId,
    position: {
      x: CANVAS_CENTER.x - NODE_DIMENSIONS.session.width / 2,
      y: SESSION_Y,
    },
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
 * Recalculates layout for all session/player nodes.
 * Called when players join or leave to maintain balanced layout.
 */
export async function relayoutNodes(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<void> {
  // Get all nodes for the room
  const nodes = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();

  // Find session and player nodes
  const sessionNode = nodes.find((n) => n.type === "session");
  const playerNodes = nodes.filter((n) => n.type === "player");

  if (!sessionNode) return;

  // Compute new layout
  const playerNodeIds = playerNodes.map((n) => n.nodeId);
  const newPositions = computeHorizontalLayout(
    sessionNode.nodeId,
    playerNodeIds
  );

  // Build update operations for unlocked nodes
  const now = Date.now();
  const updateOperations = newPositions
    .map((pos) => {
      const node = nodes.find((n) => n.nodeId === pos.nodeId);
      return node && !node.isLocked ? { node, position: pos.position } : null;
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  // Execute all updates in parallel
  await Promise.all(
    updateOperations.map((op) =>
      ctx.db.patch(op.node._id, {
        position: op.position,
        lastUpdatedAt: now,
      })
    )
  );
}

/**
 * Initializes canvas nodes when a canvas room is created
 */
export async function initializeCanvasNodes(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms"> }
): Promise<void> {
  const room = await ctx.db.get(args.roomId);
  if (!room || room.roomType !== "canvas") {
    throw new Error("Invalid canvas room");
  }

  // Check if nodes already exist
  const existingNodes = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .first();

  if (existingNodes) {
    return; // Already initialized
  }

  const now = Date.now();

  // Create initial nodes in parallel
  await Promise.all([
    // Create timer node
    ctx.db.insert("canvasNodes", {
      roomId: args.roomId,
      nodeId: "timer",
      type: "timer",
      position: { x: TIMER_X, y: TIMER_Y },
      data: {
        startedAt: null,
        pausedAt: null,
        elapsedSeconds: 0,
        lastUpdatedBy: null,
        lastAction: null,
      },
      lastUpdatedAt: now,
    }),
    // Create session node
    ctx.db.insert("canvasNodes", {
      roomId: args.roomId,
      nodeId: "session-current",
      type: "session",
      position: { x: CANVAS_CENTER.x - 140, y: SESSION_Y },
      data: {},
      lastUpdatedAt: now,
    }),
  ]);
}

/**
 * Gets all canvas nodes for a room
 */
export async function getCanvasNodes(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<CanvasNode[]> {
  const nodes = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  // `data` is persisted as `v.any()`; assert the per-`type` read contract.
  return nodes as CanvasNode[];
}

/**
 * Updates a node's position
 */
export async function updateNodePosition(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">;
    nodeId: string;
    position: Position;
    userId: Id<"users">;
  }
): Promise<void> {
  const node = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", args.nodeId)
    )
    .unique();

  if (!node) {
    throw new Error("Node not found");
  }

  if (node.isLocked) {
    throw new Error("Node is locked");
  }

  await ctx.db.patch(node._id, {
    position: args.position,
    lastUpdatedBy: args.userId,
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Creates or updates a player node
 */
export async function upsertPlayerNode(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">;
    userId: Id<"users">;
    position?: Position;
  }
): Promise<Id<"canvasNodes">> {
  const nodeId = `player-${args.userId}`;

  const existingNode = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", nodeId)
    )
    .unique();

  if (existingNode) {
    return existingNode._id;
  }

  // Create with temporary position (will be updated by relayout)
  const position = args.position ?? { x: 0, y: 0 };

  const id = await ctx.db.insert("canvasNodes", {
    roomId: args.roomId,
    nodeId,
    type: "player",
    position,
    data: { userId: args.userId },
    lastUpdatedAt: Date.now(),
  });

  // Trigger relayout to position all nodes correctly
  await relayoutNodes(ctx, args.roomId);

  return id;
}


/**
 * Creates or updates results node
 */
export async function upsertResultsNode(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms"> }
): Promise<Id<"canvasNodes">> {
  const nodeId = "results";

  const existingNode = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", nodeId)
    )
    .unique();

  if (existingNode) {
    return existingNode._id;
  }

  return await ctx.db.insert("canvasNodes", {
    roomId: args.roomId,
    nodeId,
    type: "results",
    position: { x: CANVAS_CENTER.x + 400, y: SESSION_Y + 100 },
    data: {},
    lastUpdatedAt: Date.now(),
  });
}


/**
 * Removes player node when user leaves
 */
export async function removePlayerNode(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; userId: Id<"users"> }
): Promise<void> {
  const nodeId = `player-${args.userId}`;

  const node = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", nodeId)
    )
    .unique();

  if (node) {
    await ctx.db.delete(node._id);
  }

  // Trigger relayout to rebalance remaining nodes
  await relayoutNodes(ctx, args.roomId);
}

/**
 * Toggles lock state of a node
 */
export async function toggleNodeLock(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">;
    nodeId: string;
    locked: boolean;
  }
): Promise<void> {
  const node = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", args.nodeId)
    )
    .unique();

  if (!node) {
    throw new Error("Node not found");
  }

  await ctx.db.patch(node._id, {
    isLocked: args.locked,
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Creates a note node for an issue
 */
export async function createNoteNode(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">;
    issueId: Id<"issues">;
    userId: Id<"users">;
  }
): Promise<Id<"canvasNodes">> {
  // Verify user belongs to the room
  await verifyUserInRoom(ctx, args.roomId, args.userId);

  const nodeId = `note-${args.issueId}`;

  // Check if note already exists for this issue
  const existingNode = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", nodeId)
    )
    .unique();

  if (existingNode) {
    return existingNode._id;
  }

  // Get issue title for display
  const issue = await ctx.db.get(args.issueId);
  if (!issue) {
    throw new Error("Issue not found");
  }

  // Get user name for lastUpdatedBy display
  const user = await ctx.db.get(args.userId);

  return await ctx.db.insert("canvasNodes", {
    roomId: args.roomId,
    nodeId,
    type: "note",
    position: { x: NOTE_X, y: NOTE_Y },
    data: {
      issueId: args.issueId,
      issueTitle: issue.title,
      content: "",
      lastUpdatedBy: user?.name ?? "Unknown",
      lastUpdatedAt: Date.now(),
    },
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Updates the content of a note node
 */
export async function updateNoteContent(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">;
    nodeId: string;
    content: string;
    userId: Id<"users">;
  }
): Promise<void> {
  // Verify user belongs to the room
  await verifyUserInRoom(ctx, args.roomId, args.userId);

  // Validate content length
  if (args.content.length > MAX_NOTE_CONTENT_LENGTH) {
    throw new Error(`Note content too long (max ${MAX_NOTE_CONTENT_LENGTH} characters)`);
  }

  const node = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", args.nodeId)
    )
    .unique();

  if (!node) {
    throw new Error("Note node not found");
  }

  if (node.type !== "note") {
    throw new Error("Node is not a note");
  }

  // Get user name for display
  const user = await ctx.db.get(args.userId);

  await ctx.db.patch(node._id, {
    data: {
      ...node.data,
      content: args.content,
      lastUpdatedBy: user?.name ?? "Unknown",
      lastUpdatedAt: Date.now(),
    },
    lastUpdatedAt: Date.now(),
  });

  // Update room activity
  await ctx.db.patch(args.roomId, { lastActivityAt: Date.now() });
}

/**
 * Gets the note content for an issue (for CSV export)
 */
export async function getNoteContentForIssue(
  ctx: QueryCtx,
  args: { roomId: Id<"rooms">; issueId: Id<"issues"> }
): Promise<string | null> {
  const nodeId = `note-${args.issueId}`;

  const node = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", nodeId)
    )
    .unique();

  if (!node || node.type !== "note") {
    return null;
  }

  return node.data?.content ?? null;
}

/**
 * Deletes a note node
 */
export async function deleteNoteNode(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; nodeId: string; userId: Id<"users"> }
): Promise<void> {
  // Verify user belongs to the room
  await verifyUserInRoom(ctx, args.roomId, args.userId);

  const node = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) =>
      q.eq("roomId", args.roomId).eq("nodeId", args.nodeId)
    )
    .unique();

  if (!node) {
    throw new Error("Note node not found");
  }

  if (node.type !== "note") {
    throw new Error("Node is not a note");
  }

  await ctx.db.delete(node._id);
}