/**
 * Demo simulation fixtures (Module 2).
 *
 * Hardcoded frontend constants that replace the former server-side seed
 * (`convex/model/demo.ts`). The bot roster, the sample issues, the canvas node
 * positions, and the simulation timing all live here so the Demo simulation is
 * fully client-side — there is no `rooms` row, no membership, no persisted vote
 * (see ADR-0003 and CONTEXT.md "Demo simulation").
 *
 * These values are static for the lifetime of the page; only the reducer state
 * (votes / phase) changes as the simulation ticks.
 */
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { CanvasNode } from "@/convex/model/canvas";
import type { RoomUserData } from "@/convex/model/users";
import { COUNTDOWN_DURATION_MS } from "@/convex/constants";
import type { DemoReducerConfig } from "./simulation";

/**
 * Synthetic ids for the simulation. They never reach Convex (every subscription
 * is bypassed in demo mode), so they only need to be stable, unique strings.
 */
export const DEMO_ROOM_ID = "demo-room" as Id<"rooms">;

const botId = (name: string): Id<"users"> =>
  `demo-bot-${name.toLowerCase().replace(/\s+/g, "-")}` as Id<"users">;

export interface DemoBot {
  id: Id<"users">;
  name: string;
  /** Cards this bot tends to play — mirrors the former server `BOT_CONFIGS`. */
  preferredCards: string[];
}

/** The bot roster (famous developers), matching the former seeded demo room. */
export const DEMO_BOTS: DemoBot[] = [
  { name: "Ada Lovelace", preferredCards: ["2", "3", "5"] },
  { name: "Grace Hopper", preferredCards: ["5", "8", "13"] },
  { name: "Alan Turing", preferredCards: ["3", "5", "8"] },
  { name: "Katherine Johnson", preferredCards: ["5", "8"] },
  { name: "Dennis Ritchie", preferredCards: ["8", "13", "21"] },
  { name: "Margaret Hamilton", preferredCards: ["3", "5", "8", "13"] },
].map((b) => ({ id: botId(b.name), name: b.name, preferredCards: b.preferredCards }));

/**
 * The bots as room members. `isBot` is the retained frontend type marker (the
 * `roomMemberships.isBot` column is gone) — set here so simulated bots are still
 * flagged as bots in the shape `RoomWithRelatedData` carries. Constant.
 */
export const DEMO_USERS: RoomUserData[] = DEMO_BOTS.map((b) => ({
  _id: b.id,
  name: b.name,
  isSpectator: false,
  isBot: true,
  role: "participant",
  joinedAt: 0,
  membershipId: `demo-membership-${b.id}` as Id<"roomMemberships">,
}));

/**
 * Sample issues for the demo's issues panel. The current target is always the
 * `voting` one (the simulation re-runs the same round on it, as the server demo
 * did); the others stay `pending` to illustrate an issue-backed backlog.
 */
const demoIssue = (
  order: number,
  title: string,
  status: Doc<"issues">["status"],
): Doc<"issues"> => ({
  _id: `demo-issue-${order + 1}` as Id<"issues">,
  _creationTime: 0,
  roomId: DEMO_ROOM_ID,
  sequentialId: order + 1,
  title,
  status,
  createdAt: 0,
  order,
});

export const DEMO_ISSUES: Doc<"issues">[] = [
  demoIssue(0, "Add user authentication", "voting"),
  demoIssue(1, "Setup CI/CD pipeline", "pending"),
  demoIssue(2, "Database migration", "pending"),
];

/** The issue the bots vote on each round. */
export const DEMO_CURRENT_ISSUE = DEMO_ISSUES[0];

