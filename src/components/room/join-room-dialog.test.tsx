/**
 * JoinRoomDialog — the name a person joins with is a person's name, so the
 * field stops at the person-name rule's limit. The session and the join
 * mutation are mocked at their seams.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("convex/react", () => ({
  useMutation: () => () => Promise.resolve(undefined),
}));

vi.mock("@/hooks/useEnsureSession", () => ({
  SESSION_FAILED: "Failed to create session. Please try again.",
  useEnsureSession: () => () => Promise.resolve("guest"),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: () => {}, error: () => {} },
}));

import { JoinRoomDialog } from "./join-room-dialog";

afterEach(cleanup);

describe("JoinRoomDialog — the name", () => {
  it("stops typing at the person name's limit", () => {
    render(<JoinRoomDialog roomId={"room-1" as Id<"rooms">} roomName="Planning" />);

    expect((screen.getByLabelText("Your Name") as HTMLInputElement).maxLength).toBe(50);
  });
});
