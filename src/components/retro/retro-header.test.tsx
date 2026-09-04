/**
 * The board header (spec §5, §7, §19): the retro's name, the stage pill
 * showing the shared stage, and the write-time disclosure — the teamless
 * line here, the team line once #289 stamps a Team.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RetroHeader } from "./retro-header";
import { TEAMLESS_DISCLOSURE, STAGE_LABELS } from "@/convex/retroCopy";

afterEach(cleanup);

describe("RetroHeader", () => {
  it("shows the name, the teamless disclosure and the shared stage on the pill", () => {
    render(<RetroHeader name="Sprint 12" stageKind="collect" />);
    expect(screen.getByRole("heading", { name: "Sprint 12" })).toBeTruthy();
    expect(screen.getByText(TEAMLESS_DISCLOSURE)).toBeTruthy();
    const pill = screen.getByTestId("stage-pill");
    expect(pill.textContent).toContain(STAGE_LABELS.collect);
    expect(pill.getAttribute("data-stage")).toBe("collect");
  });

  it("shows the cards-due date only when one is set", () => {
    const { rerender } = render(<RetroHeader name="R" stageKind="collect" />);
    expect(screen.queryByTestId("collect-until")).toBeNull();
    rerender(<RetroHeader name="R" stageKind="collect" collectUntil={Date.UTC(2026, 8, 10)} />);
    expect(screen.getByTestId("collect-until").textContent).toMatch(/Cards due/);
  });
});
