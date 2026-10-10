/**
 * What the Jira import modal tells the person once an import returns: a
 * clean import is complete, and any refused key is named with why, so a full
 * room never reads as "Import complete".
 */
import { describe, it, expect } from "vitest";
import { importReport } from "./jira-import-report";

const FULL = "Rooms are limited to 500 issues";
const UNREADABLE = "Couldn't be read from Jira (deleted, or not visible to you)";

describe("importReport", () => {
  it("calls a clean import complete, counting what already existed", () => {
    expect(importReport({ imported: 2, skipped: 1, refused: [] })).toEqual({
      tone: "success",
      title: "Import complete",
      lines: ["Imported 2 issues, 1 already existed."],
    });
    expect(importReport({ imported: 1, skipped: 0, refused: [] }).lines).toEqual([
      "Imported 1 issue.",
    ]);
  });

  it("names every refused key with why, one line per reason", () => {
    const report = importReport({
      imported: 1,
      skipped: 0,
      refused: [
        { key: "PROJ-2", reason: FULL },
        { key: "PROJ-9", reason: UNREADABLE },
        { key: "PROJ-3", reason: FULL },
      ],
    });

    expect(report).toEqual({
      tone: "warning",
      title: "Some issues weren't imported",
      lines: [
        "Imported 1 issue.",
        "PROJ-2, PROJ-3: Rooms are limited to 500 issues.",
        "PROJ-9: Couldn't be read from Jira (deleted, or not visible to you).",
      ],
    });
  });

  it("reports an import into a full room as nothing imported", () => {
    expect(
      importReport({
        imported: 0,
        skipped: 0,
        refused: [
          { key: "PROJ-1", reason: FULL },
          { key: "PROJ-2", reason: FULL },
        ],
      })
    ).toEqual({
      tone: "error",
      title: "No issues imported",
      lines: ["PROJ-1, PROJ-2: Rooms are limited to 500 issues."],
    });
  });
});
