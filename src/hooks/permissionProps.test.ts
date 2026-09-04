import { describe, it, expect } from "vitest";
import {
  permissionProps,
  permissionInputProps,
  denialTooltip,
  rosterControls,
  computePokerPermissions as computePermissions,
} from "./usePermissions";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import {
  denialMessage,
  RESOLVED_ALLOWED,
  type MemberRole,
  type RoomPermissions,
} from "@/convex/permissions";

describe("permissionProps — allowed", () => {
  it("returns an empty overlay so the control keeps its own state and label", () => {
    expect(permissionProps(RESOLVED_ALLOWED)).toEqual({});
  });

  it("does not emit disabled:false (would re-enable a cooldown/no-votes control)", () => {
    expect(permissionProps(RESOLVED_ALLOWED)).not.toHaveProperty("disabled");
  });
});

describe("permissionProps — denied", () => {
  const message = "Only facilitators and the owner can do this.";

  it("disables and labels the control with the denial message", () => {
    expect(permissionProps({ allowed: false, message })).toEqual({
      disabled: true,
      title: message,
      "aria-label": message,
    });
  });

  it("uses the same message for title and aria-label", () => {
    const overlay = permissionProps({ allowed: false, message });
    expect(overlay).toHaveProperty("title", message);
    expect(overlay).toHaveProperty("aria-label", message);
  });
});

describe("permissionInputProps — the input-kind overlay", () => {
  const message = "Only the owner can do this.";

  it("returns an empty overlay when allowed", () => {
    expect(permissionInputProps(RESOLVED_ALLOWED)).toEqual({});
  });

  it("denies via readOnly (not disabled) so the value stays focusable", () => {
    const overlay = permissionInputProps({ allowed: false, message });
    expect(overlay).toEqual({
      readOnly: true,
      title: message,
      "aria-label": message,
    });
    expect(overlay).not.toHaveProperty("disabled");
  });
});

describe("denialTooltip", () => {
  it("is undefined when allowed", () => {
    expect(denialTooltip(RESOLVED_ALLOWED)).toBeUndefined();
  });

  it("is the decision's message when denied", () => {
    expect(denialTooltip({ allowed: false, message: "Only the owner can do this." }))
      .toBe("Only the owner can do this.");
  });
});

describe("rosterControls — shape", () => {
  it("enabled controls carry no denial copy", () => {
    const controls = rosterControls({
      remove: RESOLVED_ALLOWED,
      promote: RESOLVED_ALLOWED,
      demote: RESOLVED_ALLOWED,
      transfer: RESOLVED_ALLOWED,
    });
    expect(controls.remove).toEqual({ enabled: true });
    expect(controls.remove).not.toHaveProperty("denial");
  });

  it("disabled controls carry the decision's message as the denial tooltip", () => {
    const denied = { allowed: false, message: "Only the owner can do this." } as const;
    const controls = rosterControls({
      remove: denied,
      promote: denied,
      demote: denied,
      transfer: denied,
    });
    expect(controls.demote).toEqual({ enabled: false, denial: denied.message });
    expect(controls.transfer).toEqual({ enabled: false, denial: denied.message });
  });
});

// --- Matrix over real decisions (computePermissions), per actor × target role ---

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

/** The per-action control bundle a roster row gets for one target role. */
function row(
  actorRole: MemberRole,
  targetRole: MemberRole,
  isOwnerAbsent = false
) {
  const perms = computePermissions(
    roomData({ role: actorRole, isOwnerAbsent }),
    "u1"
  );
  return rosterControls({
    remove: perms.removeTarget(targetRole),
    promote: perms.promoteTarget(targetRole),
    demote: perms.demoteTarget(targetRole),
    transfer: perms.transfer,
  });
}

const ENABLED = { enabled: true };
const facilitatorLevel = (verb: "remove" | "promote", targetRole: MemberRole) =>
  denialMessage({ kind: "relationship", verb, targetRole }, "insufficient-role");
const ownerOnlyDemote = (targetRole: MemberRole) =>
  denialMessage(
    { kind: "relationship", verb: "demote", targetRole },
    "insufficient-role"
  );
