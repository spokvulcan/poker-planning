/**
 * Readiness and the roster (ADR-0010, spec §7): readiness lives in the
 * presence payload as `{ stageId, ready }`; the projection treats a payload
 * whose stageId is not the current entry as absent, so an advance clears it
 * with no write. The roster shows presence and readiness named per person,
 * offers the viewer's own toggle at one write per change, and offers none
 * in `collect`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { readinessOf, projectRoster } from "./readiness";
import { RetroRoster } from "./retro-roster";
import type { StageEntry } from "@/convex/model/retroFormats";
import type { UserWithPresence } from "@/hooks/useRoomPresence";

afterEach(cleanup);

const users = [
  { _id: "u1", name: "Ada", isSpectator: false, role: "owner", joinedAt: 1, membershipId: "m1" },
  { _id: "u2", name: "Ben", isSpectator: false, role: "participant", joinedAt: 2, membershipId: "m2" },
  { _id: "u3", name: "Cy", isSpectator: false, role: "participant", joinedAt: 3, membershipId: "m3" },
] as never[];

/** The members as `useRoomPresence` hands them over: offline unless a payload says otherwise. */
function withPresence(byId: Record<string, { online: boolean; data?: unknown }>): UserWithPresence[] {
  return users.map((user: { _id: string }) => {
    const entry = byId[user._id];
    return { ...(user as UserWithPresence), isOnline: entry?.online ?? false, lastSeen: null, data: entry?.data };
  });
}

const group: StageEntry = { id: "s-group", kind: "group", cardsVisible: "visible", tallyVisible: "visible" };
const collect: StageEntry = { id: "s-collect", kind: "collect", cardsVisible: "hidden", tallyVisible: "visible" };

describe("readinessOf", () => {
  it("reads ready only from a payload keyed to the current entry", () => {
    expect(readinessOf({ stageId: "s-group", ready: true }, "s-group")).toBe(true);
    expect(readinessOf({ stageId: "s-group", ready: false }, "s-group")).toBe(false);
    // Advancing clears it: the old entry's payload is absent for the new one.
    expect(readinessOf({ stageId: "s-collect", ready: true }, "s-group")).toBe(false);
    expect(readinessOf(undefined, "s-group")).toBe(false);
    expect(readinessOf("garbage", "s-group")).toBe(false);
    expect(readinessOf({ ready: true }, "s-group")).toBe(false);
  });
});

describe("projectRoster", () => {
  it("reads readiness from every member's payload, online first", () => {
    const rows = projectRoster(
      withPresence({ u2: { online: true, data: { stageId: "s-group", ready: true } }, u1: { online: false, data: { stageId: "s-group", ready: true } } }),
      "s-group"
    );
    expect(rows.map((r) => [r.name, r.isOnline, r.ready])).toEqual([
      ["Ben", true, true],
      ["Ada", false, true],
      ["Cy", false, false],
    ]);
  });

  it("reads everyone as not ready after the pointer moves", () => {
    const moved = withPresence({ u1: { online: true, data: { stageId: "s-collect", ready: true } } });
    expect(projectRoster(moved, "s-group").every((r) => !r.ready)).toBe(true);
    expect(projectRoster(withPresence({}), "s-group").every((r) => !r.isOnline && !r.ready)).toBe(true);
  });
});

describe("RetroRoster", () => {
  it("shows each person with readiness, and the viewer's toggle writes once per change", () => {
    const onSetReady = vi.fn();
    const members = withPresence({
      u1: { online: true, data: { stageId: "s-group", ready: false } },
      u2: { online: true, data: { stageId: "s-group", ready: true } },
    });
    render(<RetroRoster users={members} currentStage={group} myUserId="u1" onSetReady={onSetReady} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const ben = rows.find((r) => r.textContent?.includes("Ben"))!;
    expect(ben.getAttribute("data-ready")).toBe("true");
    expect(within(ben).getByText("Ready")).toBeTruthy();
    const cy = rows.find((r) => r.textContent?.includes("Cy"))!;
    expect(cy.getAttribute("data-ready")).toBe("false");
    expect(cy.getAttribute("data-online")).toBe("false");

    const toggle = screen.getByRole("switch", { name: "I'm ready" });
    fireEvent.click(toggle);
    expect(onSetReady).toHaveBeenCalledTimes(1);
    expect(onSetReady).toHaveBeenCalledWith(true);
  });

  it("offers no readiness in collect", () => {
    render(
      <RetroRoster users={withPresence({})} currentStage={collect} myUserId="u1" onSetReady={vi.fn()} />
    );
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Ready")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByRole("listitem")[0].hasAttribute("data-ready")).toBe(false);
  });
});
