/**
 * RoomPresenceProvider — one presence subscription per viewer (candidate C12).
 *
 * Pins the four properties of the room presence module:
 *   1. A single `usePresence` instantiation per mounted room tree, no matter
 *      how many consumers read the roster (previously each of the two
 *      always-mounted consumers subscribed and heartbeated on its own).
 *   2. The one roster ordering rule: online-first with joinedAt tiebreak, plus
 *      the settings panel's current-user-first variant.
 *   3. Demo (ADR-0003): under DemoSimulationProvider the roster is derived
 *      locally (all online) and `usePresence` is never called — zero
 *      subscriptions at the new seam, same as the old one.
 *   4. Re-render isolation: a presence tick re-renders only the context
 *      consumers — never a sibling stand-in for the ReactFlow subtree. The
 *      mock drives the tick the way Convex would: a state update INSIDE the
 *      provider's `usePresence` hook, so the provider re-renders while the
 *      canvas element (created by the non-re-rendering parent) stays
 *      reference-identical and React bails out of that subtree.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface PresenceEntry {
  userId: string;
  online: boolean;
  lastDisconnected: number;
}

// Hoisted capture buffers — referenced inside the (hoisted) vi.mock factory.
const spy = vi.hoisted(() => ({
  calls: [] as { roomId: unknown; userId: unknown }[],
  data: undefined as PresenceEntry[] | undefined,
  emitTick: null as null | (() => void),
}));

vi.mock("@convex-dev/presence/react", async () => {
  const { useEffect, useState } = await import("react");
  return {
    default: function usePresenceMock(
      _presenceApi: unknown,
      roomId: unknown,
      userId: unknown,
    ) {
      spy.calls.push({ roomId, userId });
      // A presence tick, fired the way the real hook delivers one: new list
      // data arrives and the hook's own state bumps, re-rendering exactly the
      // component that called it (the provider) — nothing above it.
      const [, setVersion] = useState(0);
      useEffect(() => {
        spy.emitTick = () => setVersion((v) => v + 1);
        return () => {
          spy.emitTick = null;
        };
      }, []);
      return spy.data;
    },
  };
});

import { act, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomUserData } from "@/convex/model/users";
import {
  orderUsersByPresence,
  type UserWithPresence,
} from "@/hooks/useRoomPresence";
import {
  RoomPresenceProvider,
  usePresenceRoster,
} from "./room-presence";
import { DemoSimulationProvider } from "./demo/DemoSimulationProvider";

function makeUser(id: string, name: string, joinedAt: number): RoomUserData {
  return {
    _id: id as Id<"users">,
    name,
    isSpectator: false,
    role: "participant",
    joinedAt,
    membershipId: `${id}-membership` as Id<"roomMemberships">,
  };
}

const USERS = [
  makeUser("u1", "Ada", 100),
  makeUser("u2", "Boris", 200),
  makeUser("u3", "Cleo", 300),
];

/** Captures the roster a consumer sees, and counts renders (spy calls). */
const observed = {
  consumerRender: vi.fn(),
  canvasRender: vi.fn(),
};

function lastRoster(): UserWithPresence[] {
  const calls = observed.consumerRender.mock.calls;
  return calls[calls.length - 1][0] as UserWithPresence[];
}

function RosterConsumer({
  currentUserId,
}: {
  currentUserId?: string;
}): ReactNode {
  observed.consumerRender(usePresenceRoster(currentUserId));
  return null;
}

/** Stand-in for the ReactFlow subtree: a sibling that never reads presence. */
function CanvasStandIn(): ReactNode {
  observed.canvasRender();
  return createElement("div", { "data-testid": "canvas-stand-in" });
}

function renderRoomTree(children?: ReactNode): void {
  render(
    createElement(
      RoomPresenceProvider,
      { roomId: "room-1", userId: "u1", users: USERS },
      children ?? createElement(RosterConsumer),
    ),
  );
}

