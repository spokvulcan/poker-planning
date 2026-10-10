/**
 * JoinRoomDialog: one join at a time. The Join button is disabled while a
 * join is in flight, and Enter in the name field keeps to the same rule, so
 * a second Enter can't start a second sign-in and join over the first. The
 * name a person joins with is a person's name, so the field stops at the
 * person-name rule's limit. The session seam (useEnsureSession) and the join
 * mutation are stand-ins the test answers.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  // One per session bootstrap started, each in flight until the test answers it.
  sessions: [] as ((authUserId: string) => void)[],
  joins: [] as unknown[],
}));

vi.mock("convex/react", () => ({
  useMutation: () => async (args: unknown) => {
    mocks.joins.push(args);
  },
}));

vi.mock("@/hooks/useEnsureSession", () => ({
  SESSION_FAILED: "Failed to create session. Please try again.",
  useEnsureSession: () => () =>
    new Promise<string>((resolve) => {
      mocks.sessions.push(resolve);
    }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: () => {} },
}));

import type { Id } from "@/convex/_generated/dataModel";
import { JoinRoomDialog } from "./join-room-dialog";

afterEach(() => {
  cleanup();
  mocks.sessions = [];
  mocks.joins = [];
});

describe("JoinRoomDialog", () => {
  it("ignores Enter while a join is in flight", async () => {
    render(<JoinRoomDialog roomId={"room-1" as Id<"rooms">} roomName="Sprint 12" />);
    const name = screen.getByLabelText("Your Name");
    fireEvent.change(name, { target: { value: "Ann" } });

    fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(mocks.sessions).toHaveLength(1);

    await act(async () => mocks.sessions[0]("guest-1"));
    expect(mocks.joins).toEqual([
      { roomId: "room-1", name: "Ann", isSpectator: false, authUserId: "guest-1" },
    ]);
  });

  it("stops typing at the person name's limit", () => {
    render(<JoinRoomDialog roomId={"room-1" as Id<"rooms">} roomName="Sprint 12" />);

    expect((screen.getByLabelText("Your Name") as HTMLInputElement).maxLength).toBe(50);
  });
});
