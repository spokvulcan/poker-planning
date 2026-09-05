/**
 * The phone's chrome (spec §10.4, ADR-0011): one stage pill, one bottom
 * sheet, one card-creation button, and the tap-selection's Group controls
 * in the same bar. Writing a card needs no spatial step: the button opens
 * the composer, whose prompt picker is the only choice.
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
vi.mock("@/components/ui/sheet", () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Sheet: ({ children, open }: { children?: ReactNode; open: boolean }) => (open ? <div role="dialog">{children}</div> : null),
    SheetContent: ({ children, ...rest }: { children?: ReactNode; "data-testid"?: string }) => (
      <div data-testid={rest["data-testid"]}>{children}</div>
    ),
    SheetHeader: pass,
    SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

import { MobileChrome } from "./mobile-chrome";
import { VoteBudget } from "./vote-budget";
import { CardComposer } from "./card-composer";
import { useState } from "react";

afterEach(cleanup);

const prompts = [
  { id: "p1", label: "What went well?", color: "green", order: 0 },
  { id: "p2", label: "Ideas", color: "blue", order: 1 },
];

describe("MobileChrome", () => {
  it("renders the stage pill, the sheet on demand, and the card button", () => {
    const onCompose = vi.fn();
    render(
      <MobileChrome name="Sprint 42" stageKind="collect" onCompose={onCompose}>
        <p>sheet body</p>
      </MobileChrome>
    );
    expect(screen.getByTestId("stage-pill").getAttribute("data-stage")).toBe("collect");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Board menu" }));
    expect(screen.getByTestId("board-sheet").textContent).toContain("sheet body");
    expect(screen.getByRole("heading", { name: "Sprint 42" })).toBeTruthy();
    expect(screen.getByText("Not kept by a team. This retro disappears after 5 quiet days.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    expect(onCompose).toHaveBeenCalled();
  });

  it("a Team reader gets the pill and the sheet, no card button and no Group controls", () => {
    render(
      <MobileChrome name="R" teamName="Owls" stageKind="discuss">
        <p>roster</p>
      </MobileChrome>
    );
    expect(screen.queryByRole("button", { name: "Add card" })).toBeNull();
    expect(screen.queryByTestId("selection-bar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Board menu" }));
    expect(screen.getByText(/Kept by Owls/)).toBeTruthy();
  });

  it("surfaces the tap-selection's Group control in the bar", () => {
    const onGroup = vi.fn();
    render(
      <MobileChrome
        name="R"
        stageKind="group"
        selection={{ count: 2, inCluster: 0, clusters: [], onGroup, onAddTo: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }}
      >
        <p />
      </MobileChrome>
    );
    fireEvent.click(screen.getByRole("button", { name: "Group 2 cards" }));
    expect(onGroup).toHaveBeenCalled();
  });

  it("a card is written from the bar through the composer's prompt picker, with no spatial step", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    function Phone() {
      const [composing, setComposing] = useState(false);
      return (
        <>
          <MobileChrome name="R" stageKind="collect" onCompose={() => setComposing(true)}>
            <p />
          </MobileChrome>
          <CardComposer
            open={composing}
            onOpenChange={setComposing}
            prompts={prompts}
            viewerName="Ada"
            attribution="named"
            hidden
            onSubmit={onSubmit}
          />
        </>
      );
    }
    render(<Phone />);
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    const picker = screen.getByLabelText("Prompt") as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Your card"), { target: { value: "Try mob sessions" } });
    fireEvent.click(screen.getByRole("button", { name: "Post card" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith("p2", "Try mob sessions"));
  });

  it("carries the vote budget in the bar while the entry takes dots, with the anonymous line (spec §11, §19)", () => {
    render(
      <MobileChrome name="R" stageKind="vote" note={<VoteBudget left={3} budget={5} anonymous />}>
        <p />
      </MobileChrome>
    );
    const budget = screen.getByTestId("vote-budget");
    expect(screen.getByTestId("mobile-bar").contains(budget)).toBe(true);
    expect(budget.getAttribute("data-left")).toBe("3");
    expect(budget.textContent).toContain("3 of 5 votes left");
    expect(budget.textContent).toContain("Nobody is shown how you voted.");
  });
});
