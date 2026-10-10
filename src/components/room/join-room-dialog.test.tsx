/**
 * JoinRoomDialog: one join at a time. The Join button is disabled while a
 * join is in flight, and Enter in the name field keeps to the same rule, so
 * a second Enter can't start a second sign-in and join over the first. The
 * name a person joins with is a person's name, so the field stops at the
 * person-name rule's limit, and a blank one is refused in the rule's words.
 * A failed join says why in a refusal's own words, and otherwise in the
 * dialog's copy, never the error's redacted text. The session seam
 * (useEnsureSession) and the join mutation are stand-ins the test answers.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { refusal } from "@/convex/model/refusal";

const mocks = vi.hoisted(() => ({
  // One per session bootstrap started, each in flight until the test answers it.
  sessions: [] as { resolve: () => void; reject: (error: Error) => void }[],
  joins: [] as unknown[],
  // What the next join does: lands, or fails with this error.
  joinFails: null as Error | null,
  toasts: [] as string[],
}));

vi.mock("convex/react", () => ({
  useMutation: () => async (args: unknown) => {
    mocks.joins.push(args);
    if (mocks.joinFails) throw mocks.joinFails;
  },
}));

vi.mock("@/hooks/useEnsureSession", () => ({
  SESSION_FAILED: "Failed to create session. Please try again.",
  useEnsureSession: () => () =>
    new Promise<void>((resolve, reject) => {
      mocks.sessions.push({ resolve, reject });
    }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: (message: string) => mocks.toasts.push(message) },
}));

import type { Id } from "@/convex/_generated/dataModel";
import { JoinRoomDialog } from "./join-room-dialog";

afterEach(() => {
  cleanup();
  mocks.sessions = [];
  mocks.joins = [];
  mocks.joinFails = null;
  mocks.toasts = [];
});

/** Types a name and presses Enter, as a person joining does. */
function joinAs(name: string) {
  render(<JoinRoomDialog roomId={"room-1" as Id<"rooms">} roomName="Sprint 12" />);
  const field = screen.getByLabelText("Your Name");
  fireEvent.change(field, { target: { value: name } });
  fireEvent.keyDown(field, { key: "Enter" });
}

describe("JoinRoomDialog's failures", () => {
  it("refuses a blank name in the person-name rule's words", () => {
    joinAs("   ");

    expect(mocks.toasts).toEqual(["Name is required"]);
    expect(mocks.sessions).toHaveLength(0);
  });

  it("says a refused join in the refusal's own words", async () => {
    mocks.joinFails = refusal("forbidden", "Name must be 50 characters or less");
    joinAs("Ann");
    await act(async () => mocks.sessions[0].resolve());

    expect(mocks.toasts).toEqual(["Name must be 50 characters or less"]);
  });

  it("says a failed join in its own words when the server's were redacted", async () => {
    mocks.joinFails = new Error("[CONVEX M(users:join)] [Request ID: 7c1f] Server Error");
    joinAs("Ann");
    await act(async () => mocks.sessions[0].resolve());

    expect(mocks.toasts).toEqual(["Failed to join room"]);
  });

  it("says a failed session in its own words, and joins no one", async () => {
    joinAs("Ann");
    await act(async () => mocks.sessions[0].reject(new Error("BAD_REQUEST")));

    expect(mocks.toasts).toEqual(["Failed to create session. Please try again."]);
    expect(mocks.joins).toEqual([]);
  });
});

describe("JoinRoomDialog", () => {
  it("ignores Enter while a join is in flight", async () => {
    render(<JoinRoomDialog roomId={"room-1" as Id<"rooms">} roomName="Sprint 12" />);
    const name = screen.getByLabelText("Your Name");
    fireEvent.change(name, { target: { value: "Ann" } });

    fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(mocks.sessions).toHaveLength(1);

    await act(async () => mocks.sessions[0].resolve());
    expect(mocks.joins).toEqual([{ roomId: "room-1", name: "Ann", isSpectator: false }]);
  });

  it("stops typing at the person name's limit", () => {
    render(<JoinRoomDialog roomId={"room-1" as Id<"rooms">} roomName="Sprint 12" />);

    expect((screen.getByLabelText("Your Name") as HTMLInputElement).maxLength).toBe(50);
  });
});
