/**
 * A card node (spec §10.9, ADR-0015, ADR-0022): the data attributes the
 * tests read, a silhouette when the viewer has no text, the author chip in
 * a named retro, and the "Unsaved" state that keeps a failed draft.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { CardNodeView, type CardNode } from "./card-node";
import type { BoardCard } from "./cards";
import type { Id } from "@/convex/_generated/dataModel";

afterEach(cleanup);

const base: BoardCard = {
  _id: "id-a" as Id<"retroCards">,
  clientId: "a",
  promptId: "p1",
  position: { x: 0, y: 0 },
  hidden: false,
  text: "keep the demo",
  authorId: "u1" as Id<"users">,
  own: true,
};

function renderCard(data: CardNode["data"], selected = false) {
  const props = { id: data.card.clientId, data, selected } as unknown as NodeProps<CardNode>;
  return render(<CardNodeView {...props} />);
}

describe("CardNodeView", () => {
  it("carries the canvas contract's attributes and the author chip", () => {
    renderCard({ card: base, color: "green", authorName: "Ada", editable: false });
    const root = document.querySelector("[data-card-id='a']")!;
    expect(root.getAttribute("data-hidden")).toBe("false");
    expect(root.getAttribute("data-cluster-id")).toBe("");
    expect(root.getAttribute("data-late")).toBe("false");
    expect(screen.getByText("keep the demo")).toBeTruthy();
    expect(screen.getByTestId("author-chip").textContent).toBe("Ada");
    expect(screen.queryByLabelText("Card text")).toBeNull();
  });

  it("a silhouette shows no text and no author, and data-hidden is true", () => {
    renderCard({ card: { ...base, hidden: true, text: undefined, authorId: undefined, own: false }, color: "green", editable: false });
    const root = document.querySelector("[data-card-id='a']")!;
    expect(root.getAttribute("data-hidden")).toBe("true");
    expect(screen.getByRole("img", { name: "Hidden card" })).toBeTruthy();
    expect(root.textContent).toBe("");
  });

  it("an editable card keeps a failed draft with the Unsaved chip and reports the editing indicator", async () => {
    const onEditText = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(undefined);
    const onEditing = vi.fn();
    const onDelete = vi.fn();
    renderCard({ card: base, color: "green", authorName: "Ada", editable: true, onEditText, onEditing, onDelete });
    const field = screen.getByLabelText("Card text") as HTMLTextAreaElement;
    fireEvent.focus(field);
    expect(onEditing).toHaveBeenLastCalledWith("a");
    fireEvent.change(field, { target: { value: "keep the demo!" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    expect(onEditText).toHaveBeenCalledWith("a", "keep the demo!");
    expect(onEditing).toHaveBeenLastCalledWith(undefined);
    expect(field.value).toBe("keep the demo!");
    expect(screen.getByTestId("unsaved-chip").textContent).toBe("Unsaved");

    fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("shows who else is editing", () => {
    renderCard({ card: { ...base, own: false }, color: "green", authorName: "Ada", editingBy: "Ben", editable: false });
    expect(screen.getByTestId("editing-chip").textContent).toContain("Ben");
  });

  it("at headline draws the clamped first line only, at shape a tinted block; a silhouette is a block below detail (spec §10.2)", () => {
    const long = { ...base, text: "first line of a long card that goes on\nsecond line" };
    const { unmount } = renderCard({ card: long, color: "green", authorName: "Ada", editable: true, level: "headline", onEditText: vi.fn() });
    let root = document.querySelector("[data-card-id='a']") as HTMLElement;
    expect(root.getAttribute("data-level")).toBe("headline");
    expect(root.textContent).toBe("first line of a long card that goes on");
    expect(screen.queryByTestId("author-chip")).toBeNull();
    expect(screen.queryByLabelText("Card text")).toBeNull();
    expect(root.style.height).toBe("56px");
    unmount();

    renderCard({ card: long, color: "green", authorName: "Ada", editable: true, level: "shape", onEditText: vi.fn() });
    root = document.querySelector("[data-card-id='a']") as HTMLElement;
    expect(root.getAttribute("data-level")).toBe("shape");
    expect(root.textContent).toBe("");
    expect(root.getAttribute("data-hidden")).toBe("false");
    expect(root.style.height).toBe("96px");
    cleanup();

    renderCard({ card: { ...base, hidden: true, text: undefined, own: false }, color: "green", editable: false, level: "headline" });
    root = document.querySelector("[data-card-id='a']") as HTMLElement;
    expect(root.getAttribute("data-hidden")).toBe("true");
    expect(root.getAttribute("aria-label")).toBe("Hidden card");
    expect(root.textContent).toBe("");
  });

  it("dots (spec §11): the tally hidden shows own dots only; the count at headline; none without a tally", () => {
    const onPlace = vi.fn();
    const onRemove = vi.fn();
    renderCard({ card: base, color: "green", editable: false, dots: { mine: 2, onPlace, onRemove } });
    let dots = screen.getByTestId("dots");
    expect(dots.getAttribute("data-count")).toBe("");
    expect(dots.getAttribute("data-mine")).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Vote" }));
    expect(onPlace).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove vote" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    cleanup();

    renderCard({ card: base, color: "green", editable: false, level: "headline", dots: { count: 4, mine: 0, onPlace } });
    dots = screen.getByTestId("dots");
    expect(dots.textContent).toContain("4 votes");
    expect(screen.queryByRole("button", { name: "Vote" })).toBeNull();
    cleanup();

    renderCard({ card: base, color: "green", editable: false });
    expect(screen.queryByTestId("dots")).toBeNull();
  });
});
