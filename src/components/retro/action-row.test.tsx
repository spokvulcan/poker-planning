/**
 * One action item as the board, the review and the team page render it
 * (spec §13, §19): its text, owner or the unowned line, the due date with
 * the overdue state, the source's label, and the in-place acts the
 * viewer's rights allow.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionRead } from "@/convex/model/retroActions";
import { FORMER_MEMBER, NOT_ATTENDING, OVERDUE, UNOWNED_ACTION } from "@/convex/retroCopy";
import { ActionRow, type ActionRowActions } from "./action-row";

afterEach(cleanup);

const NOW = Date.UTC(2026, 8, 5, 12);

const base: ActionRead = {
  _id: "a1" as Id<"retroActions">,
  roomId: "r1" as Id<"rooms">,
  roomName: "Sprint 12",
  text: "Fix the flaky build",
  status: "open",
  createdBy: "u1" as Id<"users">,
  creatorName: "Ada",
  createdAt: NOW - 1000,
  updatedAt: NOW - 1000,
  rights: { edit: false, manage: false },
};

const members = [
  { userId: "u1" as Id<"users">, name: "Ada" },
  { userId: "u2" as Id<"users">, name: "Grace" },
];

function actions(): ActionRowActions {
  return { onSetStatus: vi.fn(), onEdit: vi.fn(), onAssign: vi.fn(), onDelete: vi.fn() };
}

describe("ActionRow", () => {
  it("renders an unowned item as a state, never an error", () => {
    render(<ActionRow item={base} members={members} now={NOW} />);
    const row = screen.getByTestId("action-item");
    expect(row.getAttribute("data-owned")).toBe("false");
    expect(row.getAttribute("data-overdue")).toBe("false");
    expect(row.getAttribute("data-status")).toBe("open");
    expect(screen.getByText(UNOWNED_ACTION)).toBeTruthy();
    expect(screen.getByText("Fix the flaky build")).toBeTruthy();
  });

  it("names the owner, and a missing one as the register's former member", () => {
    const { rerender } = render(
      <ActionRow item={{ ...base, ownerId: "u2" as Id<"users">, ownerName: "Grace" }} members={members} now={NOW} />
    );
    expect(screen.getByTestId("action-item").getAttribute("data-owned")).toBe("true");
    expect(screen.getByText(/Grace/)).toBeTruthy();
    rerender(
      <ActionRow item={{ ...base, ownerId: "u9" as Id<"users">, ownerName: FORMER_MEMBER }} members={members} now={NOW} />
    );
    expect(screen.getByText(new RegExp(FORMER_MEMBER))).toBeTruthy();
  });

  it("is overdue only while open with a due date in the past", () => {
    const past = NOW - 86_400_000;
    const { rerender } = render(<ActionRow item={{ ...base, dueAt: past }} members={members} now={NOW} />);
    expect(screen.getByTestId("action-item").getAttribute("data-overdue")).toBe("true");
    expect(screen.getByText(OVERDUE)).toBeTruthy();

    rerender(<ActionRow item={{ ...base, dueAt: past, status: "done" }} members={members} now={NOW} />);
    expect(screen.getByTestId("action-item").getAttribute("data-overdue")).toBe("false");
    expect(screen.queryByText(OVERDUE)).toBeNull();

    rerender(<ActionRow item={{ ...base, dueAt: NOW + 86_400_000 }} members={members} now={NOW} />);
    expect(screen.getByTestId("action-item").getAttribute("data-overdue")).toBe("false");
  });

  it("shows the source's label and, when asked, the retro it came from", () => {
    render(
      <ActionRow
        item={{ ...base, source: { kind: "card", id: "c1" as Id<"retroCards">, label: "CI is red every morning" } }}
        members={members}
        now={NOW}
        showRoom
      />
    );
    expect(screen.getByText(/CI is red every morning/)).toBeTruthy();
    expect(screen.getByText(/Sprint 12/)).toBeTruthy();
  });

  it("offers no act without rights, and a Team reader sees none either", () => {
    render(<ActionRow item={base} members={members} now={NOW} actions={actions()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(NOT_ATTENDING)).toBeNull();
  });

  it("tells a viewer who never attended the item's retro why there is nothing to press", () => {
    render(<ActionRow item={base} members={members} now={NOW} attending={false} actions={actions()} showRoom />);
    expect(screen.getByTestId("not-attending").textContent).toBe(NOT_ATTENDING);
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    // Without the acts at all (a reader's surface) the line is not needed.
    render(<ActionRow item={base} members={members} now={NOW} attending={false} showRoom />);
    expect(screen.queryByText(NOT_ATTENDING)).toBeNull();
  });

  it("with edit rights: done and drop invite a note and reopen does not", () => {
    const acts = actions();
    render(<ActionRow item={{ ...base, rights: { edit: true, manage: false } }} members={members} now={NOW} actions={acts} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const note = screen.getByLabelText("Note");
    fireEvent.change(note, { target: { value: "Shipped" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(acts.onSetStatus).toHaveBeenCalledWith("a1", "done", "Shipped");
    // No owner picker and no delete without the category.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete action" })).toBeNull();

    cleanup();
    render(
      <ActionRow item={{ ...base, status: "dropped", note: "Not worth it", rights: { edit: true, manage: false } }} members={members} now={NOW} actions={acts} />
    );
    expect(screen.getByText(/Not worth it/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(acts.onSetStatus).toHaveBeenCalledWith("a1", "open", undefined);
  });

  it("with the category: the owner picker reassigns in place among the retro's attendees, and delete asks first", () => {
    const acts = actions();
    render(<ActionRow item={{ ...base, rights: { edit: true, manage: true } }} members={members} now={NOW} actions={acts} />);
    const picker = screen.getByRole("combobox", { name: "Owner" });
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual([UNOWNED_ACTION, "Ada", "Grace"]);
    fireEvent.change(picker, { target: { value: "u2" } });
    expect(acts.onAssign).toHaveBeenCalledWith("a1", "u2");
    fireEvent.change(picker, { target: { value: "" } });
    expect(acts.onAssign).toHaveBeenCalledWith("a1", undefined);

    fireEvent.click(screen.getByRole("button", { name: "Delete action" }));
    expect(acts.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(acts.onDelete).toHaveBeenCalledWith("a1");
  });

  it("edits text and due date in place", () => {
    const acts = actions();
    render(<ActionRow item={{ ...base, rights: { edit: true, manage: false } }} members={members} now={NOW} actions={acts} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "Fix the build for good" } });
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-09-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(acts.onEdit).toHaveBeenCalledWith("a1", "Fix the build for good", new Date(2026, 8, 10, 23, 59, 59).getTime());
  });
});
