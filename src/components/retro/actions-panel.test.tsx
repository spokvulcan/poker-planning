/**
 * The retro's actions panel (spec §7, §13, ADR-0017): reachable at every
 * stage, with the composer for attendees at every stage but `collect`,
 * the roster to own the first item, and at `close` the facts line.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionsRead } from "@/convex/model/retroActions";
import type { StageKind } from "@/convex/model/retroFormats";
import { ACTIONS_EMPTY, UNOWNED_ACTION, closeFacts } from "@/convex/retroCopy";
import { ActionsPanel } from "./actions-panel";
import type { ActionActions } from "./use-action-actions";

afterEach(cleanup);

const roomId = "r1" as Id<"rooms">;

/** An empty retro's read: no items, its own roster all the same. */
const empty: ActionsRead = {
  items: [],
  rooms: [
    {
      roomId,
      name: "Sprint 12",
      members: [
        { userId: "u1" as Id<"users">, name: "Ada" },
        { userId: "u2" as Id<"users">, name: "Grace" },
      ],
      attending: true,
    },
  ],
};

const item = (id: string, ownerId?: string): ActionsRead["items"][number] => ({
  _id: id as Id<"retroActions">,
  roomId,
  roomName: "Sprint 12",
  text: `Action ${id}`,
  status: "open",
  createdBy: "u1" as Id<"users">,
  creatorName: "Ada",
  createdAt: 1,
  updatedAt: 1,
  ...(ownerId ? { ownerId: ownerId as Id<"users">, ownerName: "Grace" } : {}),
  rights: { edit: false, manage: false },
});

function acts(): ActionActions {
  return { create: vi.fn(), edit: vi.fn(), setStatus: vi.fn(), assign: vi.fn(), remove: vi.fn() };
}

const panel = (stageKind: StageKind, read: ActionsRead = empty, actions: ActionActions | "reader" = acts()) =>
  render(
    <ActionsPanel roomId={roomId} read={read} stageKind={stageKind} actions={actions === "reader" ? undefined : actions} />
  );

describe("ActionsPanel", () => {
  it.each<StageKind>(["review", "group", "vote", "discuss", "close"])(
    "offers the composer to an attendee in %s",
    (kind) => {
      panel(kind);
      expect(screen.getByTestId("action-composer")).toBeTruthy();
    }
  );

  it("offers nothing that invites an action during collect (ADR-0017)", () => {
    panel("collect");
    expect(screen.queryByTestId("action-composer")).toBeNull();
    expect(screen.getByTestId("actions-list").textContent).toBe(ACTIONS_EMPTY);
  });

  it("offers no composer to a Team reader", () => {
    panel("close", empty, "reader");
    expect(screen.queryByTestId("action-composer")).toBeNull();
  });

  it("lets the first item of a retro be owned: the roster is there before any item is", () => {
    panel("discuss");
    const picker = screen.getByRole("combobox", { name: "Owner" });
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual([UNOWNED_ACTION, "Ada", "Grace"]);
  });

  it("at close states the facts: the count and the unowned, never a judgement", () => {
    const read: ActionsRead = { ...empty, items: [item("a1"), item("a2", "u2"), item("a3")] };
    panel("close", read);
    const section = screen.getByTestId("actions-panel");
    expect(section.getAttribute("data-count")).toBe("3");
    expect(section.getAttribute("data-unowned")).toBe("2");
    expect(screen.getByTestId("close-facts").textContent).toBe(closeFacts(3, 2));
    expect(closeFacts(3, 2)).toBe("3 actions, 2 unowned");
    cleanup();
    panel("discuss", read);
    expect(screen.queryByTestId("close-facts")).toBeNull();
  });
});
