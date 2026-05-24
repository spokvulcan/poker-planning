import { describe, it, expect } from "vitest";
import {
  resolve,
  denialMessage,
  RESOLVED_ALLOWED,
  type Action,
  type DecisionContext,
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

describe("RESOLVED_ALLOWED — shared immutable singleton", () => {
  it("is frozen so a consumer cannot corrupt the process-wide allow value", () => {
    expect(Object.isFrozen(RESOLVED_ALLOWED)).toBe(true);
  });
});

describe("resolve — allow", () => {
  it("returns the shared RESOLVED_ALLOWED value when the action is allowed", () => {
    const action: Action = {
      kind: "category",
      category: "revealCards",
      level: "everyone",
    };
    expect(resolve(action, ctx())).toBe(RESOLVED_ALLOWED);
  });
});

describe("resolve — deny", () => {
  it("carries the insufficient-role message for a category denied by role", () => {
    const action: Action = {
      kind: "category",
      category: "revealCards",
      level: "facilitators",
    };
    expect(resolve(action, ctx({ actorRole: "participant" }))).toEqual({
      allowed: false,
      message: denialMessage(action, "insufficient-role"),
    });
  });

  it("carries the owner-absent message for an owner-level category under lockdown", () => {
    const action: Action = {
      kind: "category",
      category: "roomSettings",
      level: "owner",
    };
    expect(
      resolve(action, ctx({ actorRole: "facilitator", ownerAbsent: true }))
    ).toEqual({
      allowed: false,
      message: denialMessage(action, "owner-absent"),
    });
  });

  it("carries the target-rank message for a relationship action denied by target", () => {
    const action: Action = {
      kind: "relationship",
      verb: "remove",
      targetRole: "facilitator",
    };
    expect(resolve(action, ctx({ actorRole: "facilitator" }))).toEqual({
      allowed: false,
      message: denialMessage(action, "target-rank"),
    });
  });

  it("always produces a non-empty message on deny", () => {
    const action: Action = { kind: "relationship", verb: "transfer" };
    const rd = resolve(action, ctx({ actorRole: "participant" }));
    expect(rd.allowed).toBe(false);
    if (!rd.allowed) expect(rd.message.length).toBeGreaterThan(0);
  });
});
