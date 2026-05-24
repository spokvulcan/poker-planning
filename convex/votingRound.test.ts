/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import * as Countdown from "./model/countdown";
import * as VotingRound from "./model/votingRound";
import * as Issues from "./model/issues";
import * as Users from "./model/users";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

async function seedRoom(
  t: T,
  overrides: Partial<{
    autoCompleteVoting: boolean;
    isGameOver: boolean;
    currentIssueId: Id<"issues">;
  }> = {}
): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      ...overrides,
    })
  );
}

async function readRoom(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) => ctx.db.get(roomId));
}

async function scheduledFns(t: T) {
  return t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
}

async function addMember(
  t: T,
  roomId: Id<"rooms">,
  opts: { isSpectator?: boolean } = {}
): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authUserId: `auth-${crypto.randomUUID()}`,
      name: "U",
      createdAt: Date.now(),
    });
    await ctx.db.insert("roomMemberships", {
      roomId,
      userId,
      isSpectator: opts.isSpectator ?? false,
      joinedAt: Date.now(),
    });
    return userId;
  });
}

async function rawVote(
  t: T,
  roomId: Id<"rooms">,
  userId: Id<"users">,
  cardLabel = "5"
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("votes", {
      roomId,
      userId,
      cardLabel,
      cardValue: parseFloat(cardLabel) || 0,
    })
  );
}

async function deleteVote(
  t: T,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<void> {
  await t.run(async (ctx) => {
    const vote = await ctx.db
      .query("votes")
      .withIndex("by_room_user", (q) =>
        q.eq("roomId", roomId).eq("userId", userId)
      )
      .first();
    if (vote) await ctx.db.delete(vote._id);
  });
}

async function seedIssue(
  t: T,
  roomId: Id<"rooms">,
  opts: { status?: "pending" | "voting" | "completed"; order?: number } = {}
): Promise<Id<"issues">> {
  const order = opts.order ?? 0;
  return t.run((ctx) =>
    ctx.db.insert("issues", {
      roomId,
      sequentialId: order + 1,
      title: `Issue ${order + 1}`,
      status: opts.status ?? "voting",
      createdAt: Date.now(),
      order,
    })
  );
}

async function clearVotes(t: T, roomId: Id<"rooms">): Promise<void> {
  await t.run(async (ctx) => {
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    await Promise.all(votes.map((v) => ctx.db.delete(v._id)));
  });
}

describe("Countdown.arm", () => {
  it("stamps a token and schedules an auto-reveal", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await t.run((ctx) => Countdown.arm(ctx, roomId));

    const room = await readRoom(t, roomId);
    const scheduled = await scheduledFns(t);

    expect(room?.autoRevealCountdownStartedAt).toEqual(expect.any(Number));
    expect(room?.autoRevealScheduledId).toBeDefined();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].state.kind).toBe("pending");
  });
});

describe("Countdown.cancel", () => {
  it("cancels the scheduled reveal and clears both countdown fields", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await t.run((ctx) => Countdown.arm(ctx, roomId));

    await t.run((ctx) => Countdown.cancel(ctx, roomId));

    const room = await readRoom(t, roomId);
    const scheduled = await scheduledFns(t);

    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
    expect(room?.autoRevealScheduledId).toBeUndefined();
    expect(scheduled[0].state.kind).toBe("canceled");
  });
});

describe("VotingRound.autoReveal", () => {
  it("reveals when its token is the room's live countdown", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    await t.run((ctx) => Countdown.arm(ctx, roomId));
    const token = (await readRoom(t, roomId))!.autoRevealCountdownStartedAt!;

    await t.run((ctx) => VotingRound.autoReveal(ctx, { roomId, token }));

    const room = await readRoom(t, roomId);
    expect(room?.isGameOver).toBe(true);
    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
    expect(room?.autoRevealScheduledId).toBeUndefined();
  });

  it("no-ops when its token is no longer the room's live countdown (stale)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    await t.run((ctx) => Countdown.arm(ctx, roomId));
    const liveToken = (await readRoom(t, roomId))!.autoRevealCountdownStartedAt!;

    await t.run((ctx) =>
      VotingRound.autoReveal(ctx, { roomId, token: liveToken - 1 })
    );

    const room = await readRoom(t, roomId);
    expect(room?.isGameOver).toBe(false); // stale job revealed nothing
    expect(room?.autoRevealCountdownStartedAt).toBe(liveToken); // countdown intact
  });

  it("no-ops when the room is already revealed", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { isGameOver: true });
    await t.run((ctx) => VotingRound.autoReveal(ctx, { roomId, token: 123 }));
    expect((await readRoom(t, roomId))?.isGameOver).toBe(true);
  });

  it("no-ops when no countdown is active", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await t.run((ctx) => VotingRound.autoReveal(ctx, { roomId, token: 123 }));
    expect((await readRoom(t, roomId))?.isGameOver).toBe(false);
  });

  it("no-ops when the room is gone", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await t.run((ctx) => ctx.db.delete(roomId));
    // Should not throw.
    await t.run((ctx) => VotingRound.autoReveal(ctx, { roomId, token: 123 }));
    expect(await readRoom(t, roomId)).toBeNull();
  });
});

