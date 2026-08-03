import type { EnhancedExportableIssue } from "@/convex/model/issues";
import { downloadFile } from "./download-file";

/**
 * Escapes a CSV field value (handles commas, quotes, newlines).
 * Also neutralizes spreadsheet formula injection: values that begin with
 * =, +, -, @, tab, or CR are prefixed with a single quote so Excel and
 * LibreOffice render them as text instead of evaluating them (OWASP CSV
 * injection guidance). Issue titles, voter names, and notes are
 * participant-controlled.
 */
function escapeCSVField(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  let stringValue = String(value);
  if (/^[=+\-@\t\r]/.test(stringValue)) {
    stringValue = `'${stringValue}`;
  }
  // If contains comma, quote, or newline, wrap in quotes and escape existing quotes
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Formats a number for CSV (rounds to 1 decimal place)
 */
function formatNumber(value: number | null): string {
  if (value === null) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Formats individual votes as a semicolon-separated string
 */
function formatIndividualVotes(
  votes: EnhancedExportableIssue["individualVotes"]
): string {
  if (!votes || votes.length === 0) return "";
  return votes.map((v) => `${v.userName}: ${v.vote}`).join("; ");
}

/**
 * Converts issues data to CSV format
 */
export function issuesToCSV(issues: EnhancedExportableIssue[]): string {
  const headers = [
    "Title",
    "Final Estimate",
    "Status",
    "Voted At",
    "Vote Count",
    "Average",
    "Median",
    "Agreement %",
    "Time to Consensus",
    "Voting Rounds",
    "Individual Votes",
    "External URL",
    "External ID",
    "Notes",
  ];
  const headerRow = headers.join(",");

  const dataRows = issues.map((issue) =>
    [
      escapeCSVField(issue.title),
      escapeCSVField(issue.finalEstimate),
      escapeCSVField(issue.status),
      escapeCSVField(issue.votedAt),
      escapeCSVField(issue.voteCount),
      escapeCSVField(formatNumber(issue.average)),
      escapeCSVField(formatNumber(issue.median)),
      escapeCSVField(issue.agreement !== null ? `${issue.agreement}%` : null),
      escapeCSVField(issue.timeToConsensusFormatted),
      escapeCSVField(issue.votingRounds),
      escapeCSVField(formatIndividualVotes(issue.individualVotes)),
      escapeCSVField(issue.externalUrl),
      escapeCSVField(issue.externalId),
      escapeCSVField(issue.notes),
    ].join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Exports issues to a CSV file and triggers download
 */
export function exportIssuesToCSV(
  issues: EnhancedExportableIssue[],
  roomName: string
): void {
  const csvContent = issuesToCSV(issues);
  const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const sanitizedRoomName = roomName.replace(/[^a-zA-Z0-9-_]/g, "_");
  const filename = `${sanitizedRoomName}_issues_${timestamp}.csv`;
  downloadFile(csvContent, filename, "text/csv;charset=utf-8;");
}
