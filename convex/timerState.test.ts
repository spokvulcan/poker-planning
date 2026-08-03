/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import {
  calculateCurrentTime,
  formatTimerTime,
  validateTimerAction,
  type TimerState,
} from "./timerState";
import * as Timer from "./model/timer";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

const NOW = new Date("2026-08-03T12:00:00Z").getTime();

function stopped(overrides: Partial<TimerState> = {}): TimerState {
  return {
    startedAt: null,
    pausedAt: null,
    elapsedSeconds: 0,
    isRunning: false,
    lastUpdatedBy: null,
    lastAction: null,
    ...overrides,
  };
}

describe("calculateCurrentTime", () => {
  it("a stopped timer reads its accumulated elapsed seconds", () => {
    const t = calculateCurrentTime(stopped({ elapsedSeconds: 42 }), NOW);
    expect(t).toEqual({
      currentSeconds: 42,
      isRunning: false,
      displayTime: "0:42",
    });
  });

  it("a reset timer reads 0:00", () => {
    const t = calculateCurrentTime(stopped(), NOW);
    expect(t.currentSeconds).toBe(0);
    expect(t.displayTime).toBe("0:00");
  });

  it("a running timer adds the time since startedAt to the accumulated elapsed", () => {
    // Paused at 30s, restarted 90s ago: 30 + 90 = 120s.
    const t = calculateCurrentTime(
      stopped({
        elapsedSeconds: 30,
        isRunning: true,
        startedAt: NOW - 90_000,
        lastAction: "start",
      }),
      NOW
    );
    expect(t).toEqual({
      currentSeconds: 120,
      isRunning: true,
      displayTime: "2:00",
    });
  });

  it("floors fractional seconds from the running segment", () => {
    const t = calculateCurrentTime(
      stopped({ isRunning: true, startedAt: NOW - 65_900 }),
      NOW
    );
    expect(t.currentSeconds).toBe(65);
    expect(t.displayTime).toBe("1:05");
  });

  it("treats a missing isRunning (pre-sync rows) as stopped", () => {
    const legacy: TimerState = stopped({ elapsedSeconds: 7 });
    delete legacy.isRunning;
    const t = calculateCurrentTime(legacy, NOW);
    expect(t).toEqual({
      currentSeconds: 7,
      isRunning: false,
      displayTime: "0:07",
    });
  });

  it("a running flag without startedAt contributes nothing", () => {
    const t = calculateCurrentTime(
      stopped({ elapsedSeconds: 5, isRunning: true, startedAt: null }),
      NOW
    );
    expect(t.currentSeconds).toBe(5);
  });
});

describe("formatTimerTime", () => {
  it("formats MM:SS with zero-padded seconds and unbounded minutes", () => {
    expect(formatTimerTime(0)).toBe("0:00");
    expect(formatTimerTime(9)).toBe("0:09");
    expect(formatTimerTime(59)).toBe("0:59");
    expect(formatTimerTime(60)).toBe("1:00");
    expect(formatTimerTime(599)).toBe("9:59");
    expect(formatTimerTime(600)).toBe("10:00");
    expect(formatTimerTime(3600)).toBe("60:00");
  });

  it("floors fractional input", () => {
    expect(formatTimerTime(65.9)).toBe("1:05");
  });
});

describe("validateTimerAction", () => {
  it("start requires a stopped timer", () => {
    expect(() =>
      validateTimerAction(stopped({ isRunning: true }), "start")
    ).toThrow("Timer is already running");
    expect(() => validateTimerAction(stopped(), "start")).not.toThrow();
  });

  it("pause requires a running timer", () => {
    expect(() => validateTimerAction(stopped(), "pause")).toThrow(
      "Timer is not running"
    );
    expect(() =>
      validateTimerAction(stopped({ isRunning: true }), "pause")
    ).not.toThrow();
  });

  it("reset is always allowed", () => {
    expect(() => validateTimerAction(stopped(), "reset")).not.toThrow();
    expect(() =>
      validateTimerAction(stopped({ isRunning: true }), "reset")
    ).not.toThrow();
  });

  it("rejects unknown actions", () => {
    expect(() =>
      validateTimerAction(stopped(), "bogus" as "start")
    ).toThrow("Invalid timer action: bogus");
  });
});

