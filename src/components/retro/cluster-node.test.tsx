/**
 * The cluster chip (spec §10.3, ADR-0011): the name and count at the
 * centroid, and the `cardManagement` menu — rename, merge, tidy, dissolve —
 * disabled with the decision's copy for a participant at defaults, absent
 * for a Team reader.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import type { NodeProps } from "@xyflow/react";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ render: el, children }: { render: ReactElement; children?: ReactNode }) =>
    cloneElement(el, undefined, children),
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children?: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button role="menuitem" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));
vi.mock("@/components/ui/dialog", () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: pass,
    DialogHeader: pass,
    DialogFooter: pass,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  };
});

import { ClusterNodeView, type ClusterNode } from "./cluster-node";

afterEach(cleanup);

const chip = { clusterId: "k1", name: "Group 1", position: { x: 100, y: 50 }, count: 3 };
const others = [{ clusterId: "k2", name: "Group 2" }];
const allowed = { allowed: true as const };
const denied = { allowed: false as const, message: "Only facilitators can manage cards" };

function renderChip(data: ClusterNode["data"]) {
  const props = { id: data.chip.clusterId, data } as unknown as NodeProps<ClusterNode>;
  return render(<ClusterNodeView {...props} />);
}

const actions = () => ({
  rename: vi.fn().mockResolvedValue(true),
  merge: vi.fn().mockResolvedValue(true),
  dissolve: vi.fn().mockResolvedValue(true),
  tidy: vi.fn(),
});

describe("ClusterNodeView", () => {
  it("shows the name and count; a Team reader gets no menu", () => {
    renderChip({ chip, others });
    const root = document.querySelector("[data-cluster-chip='k1']")!;
    expect(root.getAttribute("data-count")).toBe("3");
    expect(screen.getByTestId("cluster-name").textContent).toBe("Group 1");
    expect(screen.getByText("3 cards")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Group actions" })).toBeNull();
  });

  it("a participant at defaults sees the menu disabled with the decision's copy", () => {
    renderChip({ chip, others, decision: denied, actions: actions() });
    const trigger = screen.getByRole("button", { name: "Group actions" }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(trigger.title).toBe("Only facilitators can manage cards");
  });

  it("under cardManagement: rename saves the trimmed name, merge picks a target, tidy and dissolve fire", async () => {
    const acts = actions();
    renderChip({ chip, others, decision: allowed, actions: acts });
    expect((screen.getByRole("button", { name: "Group actions" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("menuitem", { name: "Rename group" }));
    const rename = within(screen.getByRole("dialog"));
    fireEvent.change(rename.getByLabelText("Group name"), { target: { value: "  Demo  " } });
    await act(async () => {
      fireEvent.click(rename.getByRole("button", { name: "Save" }));
    });
    expect(acts.rename).toHaveBeenCalledWith("k1", "Demo");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Merge into…" }));
    const merge = within(screen.getByRole("dialog"));
    expect((merge.getByLabelText("Into") as HTMLSelectElement).value).toBe("k2");
    await act(async () => {
      fireEvent.click(merge.getByRole("button", { name: "Merge" }));
    });
    expect(acts.merge).toHaveBeenCalledWith("k1", "k2");

    fireEvent.click(screen.getByRole("menuitem", { name: "Tidy" }));
    expect(acts.tidy).toHaveBeenCalledWith("k1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Dissolve group" }));
    expect(acts.dissolve).toHaveBeenCalledWith("k1");
  });

  it("merge is disabled when there is no other cluster", () => {
    renderChip({ chip, others: [], decision: allowed, actions: actions() });
    expect((screen.getByRole("menuitem", { name: "Merge into…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
