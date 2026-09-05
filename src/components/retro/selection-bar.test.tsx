/**
 * The selection bar (spec §10.3, §10.4): what a selection can become. Open
 * to everyone; "Add to group" only when a cluster exists, "Remove from
 * group" only when a selected card is in one, nothing at all for none.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ render: el, children }: { render: ReactElement; children?: ReactNode }) =>
    cloneElement(el, undefined, children),
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button role="menuitem" onClick={onClick}>{children}</button>
  ),
}));

import { SelectionBar } from "./selection-bar";

afterEach(cleanup);

const handlers = () => ({ onGroup: vi.fn(), onAddTo: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() });

describe("SelectionBar", () => {
  it("renders nothing for an empty selection", () => {
    render(<SelectionBar count={0} inCluster={0} clusters={[]} {...handlers()} />);
    expect(screen.queryByTestId("selection-bar")).toBeNull();
  });

  it("offers Group for a plain selection with no clusters on the board, and clears", () => {
    const h = handlers();
    render(<SelectionBar count={2} inCluster={0} clusters={[]} {...h} />);
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Group 2 cards" }));
    expect(h.onGroup).toHaveBeenCalled();
    expect(screen.queryByText("Add to group")).toBeNull();
    expect(screen.queryByText("Remove from group")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(h.onClear).toHaveBeenCalled();
  });

  it("offers the clusters as Add-to targets and Remove when a selected card is grouped", () => {
    const h = handlers();
    render(
      <SelectionBar
        count={1}
        inCluster={1}
        clusters={[{ clusterId: "k1", name: "Group 1" }, { clusterId: "k2", name: "Demo" }]}
        {...h}
      />
    );
    expect(screen.getByRole("button", { name: "Group 1 card" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Demo" }));
    expect(h.onAddTo).toHaveBeenCalledWith("k2");
    fireEvent.click(screen.getByRole("button", { name: "Remove from group" }));
    expect(h.onRemove).toHaveBeenCalled();
  });
});