const OWNER_ONLY_TRANSFER = denialMessage(
  { kind: "relationship", verb: "transfer" },
  "insufficient-role"
);
const targetRank = (verb: "remove" | "promote" | "demote", targetRole: MemberRole) =>
  denialMessage({ kind: "relationship", verb, targetRole }, "target-rank");

describe("rosterControls — owner actor", () => {
  it("participant target: remove/promote/transfer enabled, demote denied (target-rank)", () => {
    expect(row("owner", "participant")).toEqual({
      remove: ENABLED,
      promote: ENABLED,
      demote: { enabled: false, denial: targetRank("demote", "participant") },
      transfer: ENABLED,
    });
  });

  it("facilitator target: remove/demote/transfer enabled, promote denied (target-rank)", () => {
    expect(row("owner", "facilitator")).toEqual({
      remove: ENABLED,
      promote: { enabled: false, denial: targetRank("promote", "facilitator") },
      demote: ENABLED,
      transfer: ENABLED,
    });
  });

  it("owner target: remove/transfer enabled, promote/demote denied (target-rank)", () => {
    expect(row("owner", "owner")).toEqual({
      remove: ENABLED,
      promote: { enabled: false, denial: targetRank("promote", "owner") },
      demote: { enabled: false, denial: targetRank("demote", "owner") },
      transfer: ENABLED,
    });
  });
});

describe("rosterControls — facilitator actor", () => {
  it("participant target: remove/promote enabled, demote/transfer denied (owner-only)", () => {
    expect(row("facilitator", "participant")).toEqual({
      remove: ENABLED,
      promote: ENABLED,
      demote: { enabled: false, denial: ownerOnlyDemote("participant") },
      transfer: { enabled: false, denial: OWNER_ONLY_TRANSFER },
    });
  });

  it("facilitator target: remove/promote denied (target-rank), demote/transfer denied", () => {
    expect(row("facilitator", "facilitator")).toEqual({
      remove: { enabled: false, denial: targetRank("remove", "facilitator") },
      promote: { enabled: false, denial: targetRank("promote", "facilitator") },
      demote: { enabled: false, denial: ownerOnlyDemote("facilitator") },
      transfer: { enabled: false, denial: OWNER_ONLY_TRANSFER },
    });
  });

  it("owner target: everything denied", () => {
    expect(row("facilitator", "owner")).toEqual({
      remove: { enabled: false, denial: targetRank("remove", "owner") },
      promote: { enabled: false, denial: targetRank("promote", "owner") },
      demote: { enabled: false, denial: ownerOnlyDemote("owner") },
      transfer: { enabled: false, denial: OWNER_ONLY_TRANSFER },
    });
  });

  it("lockdown refines owner-level denials to the owner-absent copy", () => {
    const controls = row("facilitator", "participant", true);
    expect(controls.demote).toEqual({
      enabled: false,
      denial: denialMessage(
        { kind: "relationship", verb: "demote", targetRole: "participant" },
        "owner-absent"
      ),
    });
    expect(controls.transfer).toEqual({
      enabled: false,
      denial: denialMessage({ kind: "relationship", verb: "transfer" }, "owner-absent"),
    });
    // Facilitator-level verbs are unaffected by lockdown.
    expect(controls.remove).toEqual(ENABLED);
    expect(controls.promote).toEqual(ENABLED);
  });
});

describe("rosterControls — participant actor", () => {
  it("every action denied, each with its own verb's copy", () => {
    expect(row("participant", "participant")).toEqual({
      remove: { enabled: false, denial: facilitatorLevel("remove", "participant") },
      promote: { enabled: false, denial: facilitatorLevel("promote", "participant") },
      demote: { enabled: false, denial: ownerOnlyDemote("participant") },
      transfer: { enabled: false, denial: OWNER_ONLY_TRANSFER },
    });
  });
});

describe("adapter applied to a real game-flow decision (Quick Vote regression)", () => {
  it("participant's overlay disables the switch and carries the game-flow denial copy", () => {
    const perms = computePermissions(
      roomData({
        role: "participant",
        permissions: { ...allEveryone, gameFlow: "facilitators" },
      }),
      "u1"
    );
    const message = denialMessage(
      { kind: "category", category: "gameFlow", level: "facilitators" },
      "insufficient-role"
    );
    expect(permissionProps(perms.gameFlow)).toEqual({
      disabled: true,
      title: message,
      "aria-label": message,
    });
  });
});
