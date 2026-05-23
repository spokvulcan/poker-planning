import { describe, it, expect } from "vitest";
import {
  evaluate,
  denialMessage,
  type Action,
  type Decision,
  type DecisionContext,
  type MemberRole,
  type PermissionCategory,
  type PermissionLevel,
  type RoomPermissions,
} from "./permissions";

const allEveryone: RoomPermissions = {
  revealCards: "everyone",
  gameFlow: "everyone",
  issueManagement: "everyone",
  roomSettings: "everyone",
};

function ctx(over: Partial<DecisionContext> = {}): DecisionContext {
  return {
    actorRole: "participant",
    permissions: allEveryone,
    ownerAbsent: false,
    ...over,
  };
}

describe("evaluate — category actions", () => {
  it("allows a participant when the category is set to everyone", () => {
    const action: Action = {
      kind: "category",
      category: "revealCards",
      level: "everyone",
    };
    expect(evaluate(action, ctx())).toEqual({ allowed: true });
  });

  // Explicit truth table: permission level × actor role × ownerAbsent.
  // (owner role with ownerAbsent is impossible by invariant — owner present
  // iff an owner-role membership exists — so those rows are omitted.)
  const rows: Array<{
    level: PermissionLevel;
    role: MemberRole;
    ownerAbsent: boolean;
    expected: Decision;
  }> = [
    // everyone — anyone passes, lockdown irrelevant
    { level: "everyone", role: "participant", ownerAbsent: false, expected: { allowed: true } },
    { level: "everyone", role: "participant", ownerAbsent: true, expected: { allowed: true } },
    { level: "everyone", role: "facilitator", ownerAbsent: false, expected: { allowed: true } },
    { level: "everyone", role: "facilitator", ownerAbsent: true, expected: { allowed: true } },
    { level: "everyone", role: "owner", ownerAbsent: false, expected: { allowed: true } },
    // facilitators — facilitator+owner pass; not an owner-level requirement, so
    // ownerAbsent never refines the reason
    { level: "facilitators", role: "participant", ownerAbsent: false, expected: { allowed: false, reason: "insufficient-role" } },
    { level: "facilitators", role: "participant", ownerAbsent: true, expected: { allowed: false, reason: "insufficient-role" } },
    { level: "facilitators", role: "facilitator", ownerAbsent: false, expected: { allowed: true } },
    { level: "facilitators", role: "facilitator", ownerAbsent: true, expected: { allowed: true } },
    { level: "facilitators", role: "owner", ownerAbsent: false, expected: { allowed: true } },
    // owner — only owner passes; under lockdown the reason refines to owner-absent
    { level: "owner", role: "participant", ownerAbsent: false, expected: { allowed: false, reason: "insufficient-role" } },
    { level: "owner", role: "participant", ownerAbsent: true, expected: { allowed: false, reason: "owner-absent" } },
    { level: "owner", role: "facilitator", ownerAbsent: false, expected: { allowed: false, reason: "insufficient-role" } },
    { level: "owner", role: "facilitator", ownerAbsent: true, expected: { allowed: false, reason: "owner-absent" } },
    { level: "owner", role: "owner", ownerAbsent: false, expected: { allowed: true } },
  ];

  it.each(rows)(
    "$level / $role / ownerAbsent=$ownerAbsent → $expected.allowed",
    ({ level, role, ownerAbsent, expected }) => {
      const action: Action = { kind: "category", category: "revealCards", level };
      expect(evaluate(action, ctx({ actorRole: role, ownerAbsent }))).toEqual(
        expected
      );
    }
  );

  const categories: PermissionCategory[] = [
    "revealCards",
    "gameFlow",
    "issueManagement",
    "roomSettings",
  ];

  it.each(categories)(
    "treats all four categories identically (%s at facilitators denies a participant)",
    (category) => {
      const action: Action = { kind: "category", category, level: "facilitators" };
      expect(evaluate(action, ctx())).toEqual({
        allowed: false,
        reason: "insufficient-role",
      });
    }
  );
});