beforeEach(() => {
  spy.calls.length = 0;
  spy.data = undefined;
  spy.emitTick = null;
  observed.consumerRender.mockClear();
  observed.canvasRender.mockClear();
});

describe("RoomPresenceProvider — one subscription per viewer", () => {
  it("instantiates usePresence once per mounted room tree regardless of consumer count", () => {
    render(
      createElement(
        RoomPresenceProvider,
        { roomId: "room-1", userId: "u1", users: USERS },
        // The two real consumers: nav avatars (plain ordering) and the
        // settings roster (current-user-first variant).
        createElement(RosterConsumer),
        createElement(RosterConsumer, { currentUserId: "u1" }),
      ),
    );

    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toEqual({ roomId: "room-1", userId: "u1" });
  });
});

describe("orderUsersByPresence — the one ordering rule", () => {
  const withPresence = (
    user: RoomUserData,
    isOnline: boolean,
  ): UserWithPresence => ({ ...user, isOnline, lastSeen: null });

  it("orders online-first with joinedAt tiebreak", () => {
    const roster = [
      withPresence(USERS[2], false), // Cleo, offline
      withPresence(USERS[1], true), // Boris, online, joined 200
      withPresence(USERS[0], true), // Ada, online, joined 100
    ];

    expect(orderUsersByPresence(roster).map((u) => u._id)).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
  });

  it("pins the current user first in the current-user-first variant", () => {
    const roster = [
      withPresence(USERS[0], true), // Ada online
      withPresence(USERS[1], false), // Boris offline — but current
      withPresence(USERS[2], true), // Cleo online
    ];

    expect(orderUsersByPresence(roster, "u2").map((u) => u._id)).toEqual([
      "u2",
      "u1",
      "u3",
    ]);
  });

  it("merges presence state into the roster (online flag + lastSeen)", () => {
    spy.data = [
      { userId: "u2", online: true, lastDisconnected: 0 },
      { userId: "u3", online: false, lastDisconnected: 1234 },
    ];
    renderRoomTree();

    const byId = new Map(lastRoster().map((u) => [u._id as string, u]));
    expect(byId.get("u1")).toMatchObject({ isOnline: false, lastSeen: null });
    expect(byId.get("u2")).toMatchObject({ isOnline: true, lastSeen: null });
    expect(byId.get("u3")).toMatchObject({ isOnline: false, lastSeen: 1234 });
  });
});

describe("RoomPresenceProvider in demo — subscription-free (ADR-0003)", () => {
  it("derives the all-online roster locally without calling usePresence", () => {
    render(
      createElement(
        DemoSimulationProvider,
        null,
        createElement(
          RoomPresenceProvider,
          { roomId: "demo-room", userId: "viewer", users: USERS },
          createElement(RosterConsumer),
        ),
      ),
    );

    expect(spy.calls).toHaveLength(0);
    expect(lastRoster()).toHaveLength(USERS.length);
    expect(lastRoster().every((u) => u.isOnline && u.lastSeen === null)).toBe(
      true,
    );
  });
});

describe("RoomPresenceProvider — re-render isolation", () => {
  it("a presence tick re-renders only the roster consumers, not the canvas subtree", () => {
    render(
      createElement(
        RoomPresenceProvider,
        { roomId: "room-1", userId: "u1", users: USERS },
        createElement(CanvasStandIn),
        createElement(RosterConsumer),
      ),
    );
    expect(observed.canvasRender).toHaveBeenCalledTimes(1);
    expect(observed.consumerRender).toHaveBeenCalledTimes(1);

    // Boris comes online — the presence list changes and the tick fires.
    act(() => {
      spy.data = [{ userId: "u2", online: true, lastDisconnected: 0 }];
      spy.emitTick!();
    });

    expect(observed.consumerRender).toHaveBeenCalledTimes(2);
    expect(lastRoster()[0]._id).toBe("u2"); // new data reached the consumer
    expect(observed.canvasRender).toHaveBeenCalledTimes(1); // canvas untouched
  });
});
