/**
 * A dashboard chart labels each point with its day. The server buckets by UTC
 * day and sends `YYYY-MM-DD`, and the label shows that day in every time zone,
 * west of UTC too, where the day's UTC midnight is still the evening before.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The label a browser in `timeZone` shows: the zone is fixed before the module loads, as in a page. */
async function labelIn(timeZone: string, day: string): Promise<string> {
  vi.stubEnv("TZ", timeZone);
  vi.resetModules();
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(timeZone);
  const { formatChartDay } = await import("./chart-day");
  return formatChartDay(day);
}

describe("formatChartDay", () => {
  it.each(["America/Los_Angeles", "Pacific/Pago_Pago", "Pacific/Kiritimati"])(
    "labels the chart point for 2026-10-04 as Oct 4 in %s",
    async (timeZone) => {
      expect(await labelIn(timeZone, "2026-10-04")).toBe("Oct 4");
    }
  );
});
