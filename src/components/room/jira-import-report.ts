import type { JiraImportResult } from "@/convex/integrations/jira";

/** What the import modal tells the person once an import returns. */
export interface ImportReport {
  tone: "success" | "warning" | "error";
  title: string;
  lines: string[];
}

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

const issues = (n: number) => `${n} issue${n === 1 ? "" : "s"}`;

/**
 * The import's outcome in words: what came in and what already existed, and
 * every refused key with why, one line per reason. An import with any
 * refusal is never "complete".
 */
export function importReport(result: JiraImportResult): ImportReport {
  const counts = `Imported ${issues(result.imported)}${
    result.skipped > 0 ? `, ${result.skipped} already existed` : ""
  }.`;
  if (result.refused.length === 0) {
    return { tone: "success", title: "Import complete", lines: [counts] };
  }

  const keysByReason = new Map<string, string[]>();
  for (const { key, reason } of result.refused) {
    keysByReason.set(reason, [...(keysByReason.get(reason) ?? []), key]);
  }
  const refusals = [...keysByReason].map(([reason, keys]) => sentence(`${keys.join(", ")}: ${reason}`));

  if (result.imported + result.skipped === 0) {
    return { tone: "error", title: "No issues imported", lines: refusals };
  }
  return { tone: "warning", title: "Some issues weren't imported", lines: [counts, ...refusals] };
}
