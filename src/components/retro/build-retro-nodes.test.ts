/**
 * buildRetroNodes / buildRetroEdges — what the retro whiteboard shows in each
 * step, from plain values: every topic is a node and a stacked sticky rides
 * inside its top, the walk ranks and spotlights topics in Discuss, a pending
 * sticky can't be touched, and a draft rides on top of the board.
 */
import { describe, it, expect } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { BoardView, StickyView } from "@/convex/model/retro";
import { RESOLVED_ALLOWED, type ResolvedDecision } from "@/convex/permissions";
import { columnsFromTemplate, type RetroStep } from "@/convex/retroTemplates";
import { padPositions, RETRO_NODE_POSITION } from "@/convex/retroLayout";
import { buildRetroEdges, buildRetroNodes, topicLabel, type RetroNodesInput } from "./build-retro-nodes";
import { OPTIMISTIC_PREFIX } from "./optimistic";
import type { RetroBoardActions, StickyNodeData } from "./types";

const DENIED: ResolvedDecision = { allowed: false, message: "Only facilitators and the owner can do this." };
const columns = columnsFromTemplate("classic");
const actions = {} as RetroBoardActions;

function sticky(id: string, overrides: Partial<StickyView> = {}): StickyView {
  return {
    _id: id as Id<"retroStickies">,
    clientId: `client-${id}`,
    columnId: "c1",
    position: { x: 0, y: 200 },
    createdAt: Number(id.replace(/\D/g, "")) || 1,
    mine: false,
    hidden: false,
    text: `Sticky ${id}`,
    myVote: false,
    ...overrides,
  };
}

function board(stickies: StickyView[], overrides: Partial<BoardView> = {}): BoardView {
  return { stickies, writers: 1, votesCast: 0, myVotes: 0, ...overrides };
}

function input(overrides: Partial<RetroNodesInput> = {}): RetroNodesInput {
  return {
    roomId: "room-1" as Id<"rooms">,
    viewerId: "me" as Id<"users">,
    name: "Sprint 42 retro",
    step: "write",
    columns,
    votesPerPerson: 3,
    board: board([]),
    items: [],
    canvasNodes: [],
    members: [{ _id: "me" as Id<"users">, name: "Me" }],
    draft: null,
    editingId: null,
    expandedIds: new Set(),
    dropTargetId: null,
    canFlow: RESOLVED_ALLOWED,
    canManageCards: DENIED,
    canManageActions: RESOLVED_ALLOWED,
    canSettings: RESOLVED_ALLOWED,
    actions,
    ...overrides,
  };
}

const stickyNodes = (nodes: ReturnType<typeof buildRetroNodes>) =>
  nodes.filter((n) => n.type === "sticky") as { id: string; data: StickyNodeData; draggable?: boolean }[];

