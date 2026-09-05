/**
 * The walk panel (spec §12.3, ADR-0023): the order with covered ticks and
 * the current topic, the readout over the live entries, then what is
 * outside the walk — the late topics open, the un-voted ones collapsed —
 * each row with Go and Raise. Cursor, ticks and raise are `stageFlow`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ResolvedDecision } from "@/convex/permissions";
import type { WalkRead } from "@/convex/model/walk";
import { WalkPanel, type WalkPanelActions } from "./walk-panel";

afterEach(cleanup);

const card = (id: string) => ({ kind: "card" as const, id: id as Id<"retroCards"> });
const cluster = (id: string) => ({ kind: "cluster" as const, id: id as Id<"retroClusters"> });

const walk: WalkRead = {
  stageEntryId: "s5",
  snapshotAt: 1_000,
  cursor: 1,
  entries: [
    { index: 0, ref: cluster("k1"), covered: true },
    { index: 1, ref: card("c2"), covered: false },
    // Index 3: a dangling ref at 2 was omitted upstream.
    { index: 3, ref: card("c4"), covered: false },
  ],
  covered: 1,
  total: 3,
  late: 1,
  outside: [
    { ref: card("late1"), late: true },
    { ref: card("c9"), late: false },
    { ref: cluster("k7"), late: false },
  ],
};

const labels: Record<string, string> = { k1: "Demos", c2: "Flaky CI", c4: "Pairing", late1: "The late one", c9: "Unvoted card", k7: "Unvoted group" };
const labelOf = (ref: { id: string }) => labels[ref.id];

const allowed: ResolvedDecision = { allowed: true };
const denied: ResolvedDecision = { allowed: false, message: "Only facilitators and the owner" };

function actions(decision: ResolvedDecision = allowed): WalkPanelActions {
  return { decision, onSetCursor: vi.fn(), onMarkCovered: vi.fn(), onRaise: vi.fn() };
}

describe("WalkPanel", () => {
  it("lists the order with ticks and the current topic, and reads out coverage over the live entries", () => {
    render(<WalkPanel walk={walk} labelOf={labelOf} onGo={vi.fn()} actions={actions()} />);
    const panel = screen.getByTestId("walk-panel");
    expect(panel.getAttribute("data-covered")).toBe("1");
    expect(panel.getAttribute("data-remaining")).toBe("2");
    expect(panel.getAttribute("data-late")).toBe("1");
    expect(screen.getByText("1 of 3 covered · 1 new")).toBeTruthy();

    const rows = within(screen.getByTestId("walk-order")).getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-topic-id"))).toEqual(["k1", "c2", "c4"]);
    expect(rows.map((row) => within(row).getByRole("checkbox").getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(rows.map((row) => row.getAttribute("data-current"))).toEqual(["false", "true", "false"]);
    expect(within(rows[0]).getByText("Demos")).toBeTruthy();
  });

  it("Go on an order row moves the cursor to that entry's stored index; a tick toggles coverage", () => {
    const a = actions();
    render(<WalkPanel walk={walk} labelOf={labelOf} onGo={vi.fn()} actions={a} />);
    const rows = within(screen.getByTestId("walk-order")).getAllByRole("listitem");
    fireEvent.click(within(rows[2]).getByRole("button", { name: "Go" }));
    expect(a.onSetCursor).toHaveBeenCalledWith(3);
    fireEvent.click(within(rows[0]).getByRole("checkbox"));
    expect(a.onMarkCovered).toHaveBeenCalledWith("k1", false);
    fireEvent.click(within(rows[1]).getByRole("checkbox"));
    expect(a.onMarkCovered).toHaveBeenCalledWith("c2", true);
  });

  it("shows the late topics open and the un-voted ones collapsed, each with Go (a pan) and Raise", () => {
    const a = actions();
    const onGo = vi.fn();
    render(<WalkPanel walk={walk} labelOf={labelOf} onGo={onGo} actions={a} />);
    const late = screen.getByTestId("walk-late") as HTMLDetailsElement;
    const unvoted = screen.getByTestId("walk-unvoted") as HTMLDetailsElement;
    expect(within(late).getByText("1 written since the order was set")).toBeTruthy();
    expect(late.open).toBe(true);
    expect(within(unvoted).getByText("2 topics without votes")).toBeTruthy();
    expect(unvoted.open).toBe(false);

    const lateRow = within(late).getByRole("listitem");
    expect(lateRow.getAttribute("data-topic-id")).toBe("late1");
    fireEvent.click(within(lateRow).getByRole("button", { name: "Go" }));
    expect(onGo).toHaveBeenCalledWith(card("late1"));
    expect(a.onSetCursor).not.toHaveBeenCalled();
    fireEvent.click(within(lateRow).getByRole("button", { name: "Raise" }));
    expect(a.onRaise).toHaveBeenCalledWith(card("late1"));

    const unvotedRows = within(unvoted).getAllByRole("listitem");
    expect(unvotedRows.map((row) => row.textContent)).toEqual([expect.stringContaining("Unvoted card"), expect.stringContaining("Unvoted group")]);
    fireEvent.click(within(unvotedRows[1]).getByRole("button", { name: "Raise" }));
    expect(a.onRaise).toHaveBeenCalledWith(cluster("k7"));
  });

  it("leaves out an empty outside section and says so for an empty order", () => {
    render(
      <WalkPanel
        walk={{ ...walk, entries: [], covered: 0, total: 0, late: 0, outside: [] }}
        labelOf={labelOf}
        onGo={vi.fn()}
        actions={actions()}
      />
    );
    expect(screen.getByText("0 of 0 covered · 0 new")).toBeTruthy();
    expect(screen.getByText("Nothing to walk yet")).toBeTruthy();
    expect(screen.queryByTestId("walk-late")).toBeNull();
    expect(screen.queryByTestId("walk-unvoted")).toBeNull();
  });

  it("a participant at defaults sees the acts disabled with the copy; a Team reader gets Go alone, as a pan", () => {
    const a = actions(denied);
    const onGo = vi.fn();
    const { unmount } = render(<WalkPanel walk={walk} labelOf={labelOf} onGo={onGo} actions={a} />);
    const rows = within(screen.getByTestId("walk-order")).getAllByRole("listitem");
    const tick = within(rows[1]).getByRole("checkbox");
    expect(tick.getAttribute("aria-disabled")).toBe("true");
    expect(tick.getAttribute("title")).toBe("Only facilitators and the owner");
    const raise = within(screen.getByTestId("walk-late")).getByRole("button", { name: "Only facilitators and the owner" }) as HTMLButtonElement;
    expect(raise.disabled).toBe(true);
    // Go still pans for everyone; only the shared cursor is gated.
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Go" }));
    expect(onGo).toHaveBeenCalledWith(card("c2"));
    expect(a.onSetCursor).not.toHaveBeenCalled();
    unmount();

    render(<WalkPanel walk={walk} labelOf={labelOf} onGo={onGo} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Raise" })).toBeNull();
    const readerRows = within(screen.getByTestId("walk-order")).getAllByRole("listitem");
    fireEvent.click(within(readerRows[0]).getByRole("button", { name: "Go" }));
    expect(onGo).toHaveBeenCalledWith(cluster("k1"));
  });
});
