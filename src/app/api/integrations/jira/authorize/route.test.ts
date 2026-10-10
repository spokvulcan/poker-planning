/**
 * The Jira authorize route keeps a fresh CSRF state in a cookie and sends the
 * person to the consent URL Convex builds for it, since the Jira OAuth app's
 * settings live only in Convex; when Convex can't build one, the person lands
 * back on the settings page with the copy for why.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";

const { fetchAuthQuery, cookieJar, Redirect } = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect to ${url}`);
    }
  }
  return { fetchAuthQuery: vi.fn(), cookieJar: new Map<string, string>(), Redirect };
});
vi.mock("@/lib/auth-server", () => ({
  isAuthenticated: async () => true,
  fetchAuthQuery,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

import { GET } from "./route";

/** Where the authorize route sends the person. */
async function destination(): Promise<string | null> {
  try {
    return (await GET()).headers.get("location");
  } catch (error) {
    if (error instanceof Redirect) return error.url;
    throw error;
  }
}

beforeEach(() => {
  fetchAuthQuery.mockReset();
  cookieJar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/integrations/jira/authorize", () => {
  it("sends the person to the consent URL Convex builds for the state it keeps in the cookie", async () => {
    // Next.js holds no Jira OAuth settings of its own.
    vi.stubEnv("JIRA_CLIENT_ID", undefined);
    vi.stubEnv("JIRA_CLIENT_SECRET", undefined);
    fetchAuthQuery.mockImplementation(
      async (_query: unknown, { state }: { state: string }) =>
        `https://auth.atlassian.com/authorize?client_id=from-convex&state=${state}`
    );

    const sentTo = await destination();

    const state = cookieJar.get("jira_oauth_state");
    expect(state).toEqual(expect.any(String));
    expect(sentTo).toBe(
      `https://auth.atlassian.com/authorize?client_id=from-convex&state=${state}`
    );
    expect(getFunctionName(fetchAuthQuery.mock.calls[0][0])).toBe(
      "integrations/jira:getJiraAuthorizeUrl"
    );
  });

  it("shows the not-configured copy when Convex lacks its Jira settings", async () => {
    fetchAuthQuery.mockRejectedValueOnce(
      new ConvexError({
        code: "jira_not_configured",
        message: "Jira is not configured: set JIRA_CLIENT_ID on the Convex deployment.",
      })
    );

    expect(await destination()).toBe(
      "/dashboard/settings?tab=integrations&error=jira_not_configured"
    );
  });

  it("reports any other failure to build the consent URL as a failed start", async () => {
    fetchAuthQuery.mockRejectedValueOnce(new Error("Server Error"));

    expect(await destination()).toBe(
      "/dashboard/settings?tab=integrations&error=jira_authorize_failed"
    );
  });
});