describe("buildRetroNodes", () => {
  it("lays out the retro node, a pad per column and the action items where nothing is stored yet", () => {
    const nodes = buildRetroNodes(input());
    expect(nodes.find((n) => n.id === "retro")?.position).toEqual(RETRO_NODE_POSITION);
    const pads = nodes.filter((n) => n.type === "pad");
    expect(pads.map((n) => n.id)).toEqual(["pad-c1", "pad-c2", "pad-c3"]);
    expect(pads.map((n) => n.position)).toEqual(padPositions(3));
    expect(nodes.some((n) => n.id === "actions")).toBe(true);
  });

  it("makes each topic a node, keyed by its client id, with its stack inside it", () => {
    const nodes = stickyNodes(
      buildRetroNodes(
        input({
          step: "vote",
          board: board([sticky("s1"), sticky("s2", { stackId: "s1" as Id<"retroStickies"> }), sticky("s3")]),
        })
      )
    );
    expect(nodes.map((n) => n.id)).toEqual(["client-s1", "client-s3"]);
    expect(nodes[0].data.members.map((m) => m._id)).toEqual(["s2"]);
  });

  it("counts every sticky, stacked or not, on its column's pad", () => {
    const nodes = buildRetroNodes(
      input({ board: board([sticky("s1"), sticky("s2", { stackId: "s1" as Id<"retroStickies"> }), sticky("s3", { columnId: "c2" })]) })
    );
    const count = (id: string) => (nodes.find((n) => n.id === id)?.data as { count: number }).count;
    expect([count("pad-c1"), count("pad-c2"), count("pad-c3")]).toEqual([2, 1, 0]);
  });

  it("lets the author, not everyone, change a sticky; a facilitator's call covers the rest", () => {
    const stickies = [sticky("s1", { mine: true }), sticky("s2")];
    const asParticipant = stickyNodes(buildRetroNodes(input({ board: board(stickies) })));
    expect(asParticipant.map((n) => n.data.canEdit)).toEqual([true, false]);
    const asFacilitator = stickyNodes(buildRetroNodes(input({ board: board(stickies), canManageCards: RESOLVED_ALLOWED })));
    expect(asFacilitator.map((n) => n.data.canEdit)).toEqual([true, true]);
  });

  it("holds a sticky the server hasn't confirmed: not draggable, not editable", () => {
    const [node] = stickyNodes(
      buildRetroNodes(input({ board: board([sticky(`${OPTIMISTIC_PREFIX}abc`, { mine: true })]) }))
    );
    expect(node.draggable).toBe(false);
    expect(node.data.canEdit).toBe(false);
    expect(node.data.canFocus).toBe(false);
  });

  it("ranks topics only from Discuss on, spotlights the focus and dims the rest", () => {
    const stickies = [sticky("s1", { votes: 1 }), sticky("s2", { votes: 3 }), sticky("s3", { votes: 0 })];
    const at = (step: RetroStep) =>
      stickyNodes(buildRetroNodes(input({ step, board: board(stickies), focusStickyId: "s1" as Id<"retroStickies"> })));

    expect(at("vote").map((n) => n.data.rank)).toEqual([undefined, undefined, undefined]);

    const discuss = at("discuss");
    expect(discuss.map((n) => n.data.rank)).toEqual([2, 1, undefined]);
    expect(discuss.map((n) => n.data.focused)).toEqual([true, false, false]);
    expect(discuss.map((n) => n.data.dimmed)).toEqual([false, true, true]);
    // s2 (#1) comes before the focus (#2), so it has been discussed.
    expect(discuss.map((n) => n.data.discussed)).toEqual([false, true, false]);

    const done = at("done");
    expect(done.map((n) => n.data.focused)).toEqual([false, false, false]);
    expect(done.map((n) => n.data.discussed)).toEqual([true, true, false]);
  });

  it("tells the retro node where the walk is", () => {
    const stickies = [sticky("s1", { votes: 1 }), sticky("s2", { votes: 3 })];
    const retro = buildRetroNodes(
      input({ step: "discuss", board: board(stickies), focusStickyId: "s1" as Id<"retroStickies"> })
    ).find((n) => n.id === "retro")!;
    expect(retro.data).toMatchObject({ topicIndex: 1, topicCount: 2, focusedId: "s1", focusedLabel: "Sticky s1" });
  });

  it("shows a draft as an open editor on top of the board", () => {
    const nodes = stickyNodes(
      buildRetroNodes(input({ draft: { clientId: "draft-1", columnId: "c2", position: { x: 10, y: 20 } } }))
    );
    expect(nodes).toEqual([
      expect.objectContaining({
        id: "draft-1",
        draggable: false,
        data: expect.objectContaining({ editing: true, color: "pink", draft: expect.objectContaining({ clientId: "draft-1" }) }),
      }),
    ]);
  });

  it("marks the sticky under a dragged one as the drop target", () => {
    const nodes = stickyNodes(
      buildRetroNodes(input({ step: "vote", board: board([sticky("s1"), sticky("s2")]), dropTargetId: "client-s2" }))
    );
    expect(nodes.map((n) => n.data.dropTarget)).toEqual([false, true]);
  });
});

describe("topicLabel", () => {
  it("never reads out a face-down sticky", () => {
    expect(topicLabel(sticky("s1", { hidden: true, text: undefined }))).toBe("A face-down sticky");
    expect(topicLabel(sticky("s1", { text: "  Ship\n it  " }))).toBe("Ship it");
    expect(topicLabel(sticky("s1", { text: "", gif: { url: "u", width: 1, height: 1, title: "This is fine" } }))).toBe(
      "This is fine"
    );
  });
});

describe("buildRetroEdges", () => {
  it("wires the retro node to each pad, the action items and, when there is one, the timer", () => {
    const edges = buildRetroEdges(columns, true);
    expect(edges.map((e) => e.id).sort()).toEqual(
      ["retro-to-actions", "retro-to-pad-c1", "retro-to-pad-c2", "retro-to-pad-c3", "timer-to-retro"].sort()
    );
    expect(buildRetroEdges(columns, false).some((e) => e.id === "timer-to-retro")).toBe(false);
  });
});