describe("Countdown.evaluate", () => {
  it("arms once every non-spectator has voted (spectators don't count)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    await addMember(t, roomId, { isSpectator: true }); // never votes
    await rawVote(t, roomId, a);
    await rawVote(t, roomId, b);

    await t.run((ctx) => Countdown.evaluate(ctx, roomId));

    const room = await readRoom(t, roomId);
    expect(room?.autoRevealCountdownStartedAt).toEqual(expect.any(Number));
    expect(room?.autoRevealScheduledId).toBeDefined();
  });

  it("does not arm while a non-spectator is still missing a vote", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    await addMember(t, roomId); // never votes
    await rawVote(t, roomId, a);

    await t.run((ctx) => Countdown.evaluate(ctx, roomId));

    const room = await readRoom(t, roomId);
    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
  });

  it("does not arm a room with no non-spectator members (empty is not all-in)", async () => {
    // `[].every()` is vacuously true, so a spectator-only room would otherwise
    // report "all in" and auto-reveal a round nobody really voted in. castVote
    // now refuses spectator ballots (ADR-0004), but evaluate stays defensive: a
    // stray spectator vote row inserted directly (e.g. legacy data) must not arm.
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const s = await addMember(t, roomId, { isSpectator: true });
    await rawVote(t, roomId, s);

    await t.run((ctx) => Countdown.evaluate(ctx, roomId));

    const room = await readRoom(t, roomId);
    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
    expect(await scheduledFns(t)).toHaveLength(0);
  });

  it("cancels an armed countdown once a voter retracts (no longer all-in)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    await rawVote(t, roomId, a);
    await rawVote(t, roomId, b);
    await t.run((ctx) => Countdown.evaluate(ctx, roomId)); // arms

    await deleteVote(t, roomId, a); // a retracts
    await t.run((ctx) => Countdown.evaluate(ctx, roomId)); // should cancel

    const room = await readRoom(t, roomId);
    const scheduled = await scheduledFns(t);
    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
    expect(room?.autoRevealScheduledId).toBeUndefined();
    expect(scheduled[0].state.kind).toBe("canceled");
  });
});