describe("evaluate — remove", () => {
  const remove = (targetRole: MemberRole): Action => ({
    kind: "relationship",
    verb: "remove",
    targetRole,
  });

  it("lets an owner remove anyone", () => {
    expect(evaluate(remove("participant"), ctx({ actorRole: "owner" }))).toEqual({ allowed: true });
    expect(evaluate(remove("facilitator"), ctx({ actorRole: "owner" }))).toEqual({ allowed: true });
    expect(evaluate(remove("owner"), ctx({ actorRole: "owner" }))).toEqual({ allowed: true });
  });

  it("lets a facilitator remove participants only", () => {
    expect(evaluate(remove("participant"), ctx({ actorRole: "facilitator" }))).toEqual({ allowed: true });
  });

  it("denies a facilitator removing a facilitator or owner with target-rank", () => {
    expect(evaluate(remove("facilitator"), ctx({ actorRole: "facilitator" }))).toEqual({ allowed: false, reason: "target-rank" });
    expect(evaluate(remove("owner"), ctx({ actorRole: "facilitator" }))).toEqual({ allowed: false, reason: "target-rank" });
  });

  it("denies a participant removing anyone with insufficient-role (role precedes target)", () => {
    expect(evaluate(remove("participant"), ctx({ actorRole: "participant" }))).toEqual({ allowed: false, reason: "insufficient-role" });
    expect(evaluate(remove("facilitator"), ctx({ actorRole: "participant" }))).toEqual({ allowed: false, reason: "insufficient-role" });
  });
});

describe("evaluate — promote", () => {
  const promote = (targetRole: MemberRole): Action => ({
    kind: "relationship",
    verb: "promote",
    targetRole,
  });

  it("lets an owner or facilitator promote a participant", () => {
    expect(evaluate(promote("participant"), ctx({ actorRole: "owner" }))).toEqual({ allowed: true });
    expect(evaluate(promote("participant"), ctx({ actorRole: "facilitator" }))).toEqual({ allowed: true });
  });

  it("denies promoting someone who is not a participant with target-rank", () => {
    expect(evaluate(promote("facilitator"), ctx({ actorRole: "owner" }))).toEqual({ allowed: false, reason: "target-rank" });
    expect(evaluate(promote("owner"), ctx({ actorRole: "facilitator" }))).toEqual({ allowed: false, reason: "target-rank" });
  });

  it("denies a participant promoting with insufficient-role (role precedes target)", () => {
    expect(evaluate(promote("participant"), ctx({ actorRole: "participant" }))).toEqual({ allowed: false, reason: "insufficient-role" });
  });

  it("keeps working under lockdown — promote is not owner-level, so no owner-absent refinement", () => {
    expect(evaluate(promote("participant"), ctx({ actorRole: "facilitator", ownerAbsent: true }))).toEqual({ allowed: true });
    expect(evaluate(promote("participant"), ctx({ actorRole: "participant", ownerAbsent: true }))).toEqual({ allowed: false, reason: "insufficient-role" });
  });
});

describe("evaluate — demote", () => {
  const demote = (targetRole: MemberRole): Action => ({
    kind: "relationship",
    verb: "demote",
    targetRole,
  });

  it("lets an owner demote a facilitator", () => {
    expect(evaluate(demote("facilitator"), ctx({ actorRole: "owner" }))).toEqual({ allowed: true });
  });

  it("denies demoting a non-facilitator with target-rank", () => {
    expect(evaluate(demote("participant"), ctx({ actorRole: "owner" }))).toEqual({ allowed: false, reason: "target-rank" });
  });

  it("denies a non-owner demoting with insufficient-role (role precedes target)", () => {
    expect(evaluate(demote("facilitator"), ctx({ actorRole: "facilitator" }))).toEqual({ allowed: false, reason: "insufficient-role" });
    expect(evaluate(demote("facilitator"), ctx({ actorRole: "participant" }))).toEqual({ allowed: false, reason: "insufficient-role" });
  });

  it("refines to owner-absent under lockdown (owner-level requirement)", () => {
    expect(evaluate(demote("facilitator"), ctx({ actorRole: "facilitator", ownerAbsent: true }))).toEqual({ allowed: false, reason: "owner-absent" });
  });
});

