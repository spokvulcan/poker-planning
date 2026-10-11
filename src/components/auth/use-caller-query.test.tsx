/**
 * useCallerQuery: a read made as the viewer opens once Convex has confirmed
 * their session, and waits (answering undefined) for a visitor, while the
 * viewer loads, and while the server's first-paint viewer stands in
 * unconfirmed, so a page never takes an unread membership for none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { Viewer } from "./viewer";

const mocks = vi.hoisted(() => ({
  viewer: { status: "loading" } as Viewer,
  reads: [] as unknown[],
}));

vi.mock("./auth-provider", () => ({ useAuth: () => ({ viewer: mocks.viewer }) }));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => {
    mocks.reads.push(args);
    return args === "skip" ? undefined : { _id: "user-ann" };
  },
}));

import { api } from "@/convex/_generated/api";
import { useCallerQuery } from "./use-caller-query";

const ANN = { status: "signedIn", name: "Ann", avatarUrl: null, email: null, isPermanent: false } as const;

function read() {
  return renderHook(() => useCallerQuery(api.users.getMyMembership, { roomId: "room-1" as never })).result.current;
}

beforeEach(() => {
  mocks.reads = [];
});

afterEach(cleanup);

describe("useCallerQuery", () => {
  it("reads as the viewer once Convex has confirmed their session", () => {
    mocks.viewer = { ...ANN, confirmed: true };

    expect(read()).toEqual({ _id: "user-ann" });
    expect(mocks.reads).toEqual([{ roomId: "room-1" }]);
  });

  it.each<[string, Viewer]>([
    ["a visitor", { status: "visitor" }],
    ["a viewer still loading", { status: "loading" }],
    ["the server's viewer, before Convex confirms the session", { ...ANN, confirmed: false }],
  ])("waits for %s, answering nothing yet", (_, viewer) => {
    mocks.viewer = viewer;

    expect(read()).toBeUndefined();
    expect(mocks.reads).toEqual(["skip"]);
  });
});