// --- Canvas layout -------------------------------------------------------
// Mirrors the backend default layout (`convex/model/canvas.ts`) so the demo
// canvas matches a real room's: a stopped timer node, the session node, one
// player node per bot in a centered row, and a results node (rendered only on
// reveal). Positions are static — the canvas is locked in demo mode.
const SESSION_Y = -300;
const SESSION_W = 280;
const SESSION_H = 150;
const PLAYER_W = 80;
const PLAYER_H = 130;
const NODE_SEP = 150; // horizontal spacing between players
const RANK_SEP = 400; // vertical spacing between session and players
const TIMER_POS = { x: -500, y: -250 };
const RESULTS_POS = { x: 400, y: SESSION_Y + 100 };

function playerRowPositions(count: number): { x: number; y: number }[] {
  const totalWidth = (count - 1) * NODE_SEP;
  const startX = -totalWidth / 2;
  const y = SESSION_Y + SESSION_H / 2 + RANK_SEP - PLAYER_H / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * NODE_SEP - PLAYER_W / 2,
    y,
  }));
}

/**
 * Builds the canvas node set in the shape `useCanvasNodes` consumes from
 * `api.canvas.getCanvasNodes`. Constant for the page's lifetime.
 */
function buildDemoCanvasNodes(): CanvasNode[] {
  const positions = playerRowPositions(DEMO_BOTS.length);
  const playerNodes: CanvasNode[] = DEMO_BOTS.map((bot, i) => ({
    roomId: DEMO_ROOM_ID,
    nodeId: `player-${bot.id}`,
    type: "player",
    position: positions[i],
    data: { userId: bot.id },
    lastUpdatedAt: 0,
  }));

  return [
    {
      roomId: DEMO_ROOM_ID,
      nodeId: "timer",
      type: "timer",
      position: TIMER_POS,
      data: {
        startedAt: null,
        pausedAt: null,
        elapsedSeconds: 0,
        lastUpdatedBy: null,
        lastAction: null,
      },
      lastUpdatedAt: 0,
    },
    {
      roomId: DEMO_ROOM_ID,
      nodeId: "session-current",
      type: "session",
      position: { x: -SESSION_W / 2, y: SESSION_Y },
      data: {},
      lastUpdatedAt: 0,
    },
    ...playerNodes,
    {
      roomId: DEMO_ROOM_ID,
      nodeId: "results",
      type: "results",
      position: RESULTS_POS,
      data: {},
      lastUpdatedAt: 0,
    },
  ];
}

export const DEMO_CANVAS_NODES: CanvasNode[] = buildDemoCanvasNodes();

// --- Simulation timing ---------------------------------------------------
// Moved from `convex/constants.ts` (server) to the frontend, since the demo is
// now client-only. The former 8s cron cadence existed only to limit Convex
// writes; with that gone, the cadence is tuned purely for feel.

/** Chance (0–1) that a vote-cycle casts at all, for natural pacing. */
export const DEMO_VOTE_PROBABILITY = 0.8;
/** How long the revealed results hold on screen before a fresh round. */
export const DEMO_RESULTS_DISPLAY_MS = 10_000;
/** Cadence of bot vote-cycles while in the `voting` phase. */
export const DEMO_VOTE_INTERVAL_MS = 1_200;
/** Provider tick interval — fine enough for a smooth countdown re-anchor. */
export const DEMO_TICK_MS = 250;
/**
 * The local auto-reveal countdown duration. Kept equal to the real round's
 * `COUNTDOWN_DURATION_MS` so the SessionNode countdown (which renders from a
 * wall-clock `autoRevealCountdownStartedAt`) reaches zero exactly when the
 * reducer reveals.
 */
export const DEMO_COUNTDOWN_MS = COUNTDOWN_DURATION_MS;

/** The reducer config derived from the fixtures (used by the provider). */
export const DEMO_REDUCER_CONFIG: DemoReducerConfig = {
  bots: DEMO_BOTS.map((b) => ({ id: b.id, preferredCards: b.preferredCards })),
  voteProbability: DEMO_VOTE_PROBABILITY,
  voteIntervalMs: DEMO_VOTE_INTERVAL_MS,
  countdownMs: DEMO_COUNTDOWN_MS,
  resultsDisplayMs: DEMO_RESULTS_DISPLAY_MS,
};