describe("dropVoter — a roster exit reconciles the round", () => {
  // Remove a member's roomMembership the way the users module does, so the
  // non-spectator roster has already shrunk when dropVoter re-checks completion.
  async function removeMembership(t: T, roomId: Id<"rooms">, userId: Id<"users">) {
    await t.run(async (ctx) => {
      const members = await ctx.db
        .query("roomMemberships")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect();
      const m = members.find((x) => x.userId === userId);
      if (m) await ctx.db.delete(m._id);
    });
  }

  it("arms the countdown once the dropped member was the last non-voter", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId); // never votes — the lone blocker
    await rawVote(t, roomId, a);

    await removeMembership(t, roomId, b); // caller shrinks the roster first
    await t.run((ctx) => VotingRound.dropVoter(ctx, roomId, b));

    const room = await readRoom(t, roomId);
    expect(room?.autoRevealCountdownStartedAt).toEqual(expect.any(Number));
    expect(room?.autoRevealScheduledId).toBeDefined();
  });

  it("deletes the dropped member's own votes (round is sole writer of the votes table)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    await rawVote(t, roomId, a);
    await rawVote(t, roomId, b);

    await removeMembership(t, roomId, b);
    await t.run((ctx) => VotingRound.dropVoter(ctx, roomId, b));

    const remaining = await t.run((ctx) =>
      ctx.db
        .query("votes")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect()
    );
    expect(remaining.map((v) => v.userId)).toEqual([a]);
  });

  it("becoming a spectator arms the countdown when it completes the round", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId); // hasn't voted
    await rawVote(t, roomId, a);

    // The last non-voter switches to spectator — the room is now fully voted.
    await t.run((ctx) =>
      Users.editUser(ctx, { roomId, userId: b, isSpectator: true })
    );

    const room = await readRoom(t, roomId);
    expect(room?.autoRevealCountdownStartedAt).toEqual(expect.any(Number));
  });

  it("becoming a spectator via editUser deletes the member's existing vote", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    await rawVote(t, roomId, a);
    await rawVote(t, roomId, b); // b has voted, then spectates

    await t.run((ctx) =>
      Users.editUser(ctx, { roomId, userId: b, isSpectator: true })
    );

    // The round drops a spectating member's votes, so only a's vote remains —
    // a spectator never keeps a vote row (ADR-0004).
    const remaining = await t.run((ctx) =>
      ctx.db
        .query("votes")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect()
    );
    expect(remaining.map((v) => v.userId)).toEqual([a]);
  });

  it("leaving the room arms the countdown when it completes the round", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId); // hasn't voted
    await rawVote(t, roomId, a);

    await t.run((ctx) => Users.leaveRoom(ctx, b, roomId)); // also the remove/kick path

    const room = await readRoom(t, roomId);
    expect(room?.autoRevealCountdownStartedAt).toEqual(expect.any(Number));
  });

  it("a never-voted latecomer does not prevent the armed reveal from firing (let it reveal — ADR-0004)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    await rawVote(t, roomId, a);
    await rawVote(t, roomId, b);
    await t.run((ctx) => Countdown.evaluate(ctx, roomId)); // all in -> armed
    const token = (await readRoom(t, roomId))!.autoRevealCountdownStartedAt!;
    expect(token).toEqual(expect.any(Number));

    // A latecomer joins as a participant after the countdown is armed: the room
    // is no longer all-in, but admission deliberately does not reconcile.
    await t.run((ctx) =>
      Users.joinRoom(ctx, { roomId, name: "C", authUserId: "auth-latecomer" })
    );
    expect((await readRoom(t, roomId))?.autoRevealCountdownStartedAt).toBe(token);

    // When the armed reveal fires, it still reveals — the latecomer who never
    // voted does not hold it back. (Re-checking all-in at fire time would wrongly
    // no-op here; this asserts we don't.)
    await t.run((ctx) => VotingRound.autoReveal(ctx, { roomId, token }));
    expect((await readRoom(t, roomId))?.isGameOver).toBe(true);
  });
});

