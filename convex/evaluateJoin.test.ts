import { describe, it, expect } from "vitest";
import type { Doc } from "./_generated/dataModel";
import {
  evaluateJoin,
  accountTypeOf,
  type AccountType,
  type JoinDecision,
  type JoinPolicy,
} from "./permissions";

// The join decision (ADR-0013, spec §4.4): a pure function beside `evaluate`,
// not a branch of it. A joiner has no membership and no role.

describe("evaluateJoin — full table", () => {
  const cases: Array<{
    policy: JoinPolicy;
    accountType: AccountType;
    isTeamMember: boolean;
    expected: JoinDecision;
  }> = [
    // anyone: everyone passes
    { policy: "anyone", accountType: "anonymous", isTeamMember: false, expected: { allowed: true } },
    { policy: "anyone", accountType: "permanent", isTeamMember: false, expected: { allowed: true } },
    { policy: "anyone", accountType: "anonymous", isTeamMember: true, expected: { allowed: true } },
    { policy: "anyone", accountType: "permanent", isTeamMember: true, expected: { allowed: true } },
    // permanentAccounts: anonymous non-members are refused
    { policy: "permanentAccounts", accountType: "anonymous", isTeamMember: false, expected: { allowed: false, reason: "permanent-account-required" } },
    { policy: "permanentAccounts", accountType: "permanent", isTeamMember: false, expected: { allowed: true } },
    { policy: "permanentAccounts", accountType: "anonymous", isTeamMember: true, expected: { allowed: true } },
    { policy: "permanentAccounts", accountType: "permanent", isTeamMember: true, expected: { allowed: true } },
    // teamMembers: every non-member is refused, whatever their account
    { policy: "teamMembers", accountType: "anonymous", isTeamMember: false, expected: { allowed: false, reason: "team-members-only" } },
    { policy: "teamMembers", accountType: "permanent", isTeamMember: false, expected: { allowed: false, reason: "team-members-only" } },
    { policy: "teamMembers", accountType: "anonymous", isTeamMember: true, expected: { allowed: true } },
    { policy: "teamMembers", accountType: "permanent", isTeamMember: true, expected: { allowed: true } },
  ];

  it.each(cases)(
    "$policy / $accountType / teamMember=$isTeamMember → $expected.allowed",
    ({ policy, accountType, isTeamMember, expected }) => {
      expect(evaluateJoin(policy, accountType, isTeamMember)).toEqual(expected);
    }
  );

  it("a team member satisfies every policy", () => {
    for (const policy of ["anyone", "permanentAccounts", "teamMembers"] as const) {
      for (const accountType of ["anonymous", "permanent"] as const) {
        expect(evaluateJoin(policy, accountType, true)).toEqual({ allowed: true });
      }
    }
  });

  it("an anonymous account is refused on permanentAccounts and teamMembers only", () => {
    expect(evaluateJoin("anyone", "anonymous", false).allowed).toBe(true);
    expect(evaluateJoin("permanentAccounts", "anonymous", false).allowed).toBe(false);
    expect(evaluateJoin("teamMembers", "anonymous", false).allowed).toBe(false);
  });

  it("a permanent non-team-member is refused on teamMembers only", () => {
    expect(evaluateJoin("anyone", "permanent", false).allowed).toBe(true);
    expect(evaluateJoin("permanentAccounts", "permanent", false).allowed).toBe(true);
    expect(evaluateJoin("teamMembers", "permanent", false).allowed).toBe(false);
  });
});

describe("accountTypeOf — the server's one derivation of the join input", () => {
  function user(accountType?: Doc<"users">["accountType"]): Doc<"users"> {
    return {
      _id: "u1",
      _creationTime: 0,
      authUserId: "a1",
      name: "U",
      createdAt: 0,
      ...(accountType ? { accountType } : {}),
    } as Doc<"users">;
  }

  it("is permanent only when the user row says so", () => {
    expect(accountTypeOf(user("permanent"))).toBe("permanent");
  });

  it("treats an explicit anonymous row as anonymous", () => {
    expect(accountTypeOf(user("anonymous"))).toBe("anonymous");
  });

  it("treats an undefined accountType as anonymous", () => {
    expect(accountTypeOf(user())).toBe("anonymous");
  });
});
