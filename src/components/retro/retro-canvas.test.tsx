/**
 * RetroCanvas: the retro's adapter, tested at its seams, as the poker
 * board's is: React Flow and Convex are the whiteboard's test stand-ins
 * (../whiteboard/testing). React Flow draws the board's nodes and reports
 * the gestures; Convex holds the retro's queries, where each write's
 * optimistic update lands at once and a refused write is rolled back. The
 * tests make the gestures and click what the nodes draw, then read what the
 * board shows, the writes that reached the server and what the viewer was
 * told. The board gets the room from `rooms.get`, as the room page hands it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const stubs = vi.hoisted(() => ({ toasts: [] as string[], pushed: [] as string[] }));

vi.mock("@xyflow/react", async (importOriginal) =>
  (await import("@/components/whiteboard/testing/react-flow")).mockReactFlow(await importOriginal<object>())
);
vi.mock("convex/react", async (importOriginal) =>
  (await import("@/components/whiteboard/testing/convex")).mockConvexReact(await importOriginal<object>())
);
vi.mock("@convex-dev/presence/react", () => ({ default: () => undefined }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (to: string) => stubs.pushed.push(to) }) }));
// The account menu the board puts in its chrome: the viewer's, not the board's.
vi.mock("@/components/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/canvas-dots-background", () => ({ CanvasDotsBackground: () => null }));
// What the viewer is told: a refusal's own words, when the server sent some.
vi.mock("@/lib/toast", () => ({
  toast: Object.assign(() => {}, {
    success: () => {},
    error: (message: string) => stubs.toasts.push(message),
  }),
}));

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNode } from "@/convex/model/canvas";
import type { RoomUserData } from "@/convex/model/memberships";
import { refusal } from "@/convex/model/refusal";
import type { BoardView, RetroState, StickyView } from "@/convex/model/retro";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { padNodeId, padPositions, STICKY_MIN_HEIGHT, STICKY_WIDTH } from "@/convex/retroLayout";
import { columnsFromTemplate } from "@/convex/retroTemplates";
import { answer, convex, refuse, resetConvex, serve } from "@/components/whiteboard/testing/convex";
import {
  doubleClickPane,
  drop,
  dropOnto,
  flow,
  nodeOf,
  pressDelete,
  resetFlow,
} from "@/components/whiteboard/testing/react-flow";
import { RetroCanvas } from "./retro-canvas";
import type { StickyNodeData } from "./types";

const ROOM = "room-1" as Id<"rooms">;
const ME = "user-me" as Id<"users">;
const ADA = "user-ada" as Id<"users">;

// The board's three pads: "Went well" (c1), "To improve" (c2), "Ideas" (c3).
const PADS = padPositions(3);
// Where a column's first sticky goes: under its pad.
const FIRST = { x: PADS[0].x + 10, y: 120 };

function member(id: Id<"users">, name: string, role: RoomUserData["role"]): RoomUserData {
  return { _id: id, name, isSpectator: false, role, joinedAt: 0, membershipId: `m-${id}` as Id<"roomMemberships"> };
}

/** A sticky as the viewer is sent it: someone else's face-down while writing, unless `extra` says otherwise. */
function sticky(id: string, position: { x: number; y: number }, extra: Partial<StickyView> = {}): StickyView {
  return {
    _id: id as Id<"retroStickies">,
    clientId: `client-${id}`,
    columnId: "c1",
    position,
    createdAt: 1,
    mine: false,
    hidden: false,
    text: `Sticky ${id}`,
    ...(extra.stackId ? {} : { myVote: false }),
    ...extra,
  };
}

const mine = (id: string, position: { x: number; y: number }, extra: Partial<StickyView> = {}) =>
  sticky(id, position, { mine: true, ...extra });
const adasFaceDown = (id: string, position: { x: number; y: number }) =>
  sticky(id, position, { hidden: true, text: undefined });