describe("evaluate — transfer / changePerms (owner-only, no target)", () => {
  const transfer: Action = { kind: "relationship", verb: "transfer" };
  const changePerms: Action = { kind: "relationship", verb: "changePerms" };

  it("allows the owner", () => {
    expect(evaluate(transfer, ctx({ actorRole: "owner" }))).toEqual({ allowed: true });
    expect(evaluate(changePerms, ctx({ actorRole: "owner" }))).toEqual({ allowed: true });
  });

  it("denies non-owners with insufficient-role", () => {
    expect(evaluate(transfer, ctx({ actorRole: "facilitator" }))).toEqual({ allowed: false, reason: "insufficient-role" });
    expect(evaluate(changePerms, ctx({ actorRole: "participant" }))).toEqual({ allowed: false, reason: "insufficient-role" });
  });

  it("refines to owner-absent under lockdown", () => {
    expect(evaluate(transfer, ctx({ actorRole: "facilitator", ownerAbsent: true }))).toEqual({ allowed: false, reason: "owner-absent" });
    expect(evaluate(changePerms, ctx({ actorRole: "facilitator", ownerAbsent: true }))).toEqual({ allowed: false, reason: "owner-absent" });
  });
});

describe("denialMessage", () => {
  const OWNER_ABSENT =
    "Room owner has left. Owner-level actions are disabled until the owner returns.";
  const ONLY_OWNER = "Only the owner can do this.";
  const ONLY_FACILITATORS = "Only facilitators and the owner can do this.";

  const category = (level: PermissionLevel): Action => ({
    kind: "category",
    category: "revealCards",
    level,
  });

  it("owner-absent yields the lockdown copy regardless of action", () => {
    expect(denialMessage(category("owner"), "owner-absent")).toBe(OWNER_ABSENT);
    expect(denialMessage({ kind: "relationship", verb: "transfer" }, "owner-absent")).toBe(OWNER_ABSENT);
    expect(denialMessage({ kind: "relationship", verb: "demote", targetRole: "facilitator" }, "owner-absent")).toBe(OWNER_ABSENT);
  });

  it("insufficient-role copy reflects the required threshold", () => {
    // owner-level requirements
    expect(denialMessage(category("owner"), "insufficient-role")).toBe(ONLY_OWNER);
    expect(denialMessage({ kind: "relationship", verb: "transfer" }, "insufficient-role")).toBe(ONLY_OWNER);
    expect(denialMessage({ kind: "relationship", verb: "changePerms" }, "insufficient-role")).toBe(ONLY_OWNER);
    expect(denialMessage({ kind: "relationship", verb: "demote", targetRole: "facilitator" }, "insufficient-role")).toBe(ONLY_OWNER);
    // facilitator-level requirements
    expect(denialMessage(category("facilitators"), "insufficient-role")).toBe(ONLY_FACILITATORS);
    expect(denialMessage({ kind: "relationship", verb: "promote", targetRole: "participant" }, "insufficient-role")).toBe(ONLY_FACILITATORS);
    expect(denialMessage({ kind: "relationship", verb: "remove", targetRole: "participant" }, "insufficient-role")).toBe(ONLY_FACILITATORS);
  });

  it("target-rank copy is verb-specific", () => {
    expect(denialMessage({ kind: "relationship", verb: "remove", targetRole: "facilitator" }, "target-rank")).toBe("Facilitators can only remove participants.");
    expect(denialMessage({ kind: "relationship", verb: "promote", targetRole: "facilitator" }, "target-rank")).toBe("Only participants can be promoted to facilitator.");
    expect(denialMessage({ kind: "relationship", verb: "demote", targetRole: "participant" }, "target-rank")).toBe("Only facilitators can be demoted.");
  });
});
