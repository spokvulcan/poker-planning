/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";
import * as Rooms from "./model/rooms";
import { timerReading } from "./roundTime";

// The round clock (ADR-0032): every round timed, the stretches nobody was
// there or nobody did anything, the session, the pause and the timebox, told
// through what people do in a room.

const modules = import.meta.glob("./**/*.*s");

const T0 = Date.UTC(2026, 9, 12, 10, 0, 0);
const S = 1000;
const MIN = 60 * S;

let t: T;
let roomId: Id<"rooms">;
let ownerId: Id<"users">;

const at = (ms: number) => vi.setSystemTime(T0 + ms);
const owner = () => as(t, "owner");
const clock = () => owner().query(api.roundClock.get, { roomId });
const breaks = () =>
  t.run((ctx) =>
    ctx.db
      .query("roomBreaks")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
const rounds = () =>
  t.run((ctx) =>
    ctx.db
      .query("votingTimestamps")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
const heartbeat = (subject = "owner", userId = ownerId) =>
  as(t, subject).mutation(api.presence.heartbeat, { roomId, userId, sessionId: `${subject}-tab`, interval: 10_000 });
const vote = (cardLabel = "5") => owner().mutation(api.votes.pickCard, { roomId, cardLabel });
const reveal = () => owner().mutation(api.rooms.showCards, { roomId });
const newRound = () => owner().mutation(api.rooms.resetGame, { roomId });
const issue = (title: string) => owner().mutation(api.issues.create, { roomId, title });
const startVoting = (issueId: Id<"issues">) => owner().mutation(api.issues.startVoting, { roomId, issueId });

/** The refusal a call is turned away with: its code and the message the person sees. */
async function refusalOf(call: Promise<unknown>): Promise<{ code: string; message?: string } | "resolved"> {
  try {
    await call;
    return "resolved";
  } catch (error) {
    if (error instanceof ConvexError) return error.data as { code: string; message: string };
    throw error;
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  t = withComponents(convexTest(schema, modules));
  ownerId = await seedUser(t, "owner");
  roomId = await owner().mutation(api.rooms.create, { name: "Planning" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("every round is timed", () => {
  it("a Quick Vote's first vote opens its round, the reveal ends its voting, and New Round ends it", async () => {
    at(10 * S);
    await vote();
    at(70 * S);
    await reveal();
    at(130 * S);
    await newRound();

    const [first, second] = await rounds();
    expect(first.issueId).toBeUndefined();
    expect(first).toMatchObject({
      votingStartedAt: T0 + 10 * S,
      revealedAt: T0 + 70 * S,
      votingEndedAt: T0 + 70 * S,
      endedAt: T0 + 130 * S,
      endedBy: "nextRound",
      roundNumber: 1,
    });
    expect(second).toMatchObject({ votingStartedAt: T0 + 130 * S, roundNumber: 1 });
    expect(second.endedAt).toBeUndefined();

    const view = await clock();
    expect(view.current).toEqual([{ startedAt: T0 + 130 * S }]);
    expect(view.items).toHaveLength(2);
  });

  it("an issue's re-votes join its time, and starting another issue ends its round as a move to another target", async () => {
    const a = await issue("Checkout flow");
    const b = await issue("Search");
    at(0);
    await startVoting(a);
    at(1 * MIN);
    await reveal();
    at(2 * MIN);
    await newRound();
    at(3 * MIN);
    await reveal();
    at(5 * MIN);
    await startVoting(b);

    const [, aLast] = await rounds();
    expect(aLast).toMatchObject({ issueId: a, roundNumber: 2, endedAt: T0 + 5 * MIN, endedBy: "nextTarget" });

    const view = await clock();
    expect(view.current).toEqual([{ issueId: b, startedAt: T0 + 5 * MIN }]);
    expect(view.items.map((item) => [item.title, item.rounds.length])).toEqual([
      ["Checkout flow", 2],
      ["Search", 1],
    ]);
  });

  it("dropping the issue ends its round and starts timing a Quick Vote", async () => {
    const a = await issue("Checkout flow");
    await startVoting(a);
    at(2 * MIN);
    await owner().mutation(api.issues.clearCurrentIssue, { roomId });

    const all = await rounds();
    expect(all.at(-2)).toMatchObject({ issueId: a, votingEndedAt: T0 + 2 * MIN, endedAt: T0 + 2 * MIN, endedBy: "dropped" });
    expect(all.at(-1)).toMatchObject({ votingStartedAt: T0 + 2 * MIN });
    expect(all.at(-1)?.issueId).toBeUndefined();
  });

});

describe("time-to-consensus is what the timer showed at the reveal that reached consensus (ADR-0034)", () => {
  /** What the room's timer shows now: the clock's facts, read as the browser reads them. */
  const timerShows = async (now: number) => {
    const room = await t.run((ctx) => ctx.db.get("rooms", roomId));
    return timerReading(await clock(), now, room!.lastActivityAt).time.ms;
  };
  const settled = async (issueId: Id<"issues">) =>
    (await t.run((ctx) => ctx.db.get("issues", issueId)))?.voteStats?.timeToConsensusMs;

  it("counts the discussion between rounds, and leaves out a pause", async () => {
    const a = await issue("Checkout flow");
    await startVoting(a);
    at(1 * MIN);
    await vote("?");
    at(2 * MIN);
    await reveal(); // a special card only: no consensus, so the team talks
    at(5 * MIN);
    await newRound();
    at(6 * MIN);
    await owner().mutation(api.roundClock.pause, { roomId });
    at(9 * MIN);
    await owner().mutation(api.roundClock.resume, { roomId });
    at(10 * MIN);
    await vote("3");
    at(11 * MIN);
    await reveal(); // consensus

    // 2 minutes' voting, 3 of discussion, then 6 minutes' voting less the 3-minute pause.
    expect(await settled(a)).toBe(8 * MIN);
    expect(await timerShows(T0 + 11 * MIN)).toBe(8 * MIN);
  });

  it("leaves out a long quiet past its first twenty minutes", async () => {
    const a = await issue("Checkout flow");
    await startVoting(a);
    at(1 * MIN);
    await vote("3");
    at(50 * MIN);
    await reveal(); // nobody did anything from 1 minute in until now

    expect(await settled(a)).toBe(21 * MIN);
    expect(await timerShows(T0 + 50 * MIN)).toBe(21 * MIN);
  });
});

describe("attendance and breaks", () => {
  it("attendance is kept to the minute: a gap of two minutes or more is a stretch nobody was there", async () => {
    await heartbeat();
    at(30 * S);
    await heartbeat(); // within the minute: nothing written
    at(90 * S);
    await heartbeat();
    at(3 * MIN);
    await heartbeat(); // 90 s since the last kept one: not a gap
    at(15 * MIN);
    await heartbeat();

    expect(await breaks()).toEqual([expect.objectContaining({ from: T0 + 3 * MIN, to: T0 + 15 * MIN, kind: "away" })]);
  });

  it("a room nobody had open for half an hour starts a new session, and the old session's timebox goes with it", async () => {
    await heartbeat();
    expect((await clock()).sessionStartedAt).toBe(T0);
    await owner().mutation(api.roundClock.startTimebox, { roomId, durationMs: 2 * MIN });

    at(45 * MIN);
    await heartbeat();

    const view = await clock();
    expect(view.sessionStartedAt).toBe(T0 + 45 * MIN);
    expect(view.timebox).toBeNull();
    expect(await breaks()).toEqual([expect.objectContaining({ from: T0, to: T0 + 45 * MIN, kind: "away" })]);
  });

  it("a long quiet before an action is left out past its first twenty minutes, once however often the action passes", async () => {
    await vote();
    at(50 * MIN);
    await t.run(async (ctx) => {
      const room = (await ctx.db.get("rooms", roomId))!;
      await Rooms.updateRoomActivity(ctx, room);
      await Rooms.updateRoomActivity(ctx, room);
    });

    expect(await breaks()).toEqual([expect.objectContaining({ from: T0 + 20 * MIN, to: T0 + 50 * MIN, kind: "idle" })]);
  });

  it("a round left open since before the clock kept attendance has its past left out", async () => {
    await t.run((ctx) =>
      ctx.db.insert("votingTimestamps", { roomId, votingStartedAt: T0 - 2 * 60 * MIN, roundNumber: 1 })
    );
    await heartbeat();

    expect(await breaks()).toEqual([expect.objectContaining({ from: T0 - 2 * 60 * MIN, to: T0, kind: "away" })]);
  });
});

describe("the pause", () => {
  it("stops the clock until it is lifted, and the stretch it held becomes a break", async () => {
    await owner().mutation(api.roundClock.pause, { roomId });
    expect((await clock()).pausedAt).toBe(T0);

    at(5 * MIN);
    await owner().mutation(api.roundClock.resume, { roomId });

    expect((await clock()).pausedAt).toBeNull();
    expect(await breaks()).toEqual([expect.objectContaining({ from: T0, to: T0 + 5 * MIN, kind: "pause" })]);
  });

  it("a pause nobody lifted ends when someone votes, or when the round moves on", async () => {
    await owner().mutation(api.roundClock.pause, { roomId });
    at(3 * MIN);
    await vote();
    expect((await clock()).pausedAt).toBeNull();

    await owner().mutation(api.roundClock.pause, { roomId });
    at(4 * MIN);
    await newRound();
    expect((await clock()).pausedAt).toBeNull();
    expect((await breaks()).map((b) => [b.from - T0, b.to - T0, b.kind])).toEqual([
      [0, 3 * MIN, "pause"],
      [3 * MIN, 4 * MIN, "pause"],
    ]);
  });
});

describe("the timebox", () => {
  it("a flip runs for everyone and is remembered as the next flip's length", async () => {
    expect((await clock()).timeboxMs).toBe(2 * MIN);
    await owner().mutation(api.roundClock.startTimebox, { roomId, durationMs: 3 * MIN });

    const view = await clock();
    expect(view.timebox).toEqual({ startedAt: T0, durationMs: 3 * MIN });
    expect(view.timeboxMs).toBe(3 * MIN);
  });

  it("+1 min adds a minute, and one already over gets a minute from now", async () => {
    await owner().mutation(api.roundClock.startTimebox, { roomId, durationMs: 2 * MIN });
    at(30 * S);
    await owner().mutation(api.roundClock.extendTimebox, { roomId });
    expect((await clock()).timebox?.durationMs).toBe(3 * MIN);

    at(10 * MIN);
    await owner().mutation(api.roundClock.extendTimebox, { roomId });
    expect((await clock()).timebox?.durationMs).toBe(11 * MIN);
  });

  it("ends when the round moves on, not at the reveal, and stops when put away", async () => {
    await owner().mutation(api.roundClock.startTimebox, { roomId, durationMs: 2 * MIN });
    await vote();
    await reveal();
    expect((await clock()).timebox).not.toBeNull();
    await newRound();
    expect((await clock()).timebox).toBeNull();

    await owner().mutation(api.roundClock.startTimebox, { roomId, durationMs: 2 * MIN });
    await owner().mutation(api.roundClock.stopTimebox, { roomId });
    expect((await clock()).timebox).toBeNull();
  });

  it("runs from ten seconds to thirty minutes", async () => {
    expect(await refusalOf(owner().mutation(api.roundClock.startTimebox, { roomId, durationMs: 5 * S }))).toMatchObject({
      code: "forbidden",
    });
    expect(
      await refusalOf(owner().mutation(api.roundClock.startTimebox, { roomId, durationMs: 31 * MIN }))
    ).toMatchObject({ code: "forbidden" });
  });
});

describe("who may run it", () => {
  it("the timebox and the pause follow the room's game flow permission", async () => {
    await join(t, roomId, "ann");
    await t.run((ctx) =>
      ctx.db.patch("rooms", roomId, {
        permissions: { revealCards: "everyone", gameFlow: "facilitators", issueManagement: "everyone", roomSettings: "everyone" },
      })
    );

    const ann = as(t, "ann");
    expect(await refusalOf(ann.mutation(api.roundClock.startTimebox, { roomId, durationMs: 2 * MIN }))).toMatchObject({
      code: "forbidden",
    });
    expect(await refusalOf(ann.mutation(api.roundClock.pause, { roomId }))).toMatchObject({ code: "forbidden" });
    expect(await refusalOf(owner().mutation(api.roundClock.pause, { roomId }))).toBe("resolved");
  });

  it("only the room's members read it", async () => {
    await seedUser(t, "stranger");
    await expect(as(t, "stranger").query(api.roundClock.get, { roomId })).rejects.toThrow();
  });

  it("a retro has no round clock", async () => {
    const retroId = await owner().mutation(api.retro.create, { name: "Sprint 41 retro" });
    await as(t, "owner").mutation(api.presence.heartbeat, {
      roomId: retroId,
      userId: ownerId,
      sessionId: "retro-tab",
      interval: 10_000,
    });
    const attendance = await t.run((ctx) =>
      ctx.db
        .query("roomAttendance")
        .withIndex("by_room", (q) => q.eq("roomId", retroId))
        .collect()
    );
    expect(attendance).toEqual([]);
    expect(
      await refusalOf(owner().mutation(api.roundClock.startTimebox, { roomId: retroId, durationMs: 2 * MIN }))
    ).toMatchObject({ code: "missing" });
  });
});
