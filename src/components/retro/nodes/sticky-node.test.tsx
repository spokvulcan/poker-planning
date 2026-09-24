/**
 * The sticky as each viewer sees it: face-down it shows scribbles at one
 * size and never words; the author's own reads "Only you, until the
 * reveal"; in Vote a dot button spends and takes back a vote, and turns
 * itself off when the votes run out; from Discuss on it carries its total
 * and its place in the walk.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { StickyView } from "@/convex/model/retro";
import { FACE_DOWN_HEIGHT, STICKY_MIN_HEIGHT } from "@/convex/retroLayout";
import type { RetroBoardActions, StickyFlowNode, StickyNodeData } from "../types";
import { StickyNode } from "./sticky-node";

afterEach(cleanup);

function actions(): RetroBoardActions {
  return new Proxy({} as RetroBoardActions, {
    get: (target, key: string) => (target[key as keyof RetroBoardActions] ??= vi.fn() as never),
  });
}

function sticky(overrides: Partial<StickyView> = {}): StickyView {
  return {
    _id: "s1" as Id<"retroStickies">,
    clientId: "client-1",
    columnId: "c1",
    position: { x: 0, y: 0 },
    createdAt: 1,
    mine: false,
    hidden: false,
    text: "Standups run long",
    myVote: false,
    ...overrides,
  };
}

function renderSticky(data: Partial<StickyNodeData>) {
  const full: StickyNodeData = {
    sticky: sticky(),
    color: "pink",
    step: "write",
    editing: false,
    canEdit: false,
    members: [],
    columnColors: { c1: "pink" },
    expanded: false,
    votesLeft: 3,
    focused: false,
    discussed: false,
    dimmed: false,
    dropTarget: false,
    canFocus: false,
    actions: actions(),
    ...data,
  };
  const props = { id: "client-1", data: full, selected: false, dragging: false } as unknown as NodeProps<StickyFlowNode>;
  render(<StickyNode {...props} />);
  return full;
}

describe("StickyNode", () => {
  it("face-down: scribbles, and never the words", () => {
    renderSticky({ sticky: sticky({ hidden: true, text: undefined }) });
    const node = screen.getByTestId("retro-sticky");
    expect(node.getAttribute("data-hidden")).toBe("true");
    expect(node.getAttribute("aria-label")).toBe("A sticky, face-down until the reveal");
    expect(screen.queryByText("Standups run long")).toBeNull();
  });

  it("face-down, one size whatever it holds; face-up, as tall as it needs", () => {
    const face = () => screen.getByTestId("retro-sticky").lastElementChild as HTMLElement;
    renderSticky({ sticky: sticky({ hidden: true, text: undefined }) });
    expect(face().style.height).toBe(`${FACE_DOWN_HEIGHT}px`);
    cleanup();
    renderSticky({ sticky: sticky({ mine: true }) });
    expect(face().style.height).toBe("");
    expect(face().style.minHeight).toBe(`${STICKY_MIN_HEIGHT}px`);
  });

  it("the author's own reads as theirs until the reveal", () => {
    renderSticky({ sticky: sticky({ mine: true }), canEdit: true });
    expect(screen.getByText("Standups run long")).toBeTruthy();
    expect(screen.getByText("Only you, until the reveal")).toBeTruthy();
  });

  it("in Vote, the dot button spends a vote, and takes one back", () => {
    const data = renderSticky({ step: "vote" });
    fireEvent.click(screen.getByRole("button", { name: "Vote" }));
    expect(data.actions.toggleVote).toHaveBeenCalledWith("s1");
    cleanup();
    renderSticky({ step: "vote", sticky: sticky({ myVote: true }) });
    expect(screen.getByRole("button", { name: "Voted" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("with no votes left, a topic you haven't voted for can't take one", () => {
    const data = renderSticky({ step: "vote", votesLeft: 0 });
    const button = screen.getByRole("button", { name: "Vote" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(data.actions.toggleVote).not.toHaveBeenCalled();
  });

  it("from Discuss on, shows its total and its place; the spotlit one says so", () => {
    renderSticky({ step: "discuss", sticky: sticky({ votes: 4 }), rank: 1, focused: true });
    expect(screen.getByLabelText("4 votes")).toBeTruthy();
    expect(screen.getByText("Discussing · #1")).toBeTruthy();
    expect(screen.getByTestId("retro-sticky").getAttribute("data-focused")).toBe("true");
  });

  it("a stack shows how many it holds, and opens to list them", () => {
    const member = sticky({ _id: "s2" as Id<"retroStickies">, clientId: "client-2", text: "Standups drag on", stackId: "s1" as Id<"retroStickies"> });
    const data = renderSticky({ step: "vote", members: [member] });
    fireEvent.click(screen.getByRole("button", { name: "Open the stack of 2" }));
    expect(data.actions.toggleExpanded).toHaveBeenCalledWith("s1");
    cleanup();
    renderSticky({ step: "vote", members: [member], expanded: true });
    expect(screen.getByText("Standups drag on")).toBeTruthy();
  });
});
