/**
 * getServerViewer: who is looking, as the server sees them for the page's
 * first paint. No session costs no read; a session costs one read of the
 * caller's users row with the token the layout already has; and a session or
 * a read Convex didn't answer leaves the viewer loading, for the browser to
 * answer, rather than failing the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const server = vi.hoisted(() => ({
  // The caller's users row, the error reading it throws, or "hang" for a read that never answers
  row: null as Record<string, unknown> | null | Error | "hang",
  reads: [] as { query: string; token?: string }[],
}));

vi.mock("convex/nextjs", () => ({
  fetchQuery: (query: Parameters<typeof getFunctionName>[0], _args: unknown, options: { token?: string }) => {
    server.reads.push({ query: getFunctionName(query), token: options.token });
    if (server.row === "hang") return new Promise(() => {});
    if (server.row instanceof Error) return Promise.reject(server.row);
    return Promise.resolve(server.row);
  },
}));

// The session read this module shares a wait with; the token comes in as an argument here.
vi.mock("@/lib/auth-server", () => ({ getToken: async () => undefined }));

import { SERVER_AUTH_WAIT_MS } from "@/lib/server-session";
import { getServerViewer } from "./server-viewer";

const signedIn = { status: "token", token: "jwt" } as const;

beforeEach(() => {
  server.row = null;
  server.reads = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getServerViewer", () => {
  it("is a visitor, with no read, when there is no session", async () => {
    expect(await getServerViewer({ status: "none" })).toEqual({ status: "visitor" });
    expect(server.reads).toEqual([]);
  });

  it("is loading, with no read, when Convex didn't confirm the session", async () => {
    expect(await getServerViewer({ status: "unknown" })).toEqual({ status: "loading" });
    expect(server.reads).toEqual([]);
  });

  it("has the name, avatar and email of the caller's users row, from one read with the session's token", async () => {
    server.row = {
      _id: "user-ada",
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      accountType: "permanent",
    };

    expect(await getServerViewer(signedIn)).toEqual({
      status: "signedIn",
      name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      email: "ada@example.com",
      isPermanent: true,
    });
    expect(server.reads).toEqual([{ query: "users:getGlobalUser", token: "jwt" }]);
  });

  it("is signed in as a guest with no name while the caller has no users row yet", async () => {
    expect(await getServerViewer(signedIn)).toEqual({
      status: "signedIn",
      name: null,
      avatarUrl: null,
      email: null,
      isPermanent: false,
    });
  });

  it("is loading, for the browser to answer, when the read fails", async () => {
    server.row = new Error("Convex is unreachable");

    expect(await getServerViewer(signedIn)).toEqual({ status: "loading" });
  });

  it("is loading once the read has kept the page waiting too long", async () => {
    vi.useFakeTimers();
    server.row = "hang";

    const viewer = getServerViewer(signedIn);
    await vi.advanceTimersByTimeAsync(SERVER_AUTH_WAIT_MS);

    expect(await viewer).toEqual({ status: "loading" });
  });
});