// The bug this PRD exists to kill: every path that leaves a round during the
// auto-reveal countdown must not let the original scheduled reveal fire on the
// NEXT round. We exercise all three teardown triggers (issue #199, story 15),
// and assert at the root: a reveal carrying the old countdown's token reveals
// nothing once a new countdown (new token) is live.
describe("early-reveal regression (issue #199)", () => {
  const BASE = new Date("2026-05-23T12:00:00Z").getTime();

  afterEach(() => {
    vi.useRealTimers();
  });

  // Seed an issue-backed room with auto-complete on, two voters, all votes in,
  // countdown armed. Time is frozen so the armed token is deterministic (BASE).
  async function setupArmedRound(t: T) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE);

    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const issueId = await seedIssue(t, roomId, { status: "voting", order: 0 });
    const otherIssueId = await seedIssue(t, roomId, {
      status: "pending",
      order: 1,
    });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    await rawVote(t, roomId, a);
    await rawVote(t, roomId, b);
    await t.run((ctx) => Countdown.evaluate(ctx, roomId)); // arm token T1

    const r1 = await readRoom(t, roomId);
    return {
      roomId,
      issueId,
      otherIssueId,
      members: [a, b] as Id<"users">[],
      T1: r1!.autoRevealCountdownStartedAt!,
      S1: r1!.autoRevealScheduledId!,
    };
  }

  // A new round, started at a later instant so its token T2 differs from T1.
  async function armFreshCountdown(t: T, roomId: Id<"rooms">, members: Id<"users">[]) {
    vi.setSystemTime(BASE + 10_000);
    await clearVotes(t, roomId);
    for (const m of members) await rawVote(t, roomId, m);
    await t.run((ctx) => Countdown.evaluate(ctx, roomId));
    return (await readRoom(t, roomId))!.autoRevealCountdownStartedAt!;
  }

  async function assertOriginalScheduledRevealCancelled(t: T, S1: Id<"_scheduled_functions">) {
    const scheduled = await scheduledFns(t);
    expect(scheduled.find((s) => s._id === S1)?.state.kind).toBe("canceled");
  }

  async function assertStaleJobInertButLiveJobReveals(
    t: T,
    roomId: Id<"rooms">,
    T1: number,
    T2: number
  ) {
    expect(T2).not.toBe(T1);
    // The original job fires carrying the now-stale token — reveals nothing.
    await t.run((ctx) => VotingRound.autoReveal(ctx, { roomId, token: T1 }));
    expect((await readRoom(t, roomId))?.isGameOver).toBe(false);
    // The live countdown's own job still reveals normally.
    await t.run((ctx) => VotingRound.autoReveal(ctx, { roomId, token: T2 }));
    expect((await readRoom(t, roomId))?.isGameOver).toBe(true);
  }

  it("abandon to Quick Vote cannot early-reveal the next round", async () => {
    const t = convexTest(schema, modules);
    const { roomId, members, T1, S1 } = await setupArmedRound(t);

    await t.run((ctx) => VotingRound.abandon(ctx, roomId));

    await assertOriginalScheduledRevealCancelled(t, S1);
    const T2 = await armFreshCountdown(t, roomId, members);
    await assertStaleJobInertButLiveJobReveals(t, roomId, T1, T2);
  });

  it("deleting the current issue cannot early-reveal the next round", async () => {
    const t = convexTest(schema, modules);
    const { roomId, issueId, members, T1, S1 } = await setupArmedRound(t);

    await t.run((ctx) => Issues.removeIssue(ctx, issueId));

    await assertOriginalScheduledRevealCancelled(t, S1);
    const T2 = await armFreshCountdown(t, roomId, members);
    await assertStaleJobInertButLiveJobReveals(t, roomId, T1, T2);
  });

  it("switching directly to another issue cannot early-reveal the next round", async () => {
    const t = convexTest(schema, modules);
    const { roomId, otherIssueId, members, T1, S1 } = await setupArmedRound(t);

    await t.run((ctx) =>
      VotingRound.start(ctx, { roomId, issueId: otherIssueId })
    );

    await assertOriginalScheduledRevealCancelled(t, S1);
    const T2 = await armFreshCountdown(t, roomId, members);
    await assertStaleJobInertButLiveJobReveals(t, roomId, T1, T2);
  });
});

describe("VotingRound.abandon", () => {
  it("drops the issue target to a Quick Vote and reverts the issue to pending", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));

    await t.run((ctx) => VotingRound.abandon(ctx, roomId));

    const room = await readRoom(t, roomId);
    const issue = await t.run((ctx) => ctx.db.get(issueId));
    expect(room?.currentIssueId).toBeUndefined(); // Quick Vote
    expect(room?.isGameOver).toBe(false); // still in `voting`
    expect(issue?.status).toBe("pending");
  });

  it("clears prior votes", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    const a = await addMember(t, roomId);
    await rawVote(t, roomId, a);

    await t.run((ctx) => VotingRound.abandon(ctx, roomId));

    const votes = await t.run((ctx) =>
      ctx.db
        .query("votes")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect()
    );
    expect(votes).toHaveLength(0);
  });

  it("closes the issue's open timing record", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    await t.run((ctx) =>
      ctx.db.insert("votingTimestamps", {
        roomId,
        issueId,
        votingStartedAt: Date.now() - 5000,
        roundNumber: 1,
      })
    );

    await t.run((ctx) => VotingRound.abandon(ctx, roomId));

    const ts = await t.run((ctx) =>
      ctx.db
        .query("votingTimestamps")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .first()
    );
    expect(ts?.votingEndedAt).toEqual(expect.any(Number));
    expect(ts?.durationMs).toEqual(expect.any(Number));
  });

  it("cancels an armed countdown", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    await t.run((ctx) => Countdown.arm(ctx, roomId));
    const scheduledId = (await readRoom(t, roomId))!.autoRevealScheduledId!;

    await t.run((ctx) => VotingRound.abandon(ctx, roomId));

    const room = await readRoom(t, roomId);
    const scheduled = await scheduledFns(t);
    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
    expect(room?.autoRevealScheduledId).toBeUndefined();
    expect(scheduled.find((s) => s._id === scheduledId)?.state.kind).toBe(
      "canceled"
    );
  });

  it("on a target-less Quick Vote, stays in voting without error", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t); // no currentIssueId

    await t.run((ctx) => VotingRound.abandon(ctx, roomId));

    const room = await readRoom(t, roomId);
    expect(room?.currentIssueId).toBeUndefined();
    expect(room?.isGameOver).toBe(false);
  });
});