function retroRoom(retro: Partial<RetroState> = {}): RoomWithRelatedData {
  return {
    room: {
      _id: ROOM,
      _creationTime: 0,
      name: "Sprint 42 retro",
      roomType: "retro",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: 0,
      lastActivityAt: 0,
      retained: false,
      ownerId: ME,
      retro: { step: "write", columns: columnsFromTemplate("classic"), votesPerPerson: 3, showAuthors: false, ...retro },
    },
    users: [member(ME, "Mo", "owner"), member(ADA, "Ada", "participant")],
    votes: [],
    isOwnerAbsent: false,
  };
}

/** The pads where the server keeps them. */
const padNodes = (): CanvasNode[] =>
  PADS.map(
    (position, i) =>
      ({ roomId: ROOM, nodeId: padNodeId(`c${i + 1}`), type: "pad", data: { columnId: `c${i + 1}` }, position, lastUpdatedAt: 0 }) as CanvasNode
  );

/** The board as the room page shows it, with the room from `rooms.get`. */
function Retro() {
  const data = useQuery(api.rooms.get, { roomId: ROOM });
  return data ? <RetroCanvas roomData={data} currentUserId={ME} /> : null;
}

/** Shows the retro at `retro` with `stickies` on it; `serveRoom` is the server sending the room again. */
function renderRetro({ retro = {}, stickies = [] }: { retro?: Partial<RetroState>; stickies?: StickyView[] } = {}) {
  serve(api.rooms.get, { roomId: ROOM }, retroRoom(retro));
  serve(api.retro.board, { roomId: ROOM }, { stickies, writers: 2, myVotes: 0 } satisfies BoardView);
  serve(api.retro.votesCast, { roomId: ROOM }, 0);
  serve(api.retro.actionItems, { roomId: ROOM }, []);
  serve(api.canvas.getCanvasNodes, { roomId: ROOM }, padNodes());
  render(<Retro />);
  return { serveRoom: (next: Partial<RetroState>) => act(() => serve(api.rooms.get, { roomId: ROOM }, retroRoom(next))) };
}

/** A sticky the viewer can read, by its words. */
const card = (text: string) => screen.getByRole("article", { name: `Sticky: ${text}` });
const editor = () => screen.queryByRole("textbox", { name: "Sticky text" }) as HTMLTextAreaElement | null;
/** The sticky nodes on the board, by id. */
const stickyNodes = () => flow.nodes.filter((node) => node.type === "sticky").map((node) => node.id);
/** The draft being written, as React Flow draws it. */
const draftNode = () => flow.nodes.find((node) => node.type === "sticky" && (node.data as StickyNodeData).draft);

/** Types into the open editor and presses Enter, then lets the write settle. */
async function typeAndStick(text: string) {
  fireEvent.change(editor()!, { target: { value: text } });
  await act(async () => fireEvent.keyDown(editor()!, { key: "Enter" }));
}

beforeEach(() => {
  resetFlow();
  resetConvex();
  stubs.toasts = [];
  stubs.pushed = [];
});

afterEach(cleanup);

describe("editing a sticky", () => {
  it("saves the new words and shows them at once", async () => {
    renderRetro({ stickies: [mine("s1", FIRST, { text: "Standups run long" })] });

    fireEvent.click(within(card("Standups run long")).getByRole("button", { name: "Edit" }));
    await typeAndStick("Standups run longer");

    expect(convex.writes).toEqual([
      { name: "retro:updateSticky", args: { stickyId: "s1", text: "Standups run longer" } },
    ]);
    expect(card("Standups run longer")).toBeDefined();
    expect(editor()).toBeNull();
  });

  it("writes nothing for an edit that changes nothing, and closes the editor", async () => {
    renderRetro({ stickies: [mine("s1", FIRST, { text: "Standups run long" })] });

    fireEvent.click(within(card("Standups run long")).getByRole("button", { name: "Edit" }));
    await typeAndStick("Standups run long ");

    expect(convex.writes).toEqual([]);
    expect(editor()).toBeNull();
  });

  it("keeps the words typed when the edit is refused: the editor opens on them again, and says why", async () => {
    refuse(refusal("forbidden", "Only its author can change this sticky."), api.retro.updateSticky);
    renderRetro({ stickies: [mine("s1", FIRST, { text: "Standups run long" })] });

    fireEvent.click(within(card("Standups run long")).getByRole("button", { name: "Edit" }));
    await typeAndStick("Standups run longer");

    expect(convex.refused.map((write) => write.name)).toEqual(["retro:updateSticky"]);
    expect(editor()?.value).toBe("Standups run longer");
    expect(stubs.toasts).toEqual(["Only its author can change this sticky."]);
  });
});

