/**
 * The two shells under the shared root layout. A page in the (app) group gets
 * the app shell: the session's token fetched on the server, BetterAuth and the
 * auth provider. /demo sits in the (demo) group, whose shell has a Convex
 * client and no auth, so the Demo simulation never reaches the backend
 * (ADR-0003), whatever the visitor's session, because of where its route sits.
 *
 * Each test serves a whole document as Next would (the root layout around a
 * group's layout around a page) and loads it in jsdom with effects running.
 * The backend is faked at its edges: the server's token fetch, the browser's
 * requests, and every socket a Convex client opens. The homepage frames
 * `/demo?embed=true` on every visit; a visitor can also open /demo itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

const backend = vi.hoisted(() => {
  // The shells build their Convex clients from it when they load.
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://shells-test-123.convex.cloud");

  const backend = {
    /** Whether the visitor has a live session. */
    liveSession: false,
    /** Whether the document is the homepage's frame or a page of its own. */
    framed: false,
    /** Every request that reached the backend, from the server or the browser. */
    requests: [] as string[],
    /** Every socket a Convex client opened. */
    sockets: [] as string[],
    /** The live session's token, decodable so a Convex client has nothing to log. */
    token: [{ alg: "none", typ: "JWT" }, { sub: "user-1", exp: 4_000_000_000 }]
      .map((part) => btoa(JSON.stringify(part)).replace(/=+$/, ""))
      .concat("signature")
      .join("."),
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  // Installed before anything loads: the BetterAuth client keeps the fetch it
  // finds when it is created.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const { pathname } = new URL(input instanceof Request ? input.url : String(input));
    backend.requests.push(`browser: ${pathname}`);
    if (pathname === "/api/auth/get-session") {
      return json(
        backend.liveSession
          ? {
              session: { id: "session-1", userId: "user-1", expiresAt: "2099-01-01T00:00:00.000Z" },
              user: { id: "user-1", isAnonymous: true },
            }
          : null,
      );
    }
    if (pathname === "/api/auth/convex/token") {
      return backend.liveSession ? json({ token: backend.token }) : json({ message: "Unauthorized" }, 401);
    }
    return json({ message: "Not found" }, 404);
  });

  vi.stubGlobal(
    "WebSocket",
    class {
      constructor(url: string | URL) {
        backend.sockets.push(String(url));
      }
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    },
  );

  // What jsdom lacks and the canvas and the theme need.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));

  return backend;
});

// The server fetches the session's token through this module.
vi.mock("@/lib/auth-server", () => ({
  getToken: async () => {
    backend.requests.push("server: /api/auth/convex/token");
    return backend.liveSession ? backend.token : null;
  },
}));

// The request the document is served for, from a visitor who has not made an
// analytics choice yet.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "sec-fetch-dest": backend.framed ? "iframe" : "document" }),
}));

// Next's compiler replaces these calls at build time.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "" });
  return { Geist: font, Geist_Mono: font, Outfit: font };
});

// There is no app router in jsdom.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(backend.framed ? "embed=true" : ""),
  useRouter: () => ({ push: () => {} }),
}));

import RootLayout from "./layout";
import AppLayout from "./(app)/layout";
import DemoLayout from "./(demo)/layout";
import DemoPage from "./(demo)/demo/page";

type Layout = (props: { children: ReactNode }) => ReactNode | Promise<ReactNode>;

/** Serves a page as Next does: the root layout around its group's layout. */
async function serve(groupLayout: Layout, page: ReactElement) {
  return RootLayout({ children: await groupLayout({ children: page }) });
}

/** Loads a served document in the browser and lets its effects run. */
async function load(served: ReactNode) {
  render(served, { container: document });
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
}

beforeEach(() => {
  backend.requests = [];
  backend.sockets = [];
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the demo shell", () => {
  it.each([
    { framed: true, liveSession: true },
    { framed: true, liveSession: false },
    { framed: false, liveSession: true },
    { framed: false, liveSession: false },
  ])(
    "loads /demo with no token fetch, session request or socket (framed: $framed, live session: $liveSession)",
    async ({ framed, liveSession }) => {
      backend.framed = framed;
      backend.liveSession = liveSession;

      await load(await serve(DemoLayout, <DemoPage />));

      // The simulation is running: its six bots are on the canvas.
      expect(document.querySelectorAll('[aria-label^="Player "]')).toHaveLength(6);
      expect(backend.requests).toEqual([]);
      expect(backend.sockets).toEqual([]);
    },
  );
});

describe("the app shell", () => {
  it("fetches the token on the server, reads the session and connects, for a live session", async () => {
    backend.framed = false;
    backend.liveSession = true;

    await load(await serve(AppLayout, <p>An app page</p>));

    expect(backend.requests).toContain("server: /api/auth/convex/token");
    expect(backend.requests).toContain("browser: /api/auth/get-session");
    expect(backend.sockets).toEqual([expect.stringMatching(/^wss:\/\/shells-test-123\.convex\.cloud\//)]);
  });
});
