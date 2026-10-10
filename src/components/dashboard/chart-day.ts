/**
 * A chart point's day label, e.g. "Oct 4". The server buckets analytics by
 * UTC day and sends `YYYY-MM-DD`, which `Date` reads as UTC midnight, so the
 * label is formatted in UTC: in local time it would show the day before
 * anywhere west of UTC.
 */
export function formatChartDay(day: string): string {
  const date = new Date(day);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
