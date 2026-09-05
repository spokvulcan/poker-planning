/**
 * The board header (spec §5, §7, §19): the retro's name, the stage pill
 * showing the shared stage, and the write-time disclosure — the team line
 * linking to the team page on a team retro, the teamless line otherwise.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { RetroHeader } from "./retro-header";
import { TEAMLESS_DISCLOSURE, STAGE_LABELS, keptByTeam } from "@/convex/retroCopy";

afterEach(cleanup);

describe("RetroHeader", () => {
  it("shows the name, the teamless disclosure and the shared stage on the pill", () => {
    render(<RetroHeader name="Sprint 12" stageKind="collect" />);
    expect(screen.getByRole("heading", { name: "Sprint 12" })).toBeTruthy();
    expect(screen.getByText(TEAMLESS_DISCLOSURE)).toBeTruthy();
    expect(screen.getByTestId("disclosure").getAttribute("data-kept")).toBe("none");
    expect(screen.queryByRole("link")).toBeNull();
    const pill = screen.getByTestId("stage-pill");
    expect(pill.textContent).toContain(STAGE_LABELS.collect);
    expect(pill.getAttribute("data-stage")).toBe("collect");
  });

  it("on a team retro, the team line links to the team page", () => {
    render(
      <RetroHeader name="R" stageKind="group" team={{ _id: "team-1" as never, name: "Acme Squad" }} />
    );
    const link = screen.getByRole("link", { name: keptByTeam("Acme Squad") });
    expect(link.getAttribute("href")).toBe("/team/team-1");
    expect(screen.getByTestId("disclosure").getAttribute("data-kept")).toBe("team");
    expect(screen.queryByText(TEAMLESS_DISCLOSURE)).toBeNull();
  });

  it("shows the cards-due date only when one is set, and renders the menu slot", () => {
    const { rerender } = render(<RetroHeader name="R" stageKind="collect" />);
    expect(screen.queryByTestId("collect-until")).toBeNull();
    rerender(
      <RetroHeader
        name="R"
        stageKind="collect"
        collectUntil={Date.UTC(2026, 8, 10)}
        menu={<button>Menu</button>}
      />
    );
    expect(screen.getByTestId("collect-until").textContent).toMatch(/Cards due/);
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
  });
});
