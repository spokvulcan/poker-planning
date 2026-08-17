/**
 * Shared convex-test seed helpers for the analytics suites (analytics.test.ts,
 * analyticsSnapshot.test.ts). The multi-dot filename matters: the Convex CLI
 * skips basenames with more than one dot, so this never deploys as a function
 * module, and it doesn't match the vitest `*.test.ts` include either.
 */
import type { TestConvex } from "convex-test";
import type schema from "./schema";
import type { Id } from "./_generated/dataModel";

export type T = TestConvex<typeof schema>;

// Deterministic UTC timestamps: IN lands inside RANGE, OUT outside it.
export const IN = Date.UTC(2026, 0, 10, 12); // 2026-01-10
export const OUT = Date.UTC(2026, 1, 10, 12); // 2026-02-10
export const RANGE = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 0, 31, 23, 59, 59) };

export async function seedUser(t: T, authUserId: string, name = "U"): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", { authUserId, name, createdAt: Date.now() })
  );
}

export async function seedRoom(t: T, name = "R"): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name,
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    })
  );
}

export async function addMembership(
  t: T,
  roomId: Id<"rooms">,
  userId: Id<"users">,
  joinedAt: number
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("roomMemberships", { roomId, userId, isSpectator: false, joinedAt })
  );
}

export async function seedIssue(
  t: T,
  roomId: Id<"rooms">,
  opts: {
    sequentialId: number;
    status?: "pending" | "voting" | "completed";
    votedAt?: number;
    finalEstimate?: string;
    voteStats?: { agreement: number; voteCount: number; timeToConsensusMs?: number };
  }
): Promise<Id<"issues">> {
  return t.run((ctx) =>
    ctx.db.insert("issues", {
      roomId,
      sequentialId: opts.sequentialId,
      title: `Issue ${opts.sequentialId}`,
      status: opts.status ?? "completed",
      ...(opts.votedAt !== undefined ? { votedAt: opts.votedAt } : {}),
      ...(opts.finalEstimate !== undefined ? { finalEstimate: opts.finalEstimate } : {}),
      ...(opts.voteStats !== undefined ? { voteStats: opts.voteStats } : {}),
      createdAt: Date.now(),
      order: opts.sequentialId,
    })
  );
}

export async function seedVote(
  t: T,
  opts: {
    roomId: Id<"rooms">;
    issueId: Id<"issues">;
    userId: Id<"users">;
    cardLabel: string;
    consensusLabel?: string;
    deltaSteps?: number;
    votedAt: number;
  }
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("individualVotes", {
      roomId: opts.roomId,
      issueId: opts.issueId,
      userId: opts.userId,
      cardLabel: opts.cardLabel,
      ...(opts.consensusLabel !== undefined ? { consensusLabel: opts.consensusLabel } : {}),
      ...(opts.deltaSteps !== undefined ? { deltaSteps: opts.deltaSteps } : {}),
      votedAt: opts.votedAt,
    })
  );
}
