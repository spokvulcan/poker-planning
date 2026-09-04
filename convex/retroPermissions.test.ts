import { describe, it, expect } from "vitest";
import type { Doc } from "./_generated/dataModel";
import {
  evaluate,
  denialMessage,
  requiresOwnerLevel,
  readsOwnerAbsence,
  getEffectivePermissions,
  categoryLevel,
  DEFAULT_PERMISSIONS,
  DEFAULT_RETRO_PERMISSIONS,
  type Action,
  type DecisionContext,
  type MemberRole,
  type RetroPermissionCategory,
} from "./permissions";

// The retro arm of the permission decision (ADR-0013). Every poker assertion
// lives in permissions.test.ts and is untouched; this file covers only what
// the retro category set and the three new verbs add.

function ctx(over: Partial<DecisionContext> = {}): DecisionContext {
  return {
    actorRole: "participant",
    permissions: DEFAULT_RETRO_PERMISSIONS,
    ownerAbsent: false,
    ownerInTeam: false,
    ...over,
  };
}

/** A retro category action at the retro defaults. */
function retro(category: RetroPermissionCategory): Action {
  return {
    kind: "category",
    category,
    level: DEFAULT_RETRO_PERMISSIONS[category],
  };
}

describe("DEFAULT_RETRO_PERMISSIONS", () => {
  it("gates stage flow, card management and settings to facilitators, and opens action management", () => {
    expect(DEFAULT_RETRO_PERMISSIONS).toEqual({
      stageFlow: "facilitators",
      cardManagement: "facilitators",
      actionManagement: "everyone",
      retroSettings: "facilitators",
    });
  });

  it("has exactly four categories — own-card edits and forming a cluster are never in the config", () => {
    // Writing, editing, deleting or moving your own card and forming a
    // cluster are always allowed to any member (spec §4.2 "never in the
    // config"). They are not categories, so a participant can always do them
    // regardless of what the owner configures.
    expect(Object.keys(DEFAULT_RETRO_PERMISSIONS).sort()).toEqual([
      "actionManagement",
      "cardManagement",
      "retroSettings",
      "stageFlow",
    ]);
  });
});

describe("evaluate — retro categories at defaults", () => {
  it("a participant cannot advance", () => {
    expect(evaluate(retro("stageFlow"), ctx())).toEqual({
      allowed: false,
      reason: "insufficient-role",
    });
  });

  it("a participant cannot touch another person's card", () => {
    expect(evaluate(retro("cardManagement"), ctx())).toEqual({
      allowed: false,
      reason: "insufficient-role",
    });
  });

  it("a participant can manage action items", () => {
    expect(evaluate(retro("actionManagement"), ctx())).toEqual({
      allowed: true,
    });
  });

  it("a participant cannot edit retro settings", () => {
    expect(evaluate(retro("retroSettings"), ctx())).toEqual({
      allowed: false,
      reason: "insufficient-role",
    });
  });

  it.each<MemberRole>(["facilitator", "owner"])(
    "a %s passes every retro category",
    (role) => {
      for (const category of [
        "stageFlow",
        "cardManagement",
        "actionManagement",
        "retroSettings",
      ] as const) {
        expect(evaluate(retro(category), ctx({ actorRole: role }))).toEqual({
          allowed: true,
        });
      }
    }
  );
});

describe("evaluate — ratchet and delete are owner-level", () => {
  const ratchet: Action = { kind: "relationship", verb: "ratchet" };
  const del: Action = { kind: "relationship", verb: "delete" };

  it("are owner-level actions", () => {
    expect(requiresOwnerLevel(ratchet)).toBe(true);
    expect(requiresOwnerLevel(del)).toBe(true);
  });

  it.each([ratchet, del])("$verb: owner allowed", (action) => {
    expect(evaluate(action, ctx({ actorRole: "owner" }))).toEqual({
      allowed: true,
    });
  });

  it.each([ratchet, del])(
    "$verb: facilitator denied with insufficient-role while the owner is present",
    (action) => {
      expect(evaluate(action, ctx({ actorRole: "facilitator" }))).toEqual({
        allowed: false,
        reason: "insufficient-role",
      });
      expect(denialMessage(action, "insufficient-role")).toBe(
        "Only the owner can do this."
      );
    }
  );

  it.each([ratchet, del])(
    "$verb: facilitator denied with owner-absent under lockdown (existing copy)",
    (action) => {
      expect(
        evaluate(action, ctx({ actorRole: "facilitator", ownerAbsent: true }))
      ).toEqual({ allowed: false, reason: "owner-absent" });
      expect(denialMessage(action, "owner-absent")).toBe(
        "Room owner has left. Owner-level actions are disabled until the owner returns."
      );
    }
  );
});

