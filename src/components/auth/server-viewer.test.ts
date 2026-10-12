/**
 * getServerViewer: who is looking, as the server sees them for the page's
 * first paint. No session costs no read; a session costs one read of who is
 * signed in (users.getViewer) with the token the layout already has, and is
 * unconfirmed: the browser's Convex hasn't authenticated it yet; and a session or
 * a read Convex didn't answer leaves the viewer loading, for the browser to
 * answer, rather than failing the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const server = vi.hoisted(() => ({
  // Convex's answer about who is signed in, the error reading it throws, or "hang" for a read that never answers
  answer: null as Record<string, unknown> | null | Error | "hang",
  reads: [] as { query: string; token?: string }[],
}));

vi.mock("convex/nextjs", () => ({
  fetchQuery: (query: Parameters<typeof getFunctionName>[0], _args: unknown, options: { token?: string }) => {
    server.reads.push({ query: getFunctionName(query), token: options.token });
    if (server.answer === "hang") return new Promise(() => {});
    if (server.answer instanceof Error) return Promise.reject(server.answer);
    return Promise.resolve(server.answer);
  },
}));

// The session read this module shares a wait with; the token comes in as an argument here.
vi.mock("@/lib/auth-server", () => ({ getToken: async () => undefined }));

import { SERVER_AUTH_WAIT_MS } from "@/lib/server-session";
import { getServerViewer } from "./server-viewer";

const signedIn = { status: "token", token: "jwt" } as const;

beforeEach(() => {
  server.answer = null;
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

  it("is who Convex says is signed in, unconfirmed, from one read with the session's token", async () => {
    server.answer = {
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      isPermanent: true,
    };

    expect(await getServerViewer(signedIn)).toEqual({
      status: "signedIn",
      name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      email: "ada@example.com",
      isPermanent: true,
      confirmed: false,
    });
    expect(server.reads).toEqual([{ query: "users:getViewer", token: "jwt" }]);
  });

  it("is signed in as a guest with no name while the caller has no users row yet", async () => {
    server.answer = { name: null, avatarUrl: null, email: null, isPermanent: false };

    expect(await getServerViewer(signedIn)).toEqual({
      status: "signedIn",
      name: null,
      avatarUrl: null,
      email: null,
      isPermanent: false,
      confirmed: false,
    });
  });

  it("is a visitor when Convex finds nobody behind the token", async () => {
    expect(await getServerViewer(signedIn)).toEqual({ status: "visitor" });
  });

  it("is loading, for the browser to answer, when the read fails", async () => {
    server.answer = new Error("Convex is unreachable");

    expect(await getServerViewer(signedIn)).toEqual({ status: "loading" });
  });

  it("is loading once the read has kept the page waiting too long", async () => {
    vi.useFakeTimers();
    server.answer = "hang";

    const viewer = getServerViewer(signedIn);
    await vi.advanceTimersByTimeAsync(SERVER_AUTH_WAIT_MS);

    expect(await viewer).toEqual({ status: "loading" });
  });
});
