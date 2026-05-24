import { describe, it, expect } from "vitest";
import { computePermissions } from "./usePermissions";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import {
  denialMessage,
  RESOLVED_ALLOWED,
  type MemberRole,
  type RoomPermissions,
} from "@/convex/permissions";

const allEveryone: RoomPermissions = {
  revealCards: "everyone",
  gameFlow: "everyone",
  issueManagement: "everyone",
  roomSettings: "everyone",
};

/** Minimal RoomWithRelatedData fixture — only the fields the mapping reads. */
function roomData(opts: {
  role?: MemberRole;
  permissions?: RoomPermissions;
  isOwnerAbsent?: boolean;
}): RoomWithRelatedData {
  return {
    room: { permissions: opts.permissions ?? allEveryone },
    users: [{ _id: "u1", role: opts.role ?? "participant" }],
    isOwnerAbsent: opts.isOwnerAbsent ?? false,
  } as unknown as RoomWithRelatedData;
}

describe("computePermissions — resolved decisions", () => {
  it("carries the resolved message for a category denied by role", () => {
    const result = computePermissions(
      roomData({ role: "participant", permissions: { ...allEveryone, revealCards: "facilitators" } }),
      "u1"
    );
    expect(result.revealCards).toEqual({
      allowed: false,
      message: denialMessage(
        { kind: "category", category: "revealCards", level: "facilitators" },
        "insufficient-role"
      ),
    });
  });

  it("returns the shared RESOLVED_ALLOWED identity for an allowed category", () => {
    const result = computePermissions(roomData({ role: "participant" }), "u1");
    expect(result.gameFlow).toBe(RESOLVED_ALLOWED);
  });

  it("builds the right action per field (owner-level transfer denied for a facilitator)", () => {
    const result = computePermissions(roomData({ role: "facilitator" }), "u1");
    expect(result.transfer).toEqual({
      allowed: false,
      message: denialMessage(
        { kind: "relationship", verb: "transfer" },
        "insufficient-role"
      ),
    });
  });
});

describe("computePermissions — optimistic defaults before data loads", () => {
  it("opens categories and closes relationship actions", () => {
    const result = computePermissions(null, undefined);
    expect(result.revealCards).toBe(RESOLVED_ALLOWED);
    expect(result.gameFlow).toBe(RESOLVED_ALLOWED);
    expect(result.issueManagement).toBe(RESOLVED_ALLOWED);
    expect(result.roomSettings).toBe(RESOLVED_ALLOWED);
    expect(result.transfer.allowed).toBe(false);
    expect(result.removeTarget("participant").allowed).toBe(false);
  });
});
