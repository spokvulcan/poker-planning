/**
 * Where the Jira OAuth callback sends the person when Convex refuses to store
 * the connection: a deployment missing its Jira settings reads as "not
 * configured" on the settings page, any other failure as a failed save.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConvexError } from "convex/values";

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
  // Atlassian accepts the code.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input === "https://auth.atlassian.com/oauth/token") {
        return Response.json({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
          scope: "read:jira-work",
        });
      }
      if (input === "https://api.atlassian.com/oauth/token/accessible-resources") {
        return Response.json([{ id: "cloud-1", url: "https://team.atlassian.net" }]);
      }
      return Response.json({ account_id: "jira-user-1" });
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/integrations/jira/callback", () => {
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

  it("reports any other refused store as a failed save", async () => {
    fetchAuthAction.mockRejectedValueOnce(new Error("Server Error"));

    expect(await landing()).toBe(
      "/dashboard/settings?tab=integrations&error=jira_store_failed"
    );
  });
});