describe("evaluate — claim (a team admin's one room power)", () => {
  const claim: Action = { kind: "relationship", verb: "claim" };

  it("is not owner-level, but its decision reads owner absence", () => {
    expect(requiresOwnerLevel(claim)).toBe(false);
    expect(readsOwnerAbsence(claim)).toBe(true);
  });

  it("admin with the owner present and in the Team → owner-present", () => {
    expect(
      evaluate(
        claim,
        ctx({ actorTeamRole: "admin", ownerAbsent: false, ownerInTeam: true })
      )
    ).toEqual({ allowed: false, reason: "owner-present" });
  });

  it("admin with the owner absent → allowed", () => {
    expect(
      evaluate(
        claim,
        ctx({ actorTeamRole: "admin", ownerAbsent: true, ownerInTeam: true })
      )
    ).toEqual({ allowed: true });
  });

  it("admin with the owner present but outside the Team → allowed", () => {
    expect(
      evaluate(
        claim,
        ctx({ actorTeamRole: "admin", ownerAbsent: false, ownerInTeam: false })
      )
    ).toEqual({ allowed: true });
  });

  it("non-admin → insufficient-role, whatever the owner's state", () => {
    for (const actorTeamRole of ["member", undefined] as const) {
      for (const ownerAbsent of [true, false]) {
        for (const ownerInTeam of [true, false]) {
          expect(
            evaluate(
              claim,
              ctx({ actorRole: "facilitator", actorTeamRole, ownerAbsent, ownerInTeam })
            )
          ).toEqual({ allowed: false, reason: "insufficient-role" });
        }
      }
    }
  });

  it("room role never substitutes for team role — a room owner without admin cannot claim", () => {
    expect(evaluate(claim, ctx({ actorRole: "owner" }))).toEqual({
      allowed: false,
      reason: "insufficient-role",
    });
  });

  it("carries the owner-present copy", () => {
    expect(denialMessage(claim, "owner-present")).toBe(
      "The owner is still here — ask them to transfer ownership."
    );
  });

  it("names the team admin in its insufficient-role copy", () => {
    expect(denialMessage(claim, "insufficient-role")).toBe(
      "Only a team admin can claim this room."
    );
  });
});

describe("readsOwnerAbsence", () => {
  it("is true for every owner-level action and for claim, false otherwise", () => {
    const ownerCategory: Action = {
      kind: "category",
      category: "roomSettings",
      level: "owner",
    };
    const openCategory: Action = {
      kind: "category",
      category: "stageFlow",
      level: "facilitators",
    };
    expect(readsOwnerAbsence(ownerCategory)).toBe(true);
    expect(readsOwnerAbsence({ kind: "relationship", verb: "transfer" })).toBe(true);
    expect(readsOwnerAbsence({ kind: "relationship", verb: "claim" })).toBe(true);
    expect(readsOwnerAbsence(openCategory)).toBe(false);
    expect(
      readsOwnerAbsence({ kind: "relationship", verb: "promote", targetRole: "participant" })
    ).toBe(false);
  });
});

// --- getEffectivePermissions keyed by room type ---

function room(over: Partial<Doc<"rooms">> = {}): Doc<"rooms"> {
  return {
    _id: "r1",
    _creationTime: 0,
    name: "R",
    autoCompleteVoting: false,
    isGameOver: false,
    createdAt: 0,
    lastActivityAt: 0,
    retained: false,
    ...over,
  } as Doc<"rooms">;
}

describe("getEffectivePermissions — discriminated on room type", () => {
  it("returns the poker defaults for an undefined roomType (legacy)", () => {
    expect(getEffectivePermissions(room())).toEqual({
      ceremony: "poker",
      permissions: DEFAULT_PERMISSIONS,
    });
  });

  it("returns the poker defaults for roomType canvas", () => {
    expect(getEffectivePermissions(room({ roomType: "canvas" }))).toEqual({
      ceremony: "poker",
      permissions: DEFAULT_PERMISSIONS,
    });
  });

  it("returns the stored poker permissions for a poker room", () => {
    const stored = { ...DEFAULT_PERMISSIONS, revealCards: "owner" as const };
    expect(getEffectivePermissions(room({ permissions: stored }))).toEqual({
      ceremony: "poker",
      permissions: stored,
    });
  });

  it("returns the retro defaults for roomType retro with nothing stored", () => {
    expect(getEffectivePermissions(room({ roomType: "retro" }))).toEqual({
      ceremony: "retro",
      permissions: DEFAULT_RETRO_PERMISSIONS,
    });
  });

  it("returns the stored retro permissions for a retro room", () => {
    const stored = { ...DEFAULT_RETRO_PERMISSIONS, stageFlow: "everyone" as const };
    expect(
      getEffectivePermissions(room({ roomType: "retro", permissions: stored }))
    ).toEqual({ ceremony: "retro", permissions: stored });
  });

  it("falls back to the room type's defaults when the stored shape belongs to the other type", () => {
    expect(
      getEffectivePermissions(
        room({ roomType: "retro", permissions: DEFAULT_PERMISSIONS })
      )
    ).toEqual({ ceremony: "retro", permissions: DEFAULT_RETRO_PERMISSIONS });
    expect(
      getEffectivePermissions(
        room({ roomType: "canvas", permissions: DEFAULT_RETRO_PERMISSIONS })
      )
    ).toEqual({ ceremony: "poker", permissions: DEFAULT_PERMISSIONS });
  });
});

describe("categoryLevel — narrows on the room type before indexing", () => {
  it("resolves a category that belongs to the room's set", () => {
    expect(categoryLevel(getEffectivePermissions(room()), "revealCards")).toBe(
      "everyone"
    );
    expect(
      categoryLevel(getEffectivePermissions(room({ roomType: "retro" })), "stageFlow")
    ).toBe("facilitators");
  });

  it("is undefined for a category from the other room type", () => {
    expect(categoryLevel(getEffectivePermissions(room()), "stageFlow")).toBeUndefined();
    expect(
      categoryLevel(getEffectivePermissions(room({ roomType: "retro" })), "revealCards")
    ).toBeUndefined();
  });
});
