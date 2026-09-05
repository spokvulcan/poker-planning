/**
 * The minimal listing row (spec §16.5): name, resting stage, cards-due
 * while set, in the order given, each routing to its board.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { RetroRows } from "./retro-list";
import { STAGE_LABELS } from "@/convex/retroCopy";

afterEach(cleanup);

describe("RetroRows", () => {
  it("renders rows in order with name, stage and the cards-due date, linking to the board", () => {
    render(
      <RetroRows
        rows={[
          { roomId: "r1" as never, name: "Collecting", stageKind: "collect", collectUntil: Date.UTC(2026, 8, 10), createdAt: 2 },
          { roomId: "r2" as never, name: "Closed", stageKind: "close", createdAt: 1 },
        ]}
      />
    );
    const rows = screen.getAllByTestId("retro-row");
    expect(rows.map((row) => row.getAttribute("data-stage"))).toEqual(["collect", "close"]);
    expect(rows[0].textContent).toContain("Collecting");
    expect(rows[0].textContent).toContain(STAGE_LABELS.collect);
    expect(rows[0].textContent).toMatch(/Cards due/);
    expect(rows[1].textContent).not.toMatch(/Cards due/);
    expect(screen.getByRole("link", { name: /Collecting/ }).getAttribute("href")).toBe("/room/r1");
    expect(screen.getByRole("link", { name: /Closed/ }).getAttribute("href")).toBe("/room/r2");
  });
});