describe("removeIssue of the current issue (delegates to abandon)", () => {
  it("ends the round cleanly: Quick Vote, cleared votes, issue removed", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    const a = await addMember(t, roomId);
    await rawVote(t, roomId, a);

    await t.run((ctx) => Issues.removeIssue(ctx, issueId));

    const room = await readRoom(t, roomId);
    const issue = await t.run((ctx) => ctx.db.get(issueId));
    const votes = await t.run((ctx) =>
      ctx.db
        .query("votes")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect()
    );
    expect(issue).toBeNull(); // issue removed
    expect(room?.currentIssueId).toBeUndefined(); // Quick Vote
    expect(room?.isGameOver).toBe(false);
    expect(votes).toHaveLength(0); // round ended cleanly
  });
});

async function votesFor(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("votes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

async function timingFor(t: T, issueId: Id<"issues">) {
  return t.run((ctx) =>
    ctx.db
      .query("votingTimestamps")
      .withIndex("by_issue", (q) => q.eq("issueId", issueId))
      .collect()
  );
}

describe("VotingRound.start", () => {
  it("starts a round on an issue: marks it voting, clears votes, opens round 1", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "pending" });
    const a = await addMember(t, roomId);
    await rawVote(t, roomId, a); // leftover vote from a prior round

    await t.run((ctx) => VotingRound.start(ctx, { roomId, issueId }));

    const room = await readRoom(t, roomId);
    const issue = await t.run((ctx) => ctx.db.get(issueId));
    const timestamps = await timingFor(t, issueId);
    expect(room?.currentIssueId).toBe(issueId);
    expect(room?.isGameOver).toBe(false);
    expect(issue?.status).toBe("voting");
    expect(await votesFor(t, roomId)).toHaveLength(0);
    expect(timestamps).toHaveLength(1);
    expect(timestamps[0].roundNumber).toBe(1);
    expect(timestamps[0].votingEndedAt).toBeUndefined(); // open round
  });

  it("starts a Quick Vote (no issue): clears votes and records no timing", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const a = await addMember(t, roomId);
    await rawVote(t, roomId, a);

    await t.run((ctx) => VotingRound.start(ctx, { roomId }));

    const room = await readRoom(t, roomId);
    expect(room?.currentIssueId).toBeUndefined();
    expect(room?.isGameOver).toBe(false);
    expect(await votesFor(t, roomId)).toHaveLength(0);
    const ts = await t.run((ctx) =>
      ctx.db
        .query("votingTimestamps")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect()
    );
    expect(ts).toHaveLength(0);
  });

  it("switching to a new issue reverts the previous issue to pending", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const first = await seedIssue(t, roomId, { status: "voting", order: 0 });
    const second = await seedIssue(t, roomId, { status: "pending", order: 1 });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: first }));

    await t.run((ctx) => VotingRound.start(ctx, { roomId, issueId: second }));

    const room = await readRoom(t, roomId);
    expect(room?.currentIssueId).toBe(second);
    expect((await t.run((ctx) => ctx.db.get(first)))?.status).toBe("pending");
    expect((await t.run((ctx) => ctx.db.get(second)))?.status).toBe("voting");
  });
});

