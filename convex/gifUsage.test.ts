/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

// GIF search traffic, by the hour: every search the GIF route served, and
// how many of them GIPHY refused for its hourly rate limit.

const HOUR = 60 * 60 * 1000;
const BASE = Date.UTC(2026, 8, 24, 10);

afterEach(() => {
  vi.useRealTimers();
});

describe("gifUsage", () => {
  it("counts searches and refusals per hour, newest hour first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);
    const searcher = t.withIdentity({ subject: "auth-a" });

    vi.setSystemTime(BASE + 5 * 60 * 1000);
    await searcher.mutation(api.gifUsage.record, { rateLimited: false });
    vi.setSystemTime(BASE + 50 * 60 * 1000);
    await searcher.mutation(api.gifUsage.record, { rateLimited: true });
    vi.setSystemTime(BASE + HOUR + 1_000);
    await searcher.mutation(api.gifUsage.record, { rateLimited: false });

    expect(await t.query(internal.gifUsage.recent, {})).toEqual([
      { hour: "2026-09-24T11:00:00.000Z", requests: 1, rateLimited: 0 },
      { hour: "2026-09-24T10:00:00.000Z", requests: 2, rateLimited: 1 },
    ]);
    expect(await t.query(internal.gifUsage.recent, { hours: 1 })).toHaveLength(1);
  });

  it("counts only for a signed-in session", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.gifUsage.record, { rateLimited: false })).rejects.toThrow("Not authenticated");
    expect(await t.query(internal.gifUsage.recent, {})).toEqual([]);
  });
});
