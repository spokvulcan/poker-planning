/**
 * useCanvasNodes — adapter-level identity guard (#229, user story 9).
 *
 * The derivation itself is covered by the pure buildCanvasNodes tests; here we
 * pin the ONE contract the adapter adds on top: referential stability of the
 * returned `nodes` and `edges` arrays across re-renders, including unrelated
 * prop churn. This is the render-loop regression guard at the hook layer
 * (prior art: the canvas actions hook tests).
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";

// Hoisted stable query results shared with the (hoisted) vi.mock factory: the
// adapter must see referentially stable subscription data so any identity
// churn the test observes is the adapter's own doing.
const stable = vi.hoisted(() => ({
  canvasNodes: [
    {
      roomId: "room-1",
      nodeId: "session-current",
      position: { x: 0, y: -300 },
      lastUpdatedAt: 0,
      type: "session",
      data: {},
    },
    {
      roomId: "room-1",
      nodeId: "player-user-1",
      position: { x: 0, y: 0 },
      lastUpdatedAt: 0,
      type: "player",
      data: { userId: "user-1" },
    },
  ],
  currentIssue: { _id: "issue-1", title: "Checkout flow" },
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (query: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(query);
      if (name === "canvas:getCanvasNodes") return stable.canvasNodes;
      if (name === "issues:getCurrent") return stable.currentIssue;
      return undefined;
    },
  };
});

import { useCanvasNodes } from "./useCanvasNodes";

const ROOM_ID = "room-1" as Id<"rooms">;
const USER_ID = "user-1" as Id<"users">;

const ROOM_DATA: RoomWithRelatedData = {
  room: {
    _id: ROOM_ID,
    _creationTime: 0,
    name: "Sprint 42",
    autoCompleteVoting: false,
    isGameOver: false,
    createdAt: 0,
    lastActivityAt: 0,
    retained: false,
  },
  users: [
    {
      _id: USER_ID,
      name: "Alice",
      isSpectator: false,
      role: "participant",
      joinedAt: 0,
      membershipId: "membership-1" as Id<"roomMemberships">,
    },
  ],
  votes: [],
  isOwnerAbsent: false,
};

// Frozen-identity handlers, as the canvas-actions module guarantees in prod.
const HANDLERS = {
  onRevealCards: () => {},
  onResetGame: () => {},
  onCardSelect: () => {},
  onToggleAutoComplete: () => {},
  onCancelAutoReveal: () => {},
  onOpenIssuesPanel: () => {},
  onUpdateNoteContent: () => {},
  onDeleteNote: () => {},
};

/**
 * A fresh props object per render, with stable field identities — the shape
 * of a real parent re-render.
 */
function baseProps(): Parameters<typeof useCanvasNodes>[0] {
  return {
    roomId: ROOM_ID,
    roomData: ROOM_DATA,
    currentUserId: USER_ID,
    selectedCardValue: null as string | null,
    ...HANDLERS,
  };
}

describe("useCanvasNodes — referential stability", () => {
  it("keeps nodes and edges identities across a re-render with equal props", () => {
    const { result, rerender } = renderHook(useCanvasNodes, {
      initialProps: baseProps(),
    });
    const first = result.current;
    expect(first.nodes.length).toBeGreaterThan(0);
    expect(first.edges.length).toBeGreaterThan(0);

    rerender(baseProps());

    expect(result.current.nodes).toBe(first.nodes);
    expect(result.current.edges).toBe(first.edges);
  });

  it("keeps the edges identity under nodes-only prop churn", () => {
    const { result, rerender } = renderHook(useCanvasNodes, {
      initialProps: baseProps(),
    });
    const first = result.current;

    // Card selection and permission decisions feed only the nodes builder.
    rerender({ ...baseProps(), selectedCardValue: "8" });
    rerender({
      ...baseProps(),
      selectedCardValue: "8",
      canRevealCards: { allowed: false as const, message: "Owner only" },
    });

    expect(result.current.nodes).not.toBe(first.nodes);
    expect(result.current.edges).toBe(first.edges);
  });

  it("verifies the mocked subscriptions actually feed the derivation", () => {
    const { result } = renderHook(useCanvasNodes, {
      initialProps: baseProps(),
    });

    expect(result.current.currentIssue).toEqual({
      _id: "issue-1",
      title: "Checkout flow",
    });
    expect(result.current.nodes.some((n) => n.type === "session")).toBe(true);
    expect(result.current.nodes.some((n) => n.type === "player")).toBe(true);
  });
});
