/**
 * The board's chrome at its interface: a board hands it what it shows of the
 * board, its panels, its share entries and what goes in the account's place,
 * and the chrome draws one set of controls in both layouts, keeps one panel
 * open at a time, and mounts a panel only while it is open. The whiteboard's
 * view and the room's presence are stubbed at their seams: the chrome's
 * zoom and fit are the view's to carry out (whiteboard.test.tsx proves it).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, useEffect, type ReactNode } from "react";
import { ClipboardCopy, ListTodo, Settings } from "lucide-react";

const stubs = vi.hoisted(() => ({
  view: { fit: () => {}, zoomIn: () => {}, zoomOut: () => {}, centerOn: () => {}, bringIntoView: () => {} },
  toasts: [] as string[],
  copied: [] as string[],
}));

vi.mock("@/components/whiteboard/whiteboard", () => ({ useWhiteboardView: () => stubs.view }));
vi.mock("./room-presence", () => ({ usePresenceRoster: () => [] }));
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (message: string) => stubs.toasts.push(message),
    error: (message: string) => stubs.toasts.push(message),
  },
}));

import { BoardChrome, type BoardChromeHandle, type ChromeBoard, type ChromePanel } from "./board-chrome";

const ROOM: ChromeBoard = { name: "Sprint 42", link: "/room/room-1", noun: "Room" };

/** A panel's content, which says when it is mounted. */
const mounted: string[] = [];
function PanelContent({ name, close }: { name: string; close: () => void }) {
  useEffect(() => {
    mounted.push(name);
    return () => {
      mounted.splice(mounted.indexOf(name), 1);
    };
  }, [name]);
  return (
    <div>
      <h2>{name}</h2>
      <button onClick={close}>Close {name}</button>
    </div>
  );
}

const panel = (id: string, label: string, icon = Settings): ChromePanel => ({
  id,
  label,
  icon,
  render: (close) => <PanelContent name={label} close={close} />,
});

/** The poker room's panels, as its board hands them over. */
const POKER_PANELS = [panel("issues", "Issues", ListTodo), panel("settings", "Room settings")];

function renderChrome(props: Partial<Parameters<typeof BoardChrome>[0]> = {}) {
  return render(
    <BoardChrome board={ROOM} panels={POKER_PANELS} {...props}>
      <div data-testid="the-board" />
    </BoardChrome>
  );
}

/** A control on the desktop's bars. */
const control = (name: string) => within(screen.getByTestId("canvas-zoom-controls")).getByRole("button", { name });

/** Opens the phone's menu sheet and returns it. */
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  return within(screen.getByRole("dialog"));
}

beforeEach(() => {
  stubs.view = { fit: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), centerOn: vi.fn(), bringIntoView: vi.fn() };
  stubs.toasts = [];
  stubs.copied = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (text: string) => Promise.resolve(void stubs.copied.push(text)) },
  });
});

afterEach(cleanup);

