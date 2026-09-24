/**
 * The GIF route counts every search it serves, and tells the picker when
 * GIPHY refused one for its hourly rate limit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { isAuthenticated, fetchAuthMutation, after } = vi.hoisted(() => ({
  isAuthenticated: vi.fn(async () => true),
  fetchAuthMutation: vi.fn(async () => null),
  // Run the post-response work at once, as if the answer had just been sent.
  after: vi.fn((work: () => unknown) => void work()),
}));
vi.mock("@/lib/auth-server", () => ({ isAuthenticated, fetchAuthMutation }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

const search = (query: string) => GET(new NextRequest(`http://localhost/api/gifs?q=${query}`));

beforeEach(() => {
  vi.stubEnv("GIPHY_API_KEY", "test-key");
  fetchAuthMutation.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/gifs", () => {
  it("answers a refusal for GIPHY's rate limit with 429, and counts it as one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Too Many Requests", { status: 429 })));

    const response = await search("cat");

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ rateLimited: true });
    expect(fetchAuthMutation).toHaveBeenCalledWith(expect.anything(), { rateLimited: true });
  });

  it("counts a search GIPHY answered", async () => {
    const page = {
      data: [{ id: "g1", title: "Cat", images: { fixed_width: { url: "https://media.giphy.com/media/g1/200w.gif", width: "200", height: "150" } } }],
      pagination: { total_count: 1, count: 1, offset: 0 },
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(page)));

    const response = await search("cat");

    expect(response.status).toBe(200);
    expect((await response.json()).results).toHaveLength(1);
    expect(fetchAuthMutation).toHaveBeenCalledWith(expect.anything(), { rateLimited: false });
  });

  it("counts nothing without a key: there is no GIPHY to call", async () => {
    vi.stubEnv("GIPHY_API_KEY", "");
    const response = await search("cat");
    expect(await response.json()).toMatchObject({ configured: false });
    expect(fetchAuthMutation).not.toHaveBeenCalled();
  });
});
