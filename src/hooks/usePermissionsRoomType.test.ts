import { describe, it, expect } from "vitest";
import { computePermissions, computePokerPermissions } from "./usePermissions";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import {
  denialMessage,
  DEFAULT_PERMISSIONS,
  DEFAULT_RETRO_PERMISSIONS,
  RESOLVED_ALLOWED,
  type MemberRole,
  type RetroPermissions,
  type RoomPermissions,
} from "@/convex/permissions";

// The client permissions computation returns a union discriminated on the
// ceremony (ADR-0013): the poker arm keeps its four decisions, the retro arm
// carries the four retro decisions, and role, owner flags and relationship
// decisions are shared. The poker assertions live in usePermissions.test.ts.

function roomData(opts: {
  roomType?: "canvas" | "retro";
  role?: MemberRole;
  permissions?: RoomPermissions | RetroPermissions;
  isOwnerAbsent?: boolean;
}): RoomWithRelatedData {
  return {
    room: {
      ...(opts.roomType ? { roomType: opts.roomType } : {}),
      ...(opts.permissions ? { permissions: opts.permissions } : {}),
    },
    users: [{ _id: "u1", role: opts.role ?? "participant" }],
    isOwnerAbsent: opts.isOwnerAbsent ?? false,
  } as unknown as RoomWithRelatedData;
}

describe("computePermissions — discriminated on ceremony", () => {
  it("returns the poker arm for an undefined roomType", () => {
    const result = computePermissions(roomData({}), "u1");
    expect(result.ceremony).toBe("poker");
    if (result.ceremony !== "poker") throw new Error("unreachable");
    expect(result.permissions).toEqual(DEFAULT_PERMISSIONS);
    expect(result.revealCards).toBe(RESOLVED_ALLOWED);
  });

  it("returns the poker arm for roomType canvas", () => {
    const result = computePermissions(roomData({ roomType: "canvas" }), "u1");
    expect(result.ceremony).toBe("poker");
  });

  it("returns the poker arm before data loads (optimistic defaults)", () => {
    const result = computePermissions(null, undefined);
    expect(result.ceremony).toBe("poker");
  });

  it("returns the retro arm for roomType retro, at the retro defaults", () => {
    const result = computePermissions(roomData({ roomType: "retro" }), "u1");
    expect(result.ceremony).toBe("retro");
    if (result.ceremony !== "retro") throw new Error("unreachable");
    expect(result.permissions).toEqual(DEFAULT_RETRO_PERMISSIONS);
    expect(result.stageFlow).toEqual({
      allowed: false,
      message: denialMessage(
        { kind: "category", category: "stageFlow", level: "facilitators" },
        "insufficient-role"
      ),
    });
    expect(result.cardManagement.allowed).toBe(false);
    expect(result.actionManagement).toBe(RESOLVED_ALLOWED);
    expect(result.retroSettings.allowed).toBe(false);
  });

  it("the retro arm honours stored retro permissions", () => {
    const result = computePermissions(
      roomData({
        roomType: "retro",
        permissions: { ...DEFAULT_RETRO_PERMISSIONS, stageFlow: "everyone" },
      }),
      "u1"
    );
    if (result.ceremony !== "retro") throw new Error("unreachable");
    expect(result.stageFlow).toBe(RESOLVED_ALLOWED);
  });

  it("shares role, owner flags and relationship decisions across both arms", () => {
    const result = computePermissions(
      roomData({ roomType: "retro", role: "facilitator" }),
      "u1"
    );
    expect(result.role).toBe("facilitator");
    expect(result.isFacilitator).toBe(true);
    expect(result.isOwner).toBe(false);
    expect(result.isOwnerAbsent).toBe(false);
    expect(result.promoteTarget("participant")).toBe(RESOLVED_ALLOWED);
    expect(result.transfer.allowed).toBe(false);
    expect(result.changePermissions.allowed).toBe(false);
  });

  it("the retro arm carries no poker decisions and vice versa", () => {
    const retro = computePermissions(roomData({ roomType: "retro" }), "u1");
    expect("revealCards" in retro).toBe(false);
    const poker = computePermissions(roomData({}), "u1");
    expect("stageFlow" in poker).toBe(false);
  });
});

describe("computePokerPermissions — the poker consumers' narrowing", () => {
  it("returns the poker arm for a poker room", () => {
    const result = computePokerPermissions(roomData({}), "u1");
    expect(result.ceremony).toBe("poker");
    expect(result.gameFlow).toBe(RESOLVED_ALLOWED);
  });

  it("throws when the room is a retro — a poker surface rendered for the wrong ceremony", () => {
    expect(() => computePokerPermissions(roomData({ roomType: "retro" }), "u1")).toThrow(
      /poker/
    );
  });
});