describe("the panels", () => {
  it("are one at a time: opening Issues closes Settings", () => {
    renderChrome();

    fireEvent.click(control("Room settings"));
    expect(mounted).toEqual(["Room settings"]);
    expect(control("Room settings").getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(control("Issues"));
    expect(mounted).toEqual(["Issues"]);
    expect(control("Room settings").getAttribute("aria-expanded")).toBe("false");
    expect(control("Issues").getAttribute("aria-expanded")).toBe("true");
  });

  it("close on Escape, and on their own close button", () => {
    renderChrome();

    fireEvent.click(control("Issues"));
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(mounted).toEqual([]);

    fireEvent.click(control("Issues"));
    fireEvent.click(screen.getByRole("button", { name: "Close Issues" }));
    expect(mounted).toEqual([]);
  });

  it("mount nothing while closed, and let go of everything when they close", () => {
    renderChrome();
    expect(mounted).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Room settings" })).toBeNull();

    fireEvent.click(control("Room settings"));
    expect(screen.getByRole("heading", { name: "Room settings" })).toBeDefined();

    fireEvent.click(control("Room settings"));
    expect(mounted).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Room settings" })).toBeNull();
  });

  it("open from the board itself, through the handle the chrome gives it (a node's button)", () => {
    const chrome = createRef<BoardChromeHandle>();
    renderChrome({ ref: chrome });

    act(() => chrome.current?.openPanel("issues"));

    expect(mounted).toEqual(["Issues"]);
  });

  it("have a toggle each, and no other: a retro, with only its settings, shows no Issues", () => {
    renderChrome({ board: { ...ROOM, noun: "Retro" }, panels: [panel("settings", "Retro settings")] });

    expect(control("Retro settings")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Issues" })).toBeNull();
    expect(openMenu().queryByRole("button", { name: "Issues" })).toBeNull();
  });

  it("dock beside the board, which stays drawn whatever is open", () => {
    renderChrome();

    fireEvent.click(control("Issues"));

    expect(screen.getByTestId("the-board")).toBeDefined();
  });
});

describe("the phone's menu", () => {
  it("opens the panel it names and closes itself", () => {
    renderChrome();

    fireEvent.click(openMenu().getByRole("button", { name: "Issues" }));

    expect(mounted).toEqual(["Issues"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays open for the view's controls, to press again", () => {
    renderChrome();

    fireEvent.click(openMenu().getByRole("button", { name: "Zoom in" }));

    expect(stubs.view.zoomIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("draws the same controls as the desktop's bars, in the same words", () => {
    renderChrome({ share: [{ label: "Copy summary", icon: ClipboardCopy, onSelect: () => {} }] });
    const desktop = [
      ...within(screen.getByTestId("canvas-navigation")).getAllByRole("button"),
      ...within(screen.getByTestId("canvas-zoom-controls")).getAllByRole("button"),
    ].map((button) => button.getAttribute("aria-label"));

    const menu = openMenu()
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);

    // The desktop's share menu holds the summary; its trigger is "Share".
    for (const name of ["Copy room link", "Zoom out", "Zoom in", "Fit view", "Issues", "Room settings"]) {
      expect(desktop).toContain(name);
      expect(menu).toContain(name);
    }
    expect(menu).toContain("Copy summary");
  });
});

describe("the controls", () => {
  it("zoom and fit the whiteboard's view", () => {
    renderChrome();

    fireEvent.click(control("Zoom out"));
    fireEvent.click(control("Zoom in"));
    fireEvent.click(control("Fit view"));

    expect(stubs.view.zoomOut).toHaveBeenCalledTimes(1);
    expect(stubs.view.zoomIn).toHaveBeenCalledTimes(1);
    expect(stubs.view.fit).toHaveBeenCalledTimes(1);
  });

  it("copy the board's link and say so in the board's words", async () => {
    renderChrome({ board: { ...ROOM, noun: "Retro" } });

    await act(async () => {
      fireEvent.click(within(screen.getByTestId("canvas-navigation")).getByRole("button", { name: "Copy retro link" }));
    });

    expect(stubs.copied).toEqual([`${window.location.origin}/room/room-1`]);
    expect(stubs.toasts).toEqual(["Retro link copied"]);
  });

  it("name fullscreen by what it will do, and follow the browser in and out of it", () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, writable: true, value: null });
    renderChrome();
    expect(control("Enter fullscreen")).toBeDefined();

    act(() => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(control("Exit fullscreen")).toBeDefined();
    Reflect.deleteProperty(document, "fullscreenEnabled");
    Reflect.deleteProperty(document, "fullscreenElement");
  });

  it("offer no fullscreen where the browser has none", () => {
    renderChrome();

    expect(screen.queryByRole("button", { name: /fullscreen/ })).toBeNull();
  });
});

describe("the account's place", () => {
  function AccountMenu(): ReactNode {
    return <button>Your account</button>;
  }

  it("holds the account menu the board puts there", () => {
    renderChrome({ account: <AccountMenu /> });

    expect(within(screen.getByTestId("canvas-zoom-controls")).getByRole("button", { name: "Your account" })).toBeDefined();
    expect(openMenu().getByRole("button", { name: "Your account" })).toBeDefined();
  });

  it("holds the demo's way into a room instead, and no account menu: the demo has nobody signed in", () => {
    renderChrome({
      board: { name: "Planning Poker Demo", link: "/demo", noun: "Demo", tag: "Demo" },
      account: <button>Create Your Room</button>,
    });

    expect(screen.queryByRole("button", { name: "Your account" })).toBeNull();
    expect(screen.getByRole("button", { name: "Create Your Room" })).toBeDefined();
    expect(within(screen.getByTestId("canvas-navigation")).getByText("Demo")).toBeDefined();
    expect(within(screen.getByTestId("canvas-navigation")).getByRole("button", { name: "Copy demo link" })).toBeDefined();
  });
});

describe("a board without bars (the demo on the home page)", () => {
  it("draws none, and still docks the panel a node opens", () => {
    const chrome = createRef<BoardChromeHandle>();
    renderChrome({ bars: false, ref: chrome });
    expect(screen.queryByRole("navigation")).toBeNull();

    act(() => chrome.current?.openPanel("settings"));

    expect(mounted).toEqual(["Room settings"]);
  });
});
