/**
 * `/room/new` says why a room wasn't created: a refusal in its own words,
 * any other failure in the page's copy, never the error's text, which
 * production redacts. The session seam (useEnsureSession) and the create
 * mutation are stand-ins the test answers.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { refusal } from "@/convex/model/refusal";

const mocks = vi.hoisted(() => ({
  // What the session and the create do: go through, or fail with this error.
  sessionFails: null as Error | null,
  createFails: null as Error | null,
  toasts: [] as string[],
  pushed: [] as string[],
}));

vi.mock("convex/react", () => ({
  useMutation: () => async () => {
    if (mocks.createFails) throw mocks.createFails;
    return "room-1";
  },
}));

vi.mock("@/hooks/useEnsureSession", () => ({
  SESSION_FAILED: "Failed to create session. Please try again.",
  useEnsureSession: () => async () => {
    if (mocks.sessionFails) throw mocks.sessionFails;
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (path: string) => mocks.pushed.push(path) }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: (message: string) => mocks.toasts.push(message) } }));
vi.mock("@/lib/analytics", () => ({ trackConversion: () => {} }));
vi.mock("@/hooks/use-copy-room-url-to-clipboard", () => ({
  useCopyRoomUrlToClipboard: () => ({ copyRoomUrlToClipboard: async () => {} }),
}));

// The page's chrome, with its own account menu.
vi.mock("@/components/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/footer", () => ({ Footer: () => null }));

import { CreateContent } from "./create-content";

async function create() {
  render(<CreateContent />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create Game" })));
}

afterEach(() => {
  cleanup();
  mocks.sessionFails = null;
  mocks.createFails = null;
  mocks.toasts = [];
  mocks.pushed = [];
});

describe("CreateContent's failures", () => {
  it("opens the room it created", async () => {
    await create();

    expect(mocks.pushed).toEqual(["/room/room-1"]);
    expect(mocks.toasts).toEqual([]);
  });

  it("says a refused create in the refusal's own words", async () => {
    mocks.createFails = refusal("forbidden", "Room name must be 100 characters or less");
    await create();

    expect(mocks.toasts).toEqual(["Room name must be 100 characters or less"]);
    expect(mocks.pushed).toEqual([]);
  });

  it("says a failed create in its own words when the server's were redacted", async () => {
    mocks.createFails = new Error("[CONVEX M(rooms:create)] [Request ID: 7c1f] Server Error");
    await create();

    expect(mocks.toasts).toEqual(["Failed to create room. Please try again."]);
  });

  it("says a failed session in its own words", async () => {
    mocks.sessionFails = new Error("BAD_REQUEST");
    await create();

    expect(mocks.toasts).toEqual(["Failed to create session. Please try again."]);
    expect(mocks.pushed).toEqual([]);
  });
});
