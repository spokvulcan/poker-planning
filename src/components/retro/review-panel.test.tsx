/**
 * The review stage's foreground (spec §7, §13, ADR-0017): the Team's open
 * action items from earlier retros, each with the retro it came from, and
 * the register's empty state when there are none.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionsRead } from "@/convex/model/retroActions";
import { REVIEW_EMPTY } from "@/convex/retroCopy";
import { ReviewPanel } from "./review-panel";

afterEach(cleanup);

const read: ActionsRead = {
  items: [
    {
      _id: "a1" as Id<"retroActions">,
      roomId: "r1" as Id<"rooms">,
      roomName: "Sprint 11",
      text: "Write the runbook",
      status: "open",
      createdBy: "u1" as Id<"users">,
      creatorName: "Ada",
      createdAt: 1,
      updatedAt: 1,
      rights: { edit: false, manage: false },
    },
  ],
  rooms: [{ roomId: "r1" as Id<"rooms">, name: "Sprint 11", members: [] }],
};

describe("ReviewPanel", () => {
  it("reads the register's empty state with no open actions from earlier retros", () => {
    render(<ReviewPanel read={{ items: [], rooms: [] }} />);
    const panel = screen.getByTestId("review-panel");
    expect(panel.getAttribute("data-count")).toBe("0");
    expect(screen.getByText(REVIEW_EMPTY)).toBeTruthy();
    expect(REVIEW_EMPTY).toBe("No open actions from earlier retros");
  });

  it("lists the items with the retro each came from", () => {
    render(<ReviewPanel read={read} />);
    expect(screen.getByTestId("review-panel").getAttribute("data-count")).toBe("1");
    expect(screen.getByText("Write the runbook")).toBeTruthy();
    expect(screen.getByText(/Sprint 11/)).toBeTruthy();
    expect(screen.queryByText(REVIEW_EMPTY)).toBeNull();
  });

  it("shows nothing but a placeholder while loading", () => {
    render(<ReviewPanel read={undefined} />);
    expect(screen.getByTestId("review-panel").getAttribute("data-count")).toBe("");
    expect(screen.queryByText(REVIEW_EMPTY)).toBeNull();
  });
});