describe("VotingRound.reset", () => {
  it("re-opens the same issue and starts a new timed round (round 2)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "completed" });
    await t.run((ctx) =>
      ctx.db.patch(roomId, { currentIssueId: issueId, isGameOver: true })
    );
    await t.run((ctx) =>
      ctx.db.insert("votingTimestamps", {
        roomId,
        issueId,
        votingStartedAt: Date.now() - 10_000,
        votingEndedAt: Date.now() - 5_000,
        durationMs: 5_000,
        roundNumber: 1,
      })
    );
    const a = await addMember(t, roomId);
    await rawVote(t, roomId, a); // stale vote from the revealed round

    await t.run((ctx) => VotingRound.reset(ctx, roomId));

    const room = await readRoom(t, roomId);
    const issue = await t.run((ctx) => ctx.db.get(issueId));
    const ts = await timingFor(t, issueId);
    expect(room?.isGameOver).toBe(false);
    expect(room?.currentIssueId).toBe(issueId); // same target
    expect(issue?.status).toBe("voting");
    expect(await votesFor(t, roomId)).toHaveLength(0);
    expect(ts).toHaveLength(2);
    expect(ts.find((x) => x.roundNumber === 2)?.votingEndedAt).toBeUndefined();
  });
});

describe("VotingRound.reveal", () => {
  it("flips to revealed and snapshots the consensus + stats onto the issue", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    const c = await addMember(t, roomId);
    await rawVote(t, roomId, a, "5");
    await rawVote(t, roomId, b, "5");
    await rawVote(t, roomId, c, "3");

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    const room = await readRoom(t, roomId);
    const issue = await t.run((ctx) => ctx.db.get(issueId));
    expect(room?.isGameOver).toBe(true);
    expect(issue?.status).toBe("completed");
    expect(issue?.finalEstimate).toBe("5"); // mode
    expect(issue?.voteStats?.voteCount).toBe(3);
    expect(issue?.voteStats?.agreement).toBe(67); // 2 of 3
  });

  it("stores numeric average/median when the room has no explicit scale", async () => {
    // The demo room and pre-`votingScale` rooms have no scale; the canvas
    // panel still shows an average (client default `?? true`), so the stored
    // stats must be numeric too — not null (ADR-0002, no client/server divergence).
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t); // seedRoom sets no votingScale
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    const c = await addMember(t, roomId);
    await rawVote(t, roomId, a, "2");
    await rawVote(t, roomId, b, "4");
    await rawVote(t, roomId, c, "6");

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    const issue = await t.run((ctx) => ctx.db.get(issueId));
    expect(issue?.voteStats?.average).toBe(4);
    expect(issue?.voteStats?.median).toBe(4);
  });

  it("snapshots per-voter alignment into individualVotes", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    await rawVote(t, roomId, a, "5");
    await rawVote(t, roomId, b, "5");

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    const snapshots = await t.run((ctx) =>
      ctx.db
        .query("individualVotes")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .collect()
    );
    expect(snapshots).toHaveLength(2);
    expect(snapshots.every((s) => s.consensusLabel === "5")).toBe(true);
  });

  it("snapshots agreement excluding special cards (the client/server divergence)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "voting" });
    await t.run((ctx) => ctx.db.patch(roomId, { currentIssueId: issueId }));
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    const c = await addMember(t, roomId);
    await rawVote(t, roomId, a, "5");
    await rawVote(t, roomId, b, "5");
    await rawVote(t, roomId, c, "?"); // special card — must not count

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    const issue = await t.run((ctx) => ctx.db.get(issueId));
    expect(issue?.voteStats?.voteCount).toBe(2); // "?" excluded
    expect(issue?.voteStats?.agreement).toBe(100); // 2 of 2 on "5"
    expect(issue?.finalEstimate).toBe("5");
  });

  it("on a Quick Vote just flips to revealed (no issue to complete)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t); // no currentIssueId
    const a = await addMember(t, roomId);
    await rawVote(t, roomId, a, "8");

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    expect((await readRoom(t, roomId))?.isGameOver).toBe(true);
  });

  it("closes the open timing record even when there is no consensus", async () => {
    // Revealing a round with only special cards (or no votes) yields no
    // consensus, so the issue isn't completed — but the round IS over, so its
    // open timing record must close at reveal, not leak until the next reset.
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId, { status: "pending" });
    await t.run((ctx) => VotingRound.start(ctx, { roomId, issueId })); // opens round 1
    const a = await addMember(t, roomId);
    await rawVote(t, roomId, a, "?"); // special only → consensus null

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    const ts = await t.run((ctx) =>
      ctx.db
        .query("votingTimestamps")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .collect()
    );
    expect(ts).toHaveLength(1);
    expect(ts[0].votingEndedAt).toEqual(expect.any(Number));
  });

  it("cancels an armed countdown when revealing", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    await t.run((ctx) => Countdown.arm(ctx, roomId));
    const scheduledId = (await readRoom(t, roomId))!.autoRevealScheduledId!;

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    const room = await readRoom(t, roomId);
    const scheduled = await scheduledFns(t);
    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
    expect(room?.autoRevealScheduledId).toBeUndefined();
    expect(scheduled.find((s) => s._id === scheduledId)?.state.kind).toBe(
      "canceled"
    );
  });
});