describe("a new sticky", () => {
  it("is drafted under the lowest sticky in its pad's column", () => {
    renderRetro({ stickies: [mine("s1", FIRST)] });

    fireEvent.click(screen.getByRole("button", { name: "Add a sticky to Went well" }));

    expect(draftNode()?.position).toEqual({ x: FIRST.x, y: FIRST.y + STICKY_MIN_HEIGHT + 16 });
    expect(editor()).not.toBeNull();
  });

  it("is brought into view when it lands outside the board's pane", () => {
    renderRetro();

    fireEvent.click(screen.getByRole("button", { name: "Add a sticky to Went well" }));

    // The first sticky under "Went well" is left of the pane: the view pans right until it clears the edge by 96px.
    expect(FIRST.x).toBeLessThan(0);
    expect(flow.setViewport).toHaveBeenCalledWith({ x: 96 - FIRST.x, y: 0, zoom: 1 }, expect.anything());
  });

  it("is written where the board is double-clicked, in the column whose pad is nearest", async () => {
    renderRetro();

    // Nearest the "Ideas" pad, the third.
    doubleClickPane({ x: PADS[2].x + 100, y: 500 });
    await typeAndStick("Pair on the deploy script");

    expect(convex.writes).toEqual([
      {
        name: "retro:addSticky",
        args: expect.objectContaining({
          roomId: ROOM,
          columnId: "c3",
          text: "Pair on the deploy script",
          position: { x: PADS[2].x + 100 - STICKY_WIDTH / 2, y: 500 - 24 },
        }),
      },
    ]);
  });

  it("comes back as written when it is refused", async () => {
    refuse(refusal("forbidden", "This board is full."), api.retro.addSticky);
    renderRetro();

    fireEvent.click(screen.getByRole("button", { name: "Add a sticky to Went well" }));
    await typeAndStick("Standups run long");

    expect(editor()?.value).toBe("Standups run long");
    expect(stubs.toasts).toEqual(["This board is full."]);
  });
});

describe("a drop", () => {
  it("stacks my loose sticky on my own sticky while writing", async () => {
    renderRetro({ stickies: [mine("top", FIRST), mine("other", { x: FIRST.x, y: 400 })] });

    await act(async () => dropOnto("client-other", "client-top"));

    expect(convex.writes).toEqual([{ name: "retro:stackSticky", args: { stickyId: "other", ontoId: "top" } }]);
    expect(stickyNodes()).toEqual(["client-top"]);
    expect(screen.getByRole("button", { name: "Open the stack of 2" })).toBeDefined();
  });

  it("only moves my sticky dropped onto someone else's face-down one", async () => {
    renderRetro({ stickies: [adasFaceDown("adas", FIRST), mine("mine", { x: FIRST.x, y: 400 })] });

    await act(async () => dropOnto("client-mine", "client-adas"));

    expect(convex.writes).toEqual([
      { name: "retro:moveStickies", args: { roomId: ROOM, moves: [{ stickyId: "mine", position: FIRST }] } },
    ]);
    expect(stickyNodes()).toEqual(["client-adas", "client-mine"]);
    expect(nodeOf("client-mine").position).toEqual(FIRST);
  });

  it("saves the stickies and the board's other nodes it moved, each in one write, and shows them there", async () => {
    renderRetro({ stickies: [mine("s1", FIRST)] });

    await act(async () => drop({ x: FIRST.x, y: 600 }, "client-s1", padNodeId("c1")));

    expect(convex.writes).toEqual([
      { name: "retro:moveStickies", args: { roomId: ROOM, moves: [{ stickyId: "s1", position: { x: FIRST.x, y: 600 } }] } },
      {
        name: "canvas:moveNodes",
        args: { roomId: ROOM, moves: [{ nodeId: padNodeId("c1"), position: { x: PADS[0].x, y: 600 - FIRST.y } }] },
      },
    ]);
    expect(nodeOf("client-s1").position).toEqual({ x: FIRST.x, y: 600 });
    expect(nodeOf(padNodeId("c1")).position).toEqual({ x: PADS[0].x, y: 600 - FIRST.y });
  });

  it("leaves the stickies apart when the server refuses the stack, and says why", async () => {
    refuse(refusal("stage", "Stacks wait for the reveal."), api.retro.stackSticky);
    renderRetro({ stickies: [mine("top", FIRST), mine("other", { x: FIRST.x, y: 400 })] });

    await act(async () => dropOnto("client-other", "client-top"));

    expect(stickyNodes()).toEqual(["client-top", "client-other"]);
    expect(stubs.toasts).toEqual(["Stacks wait for the reveal."]);
  });
});

