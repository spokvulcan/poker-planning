/**
 * getServerViewer: who is looking, as the server sees them for the page's
 * first paint. A visitor without a session costs no read; anyone signed in
 * costs one read of their users row; and a Convex the server can't reach
 * leaves the viewer loading, for the browser to answer, rather than failing
 * the page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFunctionName } from "convex/server";

const server = vi.hoisted(() => ({
  signedIn: true,
  // The caller's users row, or the error reading it throws
  row: null as Record<string, unknown> | null | Error,
  reads: [] as string[],
}));

vi.mock("@/lib/auth-server", () => ({
  isAuthenticated: async () => server.signedIn,
  fetchAuthQuery: async (query: Parameters<typeof getFunctionName>[0]) => {
    server.reads.push(getFunctionName(query));
    if (server.row instanceof Error) throw server.row;
    return server.row;
  },
}));

import { getServerViewer } from "./server-viewer";

beforeEach(() => {
  server.signedIn = true;
  server.row = null;
  server.reads = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getServerViewer", () => {
  it("is a visitor, with no read, when nobody is signed in", async () => {
    server.signedIn = false;

    expect(await getServerViewer()).toEqual({ status: "visitor" });
    expect(server.reads).toEqual([]);
  });

  it("has the name, avatar and email of the caller's users row, from one read", async () => {
    server.row = {
      _id: "user-ada",
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      accountType: "permanent",
    };

    expect(await getServerViewer()).toEqual({
      status: "signedIn",
      name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      email: "ada@example.com",
      isPermanent: true,
    });
    expect(server.reads).toEqual(["users:getGlobalUser"]);
  });

  it("is signed in as a guest with no name while the caller has no users row yet", async () => {
    expect(await getServerViewer()).toEqual({
      status: "signedIn",
      name: null,
      avatarUrl: null,
      email: null,
      isPermanent: false,
    });
  });

  it("is loading, for the browser to answer, when the read fails", async () => {
    server.row = new Error("Convex is unreachable");

    expect(await getServerViewer()).toEqual({ status: "loading" });
  });
});