// --- Model transitions (convex-test, pattern: votingRound.test.ts) ---------

async function seedRoom(t: T): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    })
  );
}

async function seedUser(t: T): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId: `auth-${crypto.randomUUID()}`,
      name: "U",
      createdAt: Date.now(),
    })
  );
}

async function seedTimerNode(
  t: T,
  roomId: Id<"rooms">,
  data: TimerState = stopped(),
  nodeId = "timer"
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("canvasNodes", {
      roomId,
      nodeId,
      type: "timer",
      position: { x: 0, y: 0 },
      data,
      lastUpdatedAt: Date.now(),
    })
  );
}

async function readTimerData(
  t: T,
  roomId: Id<"rooms">,
  nodeId = "timer"
): Promise<TimerState> {
  return t.run(async (ctx) => {
    const node = await ctx.db
      .query("canvasNodes")
      .withIndex("by_room_node", (q) =>
        q.eq("roomId", roomId).eq("nodeId", nodeId)
      )
      .unique();
    return (node as { data: TimerState } | null)!.data;
  });
}

describe("Timer.updateTimerState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("start sets isRunning, startedAt, and the tracking fields", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await seedUser(t);
    await seedTimerNode(t, roomId);

    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
    );

    expect(await readTimerData(t, roomId)).toEqual({
      startedAt: NOW,
      pausedAt: null,
      elapsedSeconds: 0,
      isRunning: true,
      lastUpdatedBy: userId,
      lastAction: "start",
    });
  });

  it("start on a running timer throws through the model interface", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await seedUser(t);
    await seedTimerNode(t, roomId, stopped({ isRunning: true, startedAt: NOW }));

    await expect(
      t.run((ctx) =>
        Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
      )
    ).rejects.toThrow("Timer is already running");
  });

  it("pause accumulates the running segment into elapsedSeconds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await seedUser(t);

    vi.setSystemTime(NOW);
    await seedTimerNode(t, roomId);
    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
    );

    vi.setSystemTime(NOW + 90_500);
    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "pause", userId })
    );

    expect(await readTimerData(t, roomId)).toEqual({
      startedAt: null,
      pausedAt: NOW + 90_500,
      elapsedSeconds: 90, // floored from 90.5
      isRunning: false,
      lastUpdatedBy: userId,
      lastAction: "pause",
    });
  });

  it("two full pause/resume cycles accumulate both running segments", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await seedUser(t);

    vi.setSystemTime(NOW);
    await seedTimerNode(t, roomId);
    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
    );

    // First cycle: run 60s, pause.
    vi.setSystemTime(NOW + 60_000);
    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "pause", userId })
    );

    // Second cycle: resume 90s later, run 30s, pause again.
    vi.setSystemTime(NOW + 150_000);
    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
    );
    vi.setSystemTime(NOW + 180_000);
    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "pause", userId })
    );

    const data = await readTimerData(t, roomId);
    expect(data).toEqual({
      startedAt: null,
      pausedAt: NOW + 180_000,
      elapsedSeconds: 90, // 60s first segment + 30s second segment
      isRunning: false,
      lastUpdatedBy: userId,
      lastAction: "pause",
    });
    // And the reading matches the accumulated state.
    expect(calculateCurrentTime(data, NOW + 180_000).displayTime).toBe("1:30");
  });

  it("pause on a stopped timer throws through the model interface", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await seedUser(t);
    await seedTimerNode(t, roomId);

    await expect(
      t.run((ctx) =>
        Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "pause", userId })
      )
    ).rejects.toThrow("Timer is not running");
  });

  it("reset zeroes the accumulated time and stops the timer", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await seedUser(t);
    await seedTimerNode(
      t,
      roomId,
      stopped({ elapsedSeconds: 300, isRunning: true, startedAt: NOW })
    );

    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "reset", userId })
    );

    expect(await readTimerData(t, roomId)).toEqual({
      startedAt: null,
      pausedAt: null,
      elapsedSeconds: 0,
      isRunning: false,
      lastUpdatedBy: userId,
      lastAction: "reset",
    });
  });

  it("throws when the timer node does not exist", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await seedUser(t);

    await expect(
      t.run((ctx) =>
        Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
      )
    ).rejects.toThrow("Timer node not found");
  });
});