describe("unstacking", () => {
  it("puts the sticky back on the board beside its stack", async () => {
    renderRetro({ stickies: [mine("top", FIRST), mine("under", FIRST, { stackId: "top" as Id<"retroStickies"> })] });

    fireEvent.click(screen.getByRole("button", { name: "Open the stack of 2" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Take off the stack" })));

    const beside = { x: FIRST.x + STICKY_WIDTH + 24, y: FIRST.y };
    expect(convex.writes).toEqual([{ name: "retro:unstackSticky", args: { stickyId: "under", position: beside } }]);
    expect(nodeOf("client-under").position).toEqual(beside);
  });
});

describe("Delete", () => {
  it("takes off only the stickies the viewer may remove: not someone else's face-down one", async () => {
    renderRetro({ stickies: [mine("mine", FIRST), adasFaceDown("adas", { x: FIRST.x, y: 400 })] });

    await act(async () => pressDelete("client-mine", "client-adas"));

    expect(convex.writes).toEqual([{ name: "retro:deleteSticky", args: { stickyId: "mine" } }]);
    expect(stickyNodes()).toEqual(["client-adas"]);
  });
});

describe("the retro's settings, docked beside the board", () => {
  /** Opens them as the chrome's toggle does. */
  function openSettings() {
    fireEvent.click(within(screen.getByTestId("canvas-zoom-controls")).getByRole("button", { name: "Retro settings" }));
    return within(screen.getByTestId("retro-settings-panel"));
  }

  it("rename the retro", async () => {
    renderRetro();
    const settings = openSettings();

    fireEvent.change(settings.getByLabelText("Retro name"), { target: { value: "Sprint 43 retro" } });
    await act(async () => fireEvent.click(settings.getByRole("button", { name: "Save" })));

    expect(convex.writes).toEqual([{ name: "retro:rename", args: { roomId: ROOM, name: "Sprint 43 retro" } }]);
  });

  it("set the votes each person has, and whether stickies show who wrote them", async () => {
    renderRetro();
    const settings = openSettings();

    await act(async () => fireEvent.click(settings.getByRole("button", { name: "More votes" })));
    await act(async () => fireEvent.click(settings.getByRole("switch", { name: "Show who wrote each sticky" })));

    expect(convex.writes).toEqual([
      { name: "retro:updateSettings", args: { roomId: ROOM, votesPerPerson: 4 } },
      { name: "retro:updateSettings", args: { roomId: ROOM, showAuthors: true } },
    ]);
  });

  it("change who may run the retro", async () => {
    renderRetro();
    const settings = openSettings();

    fireEvent.click(settings.getByRole("button", { name: "Permissions" }));
    const runTheRetro = settings.getByText("Run the retro").closest("div")!.parentElement!;
    fireEvent.click(within(runTheRetro).getByRole("combobox"));
    // A pick is a press that starts on the option, as a mouse's does.
    const everyone = screen.getByRole("option", { name: "Everyone" });
    fireEvent.pointerDown(everyone);
    await act(async () => fireEvent.click(everyone));

    expect(convex.writes).toEqual([
      {
        name: "retro:updatePermissions",
        args: { roomId: ROOM, permissions: expect.objectContaining({ stageFlow: "everyone" }) },
      },
    ]);
  });

  it("add a column, rename and recolour one, and remove an empty one", async () => {
    renderRetro({ stickies: [mine("s1", FIRST)] });
    const settings = openSettings();

    await act(async () => fireEvent.click(settings.getByRole("button", { name: "Add column" })));
    const title = settings.getByRole("textbox", { name: "Went well title" });
    fireEvent.change(title, { target: { value: "Wins" } });
    await act(async () => fireEvent.blur(title));
    await act(async () =>
      fireEvent.click(within(settings.getByRole("radiogroup", { name: "Went well colour" })).getByRole("radio", { name: "blue" }))
    );
    await act(async () => fireEvent.click(settings.getByRole("button", { name: "Remove Ideas" })));

    expect(convex.writes).toEqual([
      { name: "retro:addColumn", args: { roomId: ROOM, title: "New column", emoji: "📌", color: "blue" } },
      { name: "retro:updateColumn", args: { roomId: ROOM, columnId: "c1", title: "Wins" } },
      { name: "retro:updateColumn", args: { roomId: ROOM, columnId: "c1", color: "blue" } },
      { name: "retro:removeColumn", args: { roomId: ROOM, columnId: "c3" } },
    ]);
    // A column with stickies in it stays.
    expect(settings.getByRole("button", { name: "Remove Went well" })).toHaveProperty("disabled", true);
  });

  it("delete the retro once its owner confirms, and leave for the retros list", async () => {
    renderRetro();
    const settings = openSettings();

    fireEvent.click(settings.getByRole("button", { name: "Delete retro" }));
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" })));

    expect(convex.writes).toEqual([{ name: "retro:remove", args: { roomId: ROOM } }]);
    expect(stubs.pushed).toEqual(["/dashboard/retros"]);
  });
});

describe("the next retro", () => {
  it("opens once the server has made it", async () => {
    answer(api.retro.startNext, "room-2");
    renderRetro({ retro: { step: "done" } });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start the next retro" })));

    expect(convex.writes).toEqual([{ name: "retro:startNext", args: { roomId: ROOM } }]);
    expect(stubs.pushed).toEqual(["/room/room-2"]);
  });

  it("stays put when the server refuses it, and says why", async () => {
    refuse(refusal("forbidden", "Only facilitators can start the next retro."), api.retro.startNext);
    renderRetro({ retro: { step: "done" } });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start the next retro" })));

    expect(stubs.pushed).toEqual([]);
    expect(stubs.toasts).toEqual(["Only facilitators can start the next retro."]);
  });
});

describe("the spotlight", () => {
  const revealed = [sticky("adas", FIRST, { text: "Deploys got faster" }), mine("mine", { x: 400, y: 300 })];

  it("brings everyone's view to the topic it moves to while the discussion runs", () => {
    const { serveRoom } = renderRetro({ retro: { step: "discuss" }, stickies: revealed });

    serveRoom({ step: "discuss", focusStickyId: "mine" as Id<"retroStickies"> });

    expect(flow.setCenter).toHaveBeenCalledWith(400 + STICKY_WIDTH / 2, 300 + STICKY_MIN_HEIGHT / 2, expect.anything());
  });

  it("leaves the view alone outside the discussion", () => {
    const { serveRoom } = renderRetro({ retro: { step: "vote" }, stickies: revealed });

    serveRoom({ step: "vote", focusStickyId: "mine" as Id<"retroStickies"> });

    expect(flow.setCenter).not.toHaveBeenCalled();
  });
});
