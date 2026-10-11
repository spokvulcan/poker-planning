/**
 * getServerSession: the session's token for the page's first render. A
 * visitor costs no network; a token Convex doesn't give, in time or at all,
 * leaves the session unknown for the browser to fetch rather than failing or
 * holding up the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({
  cookie: "better-auth.session_token=abc",
  // What fetching the token does: resolve, reject, or never answer
  token: (async () => "jwt") as () => Promise<string | undefined>,
  fetches: 0,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(server.cookie ? { cookie: server.cookie } : {}),
}));

vi.mock("@/lib/auth-server", () => ({
  getToken: () => {
    server.fetches += 1;
    return server.token();
  },
}));

import { SERVER_AUTH_WAIT_MS, getServerSession } from "./server-session";

beforeEach(() => {
  server.cookie = "better-auth.session_token=abc";
  server.token = async () => "jwt";
  server.fetches = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getServerSession", () => {
  it("is no session, without asking Convex, for a visitor with no session cookie", async () => {
    server.cookie = "";

    expect(await getServerSession()).toEqual({ status: "none" });
    expect(server.fetches).toBe(0);
  });

  it("has the token Convex gives for a session", async () => {
    expect(await getServerSession()).toEqual({ status: "token", token: "jwt" });
  });

  it("is no session when Convex no longer knows the cookie's", async () => {
    server.token = async () => undefined;

    expect(await getServerSession()).toEqual({ status: "none" });
  });

  it("is unknown, for the browser to fetch, when Convex can't be reached", async () => {
    server.token = async () => {
      throw new TypeError("fetch failed");
    };

    expect(await getServerSession()).toEqual({ status: "unknown" });
  });

  it("is unknown once Convex has kept the page waiting too long", async () => {
    vi.useFakeTimers();
    server.token = () => new Promise(() => {});

    const session = getServerSession();
    await vi.advanceTimersByTimeAsync(SERVER_AUTH_WAIT_MS);

    expect(await session).toEqual({ status: "unknown" });
  });
});
