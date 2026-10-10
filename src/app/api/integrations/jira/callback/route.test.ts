/**
 * The Jira OAuth callback hands Convex the authorization code and nothing
 * else (Convex owns the exchange, so no token and no client secret passes
 * through Next.js), then sends the person to the settings page: a step Convex
 * refused by rule shows that step's copy, any other failure a failed save.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";

const { fetchAuthAction, Redirect } = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect to ${url}`);
    }
  }
  return { fetchAuthAction: vi.fn(), Redirect };
});
vi.mock("@/lib/auth-server", () => ({ fetchAuthAction }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: "state-1" }),
    delete: () => {},
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

import { GET } from "./route";

/** Where the callback sends the person once Atlassian hands back a code. */
async function landing(): Promise<string> {
  try {
    await GET(
      new Request(
        "http://localhost/api/integrations/jira/callback?code=the-code&state=state-1"
      )
    );
  } catch (error) {
    if (error instanceof Redirect) return error.url;
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  fetchAuthAction.mockReset();
  // Next.js no longer talks to Atlassian, so any fetch of its own is a leak.
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/integrations/jira/callback", () => {
  it("hands Convex the authorization code and nothing else, then shows the connected toast", async () => {
    fetchAuthAction.mockResolvedValueOnce(null);

    expect(await landing()).toBe("/dashboard/settings?tab=integrations&connected=jira");

    expect(fetchAuthAction).toHaveBeenCalledTimes(1);
    const [action, args] = fetchAuthAction.mock.calls[0];
    expect(getFunctionName(action)).toBe("integrations/jira:connectJira");
    expect(args).toEqual({ code: "the-code" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the not-configured copy when Convex lacks its Jira settings", async () => {
    fetchAuthAction.mockRejectedValueOnce(
      new ConvexError({
        code: "jira_not_configured",
        message: "Jira is not configured: set JIRA_CLIENT_SECRET on the Convex deployment.",
      })
    );

    expect(await landing()).toBe(
      "/dashboard/settings?tab=integrations&error=jira_not_configured"
    );
  });

  it.each(["jira_token_failed", "jira_resources_failed", "jira_no_site"])(
    "shows the %s copy when Convex refuses that step of the exchange",
    async (code) => {
      fetchAuthAction.mockRejectedValueOnce(
        new ConvexError({ code, message: "Refused by the exchange." })
      );

      expect(await landing()).toBe(
        `/dashboard/settings?tab=integrations&error=${code}`
      );
    }
  );

  it("reports any other refused store as a failed save", async () => {
    fetchAuthAction.mockRejectedValueOnce(new Error("Server Error"));

    expect(await landing()).toBe(
      "/dashboard/settings?tab=integrations&error=jira_store_failed"
    );
  });
});