describe("VotingRound.cancelCountdown", () => {
  it("clears the countdown and cancels the scheduled reveal, staying in voting", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    await t.run((ctx) => Countdown.arm(ctx, roomId));
    const scheduledId = (await readRoom(t, roomId))!.autoRevealScheduledId!;

    await t.run((ctx) => VotingRound.cancelCountdown(ctx, roomId));

    const room = await readRoom(t, roomId);
    const scheduled = await scheduledFns(t);
    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
    expect(room?.autoRevealScheduledId).toBeUndefined();
    expect(room?.isGameOver).toBe(false); // back to voting, not revealed
    expect(scheduled.find((s) => s._id === scheduledId)?.state.kind).toBe(
      "canceled"
    );
  });
});

describe("VotingRound.phaseOf", () => {
  it("is `voting` for an unrevealed round with no countdown", () => {
    expect(VotingRound.phaseOf({ isGameOver: false })).toBe("voting");
  });

  it("is `countingDown` while the auto-reveal countdown is armed", () => {
    expect(
      VotingRound.phaseOf({ isGameOver: false, autoRevealCountdownStartedAt: 123 })
    ).toBe("countingDown");
  });

  it("is `revealed` once the round is settled", () => {
    expect(VotingRound.phaseOf({ isGameOver: true })).toBe("revealed");
  });

  it("is `revealed` even if a countdown field lingers (revealed wins)", () => {
    expect(
      VotingRound.phaseOf({ isGameOver: true, autoRevealCountdownStartedAt: 123 })
    ).toBe("revealed");
  });
});

describe("VotingRound.castVote", () => {
  it("records a participant's card", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: false });
    const a = await addMember(t, roomId);

    await t.run((ctx) =>
      VotingRound.castVote(ctx, { roomId, userId: a, cardLabel: "5", cardValue: 5 })
    );

    const votes = await votesFor(t, roomId);
    expect(votes).toHaveLength(1);
    expect(votes[0].cardLabel).toBe("5");
  });

  it("changing a card updates the existing vote rather than duplicating", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: false });
    const a = await addMember(t, roomId);
    await t.run((ctx) =>
      VotingRound.castVote(ctx, { roomId, userId: a, cardLabel: "5", cardValue: 5 })
    );

    await t.run((ctx) =>
      VotingRound.castVote(ctx, { roomId, userId: a, cardLabel: "8", cardValue: 8 })
    );

    const votes = await votesFor(t, roomId);
    expect(votes).toHaveLength(1);
    expect(votes[0].cardLabel).toBe("8");
  });

  it("arms the countdown once every non-spectator has voted", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);

    await t.run((ctx) =>
      VotingRound.castVote(ctx, { roomId, userId: a, cardLabel: "5", cardValue: 5 })
    );

    expect((await readRoom(t, roomId))?.autoRevealCountdownStartedAt).toEqual(
      expect.any(Number)
    );
  });

  it("refuses a spectator's ballot — spectators are voteless (ADR-0004)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: false });
    const s = await addMember(t, roomId, { isSpectator: true });

    await expect(
      t.run((ctx) =>
        VotingRound.castVote(ctx, {
          roomId,
          userId: s,
          cardLabel: "5",
          cardValue: 5,
        })
      )
    ).rejects.toThrow(/spectator/i);

    expect(await votesFor(t, roomId)).toHaveLength(0);
  });
});

