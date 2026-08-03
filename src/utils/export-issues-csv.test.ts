import { describe, expect, it } from "vitest";
import type { EnhancedExportableIssue } from "@/convex/model/issues";
import { issuesToCSV } from "./export-issues-csv";

function makeIssue(
  overrides: Partial<EnhancedExportableIssue> = {}
): EnhancedExportableIssue {
  return {
    title: "Plain issue",
    finalEstimate: "5",
    status: "completed",
    votedAt: "2026-01-01T00:00:00.000Z",
    average: 5,
    median: 5,
    agreement: 100,
    voteCount: 3,
    notes: null,
    timeToConsensusMs: null,
    timeToConsensusFormatted: null,
    votingRounds: 1,
    individualVotes: null,
    externalUrl: null,
    externalId: null,
    ...overrides,
  };
}

describe("issuesToCSV", () => {
  it("renders a header and a data row for a normal issue", () => {
    const csv = issuesToCSV([makeIssue()]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Title");
    expect(lines[1]).toContain("Plain issue");
  });

  it("neutralizes formula-leading characters in user-controlled fields", () => {
    const csv = issuesToCSV([
      makeIssue({
        title: '=HYPERLINK("https://evil.example","Click")',
        notes: "@SUM(1+1)",
        individualVotes: [{ userName: "=2+5", vote: "3", deltaFromConsensus: null }],
      }),
    ]);
    const row = csv.split("\n")[1];
    expect(row).toContain("'=HYPERLINK");
    expect(row).toContain("'@SUM");
    expect(row).toContain("'=2+5: 3");
    expect(row).not.toMatch(/(^|,)"?=/);
  });

  it("neutralizes leading plus, minus, tab, and carriage return", () => {
    const csv = issuesToCSV([
      makeIssue({ title: "+1+1", notes: "-10+20", externalId: "\t=cmd" }),
    ]);
    const row = csv.split("\n")[1];
    expect(row).toContain("'+1+1");
    expect(row).toContain("'-10+20");
    expect(row).toContain("'\t=cmd");
  });

  it("leaves ordinary values untouched", () => {
    const csv = issuesToCSV([
      makeIssue({ title: "Estimate login page", finalEstimate: "3" }),
    ]);
    const row = csv.split("\n")[1];
    expect(row.startsWith("Estimate login page")).toBe(true);
    expect(row).not.toContain("'");
  });
});
