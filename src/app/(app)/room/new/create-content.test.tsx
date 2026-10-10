/**
 * `/room/new` says why a room wasn't created: a refusal in its own words,
 * any other failure in the page's copy, never the error's text, which
 * production redacts. And it deals the deck picked, a custom one as typed
 * onto the table. The session seam (useEnsureSession) and the create
 * mutation are stand-ins the test answers.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { refusal } from "@/convex/model/refusal";

const mocks = vi.hoisted(() => ({
  // What the session and the create do: go through, or fail with this error.
  sessionFails: null as Error | null,
  createFails: null as Error | null,
  toasts: [] as string[],
  pushed: [] as string[],
  // What each create was asked for.
  created: [] as { votingScale: unknown }[],
}));

vi.mock("convex/react", () => ({
  useMutation: () => async (args: { votingScale: unknown }) => {
    mocks.created.push(args);
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

// The choice control measures its options; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const startButton = () => screen.getByRole("button", { name: "Start estimating" });

async function start() {
  await act(async () => fireEvent.click(startButton()));
}

async function create() {
  render(<CreateContent />);
  await start();
}

/** Picks Custom and types `text` into the table's field, as a keyboard would. */
function typeCards(text: string) {
  fireEvent.change(cardField(), { target: { value: text } });
}

const cardField = () => screen.getByRole("textbox", { name: "Add a card" });
const press = (key: string) => fireEvent.keyDown(cardField(), { key });

/** The cards on the table, in order. */
function tableCards() {
  return within(screen.getByRole("list", { name: "Your cards" }))
    .getAllByRole("listitem")
    .map((card) => card.textContent)
    .filter(Boolean);
}

function pickCustom() {
  render(<CreateContent />);
  fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
}

afterEach(() => {
  cleanup();
  mocks.sessionFails = null;
  mocks.createFails = null;
  mocks.toasts = [];
  mocks.pushed = [];
  mocks.created = [];
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

describe("CreateContent's deck", () => {
  it("deals Fibonacci when nobody picks a scale", async () => {
    await create();

    expect(mocks.created.map((args) => args.votingScale)).toEqual([{ type: "fibonacci" }]);
  });

  it("deals the cards typed onto the table, a pasted list included", async () => {
    pickCustom();
    typeCards("1");
    press("Enter");
    typeCards("2, 3, 5");
    press("Enter");

    expect(tableCards()).toEqual(["1", "2", "3", "5"]);
    await start();
    expect(mocks.created.map((args) => args.votingScale)).toEqual([{ type: "custom", cards: ["1", "2", "3", "5"] }]);
  });

  it("lays a card once, and says so", () => {
    pickCustom();
    typeCards("1, 2, 1,");

    expect(tableCards()).toEqual(["1", "2"]);
    expect(screen.getByText("1 is already on the table.")).toBeTruthy();
  });

  it("picks up the last card on Backspace in an empty field", () => {
    pickCustom();
    typeCards("1, 2, 3,");
    press("Backspace");

    expect(tableCards()).toEqual(["1", "2"]);
  });

  it("lays a half-typed card when the field is left", () => {
    pickCustom();
    typeCards("13");
    fireEvent.blur(cardField());

    expect(tableCards()).toEqual(["13"]);
  });

  it("won't start a deck of fewer than three cards", async () => {
    pickCustom();
    typeCards("1, 2,");

    expect(startButton()).toHaveProperty("disabled", true);
    expect(screen.getByText("Add 1 more: a deck needs at least 3 cards.")).toBeTruthy();
    press("Enter");
    await start();
    expect(mocks.created).toEqual([]);
  });
});