describe("VotingRound.retractVote", () => {
  it("removes the participant's card", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: false });
    const a = await addMember(t, roomId);
    await t.run((ctx) =>
      VotingRound.castVote(ctx, { roomId, userId: a, cardLabel: "5", cardValue: 5 })
    );

    await t.run((ctx) => VotingRound.retractVote(ctx, { roomId, userId: a }));

    expect(await votesFor(t, roomId)).toHaveLength(0);
  });

  it("cancels the countdown when the room is no longer fully voted", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { autoCompleteVoting: true });
    const a = await addMember(t, roomId);
    const b = await addMember(t, roomId);
    await t.run((ctx) =>
      VotingRound.castVote(ctx, { roomId, userId: a, cardLabel: "5", cardValue: 5 })
    );
    await t.run((ctx) =>
      VotingRound.castVote(ctx, { roomId, userId: b, cardLabel: "5", cardValue: 5 })
    ); // all in -> armed

    await t.run((ctx) => VotingRound.retractVote(ctx, { roomId, userId: a }));

    const room = await readRoom(t, roomId);
    expect(room?.autoRevealCountdownStartedAt).toBeUndefined();
    expect(room?.autoRevealScheduledId).toBeUndefined();
  });
});

describe("linkAnonymousToPermanent — identity merge keeps spectators voteless (ADR-0004)", () => {
  it("drops the merged vote rather than leaving it on a spectator destination", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    // Destination: a PERMANENT user who is a spectator in the room (no vote).
    const permanentId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId: "auth-permanent",
        name: "P",
        accountType: "permanent" as const,
        createdAt: Date.now(),
      })
    );
    await t.run((ctx) =>
      ctx.db.insert("roomMemberships", {
        roomId,
        userId: permanentId,
        isSpectator: true,
        joinedAt: Date.now(),
      })
    );

    // Source: an ANONYMOUS user who voted in the room as a non-spectator.
    const anonId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId: "auth-anon",
        name: "A",
        createdAt: Date.now(),
      })
    );
    await t.run((ctx) =>
      ctx.db.insert("roomMemberships", {
        roomId,
        userId: anonId,
        isSpectator: false,
        joinedAt: Date.now(),
      })
    );
    await rawVote(t, roomId, anonId);

    await t.run((ctx) =>
      Users.linkAnonymousToPermanent(ctx, {
        oldAuthUserId: "auth-anon",
        newAuthUserId: "auth-permanent",
        email: "p@example.com",
      })
    );

    // The spectator destination must not inherit the vote; transferring it would
    // recreate the "spectator holds a vote row" state that strands the countdown.
    const permVotes = await t.run((ctx) =>
      ctx.db
        .query("votes")
        .withIndex("by_room_user", (q) =>
          q.eq("roomId", roomId).eq("userId", permanentId)
        )
        .collect()
    );
    expect(permVotes).toHaveLength(0);
    expect(await votesFor(t, roomId)).toHaveLength(0);
  });

  it("transfers the vote to a non-spectator destination", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    // Destination: a PERMANENT, non-spectator user who has not voted.
    const permanentId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId: "auth-permanent",
        name: "P",
        accountType: "permanent" as const,
        createdAt: Date.now(),
      })
    );
    await t.run((ctx) =>
      ctx.db.insert("roomMemberships", {
        roomId,
        userId: permanentId,
        isSpectator: false,
        joinedAt: Date.now(),
      })
    );

    // Source: an ANONYMOUS user who voted as a non-spectator.
    const anonId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId: "auth-anon",
        name: "A",
        createdAt: Date.now(),
      })
    );
    await t.run((ctx) =>
      ctx.db.insert("roomMemberships", {
        roomId,
        userId: anonId,
        isSpectator: false,
        joinedAt: Date.now(),
      })
    );
    await rawVote(t, roomId, anonId);

    await t.run((ctx) =>
      Users.linkAnonymousToPermanent(ctx, {
        oldAuthUserId: "auth-anon",
        newAuthUserId: "auth-permanent",
        email: "p@example.com",
      })
    );

    // The vote survives, now owned by the permanent (non-spectator) user.
    const permVotes = await t.run((ctx) =>
      ctx.db
        .query("votes")
        .withIndex("by_room_user", (q) =>
          q.eq("roomId", roomId).eq("userId", permanentId)
        )
        .collect()
    );
    expect(permVotes).toHaveLength(1);
  });
});
