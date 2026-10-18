/**
 * The two shells under the shared root layout. A page in the (app) group gets
 * the app shell: the session's token and the viewer fetched on the server,
 * BetterAuth and the auth provider. /demo sits in the (demo) group, whose
 * shell has a Convex client and no auth, so the Demo simulation never reaches
 * the backend (ADR-0003), whatever the visitor's session, because of where
 * its route sits.
 *
 * Each test serves a whole document as Next would (the root layout around a
 * group's layout around a page) and loads it in jsdom with effects running.
 * The backend is faked at its edges: the server's token fetch, the browser's
 * requests, and every socket a Convex client opens. The homepage frames
 * `/demo?embed=true` on every visit; a visitor can also open /demo itself.
 * A dashboard page sits in the app shell behind the dashboard's gate.
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
    /** Whether the server can reach Convex for the session. */
    reachable: true,
    /** Whether the document is the homepage's frame or a page of its own. */
    framed: false,
    /** The path of the page the document is served for. */
    path: "/",
    /** Every request that reached the backend, from the server or the browser. */
    requests: [] as string[],
    /** Every page the browser was sent to after the document loaded. */
    navigations: [] as string[],
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

  return backend;
});

// The server fetches the session's token through this module, and reads the
// viewer with it through Convex's. Its isAuthenticated is the same fetch, as
// the real one is, with none of getServerSession's rules: it fetches with no
// session cookie too, and rethrows when Convex can't be reached.
vi.mock("@/lib/auth-server", () => {
  const getToken = async () => {
    backend.requests.push("server: /api/auth/convex/token");
    if (!backend.reachable) throw new TypeError("fetch failed");
    return backend.liveSession ? backend.token : null;
  };
  return { getToken, isAuthenticated: async () => !!(await getToken()) };
});
vi.mock("convex/nextjs", () => ({
  fetchQuery: async () => {
    backend.requests.push("server: /api/query");
    return null;
  },
}));

// The request the document is served for, from a visitor who has not made an
// analytics choice yet, with the session cookie of a live session, and the
// page's path as the proxy puts it on the request.
vi.mock("next/headers", async () => {
  const { PAGE_PATH_HEADER } = await import("@/lib/page-path");
  return {
    cookies: async () => ({ get: () => undefined }),
    headers: async () =>
      new Headers({
        "sec-fetch-dest": backend.framed ? "iframe" : "document",
        [PAGE_PATH_HEADER]: backend.path,
        ...(backend.liveSession && { cookie: "better-auth.session_token=session-1.signature" }),
      }),
  };
});

// Next's compiler replaces these calls at build time.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "" });
  return { Geist: font, Geist_Mono: font, Outfit: font };
});

// There is no app router in jsdom. A redirect ends the server's render, as
// Next's does, and names the page the document sends the browser to instead.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(backend.framed ? "embed=true" : ""),
  usePathname: () => backend.path,
  useRouter: () => ({ push: () => {}, replace: (href: string) => backend.navigations.push(href) }),
  redirect: (href: string) => {
    throw Object.assign(new Error(`Redirected to ${href}`), { redirectedTo: href });
  },
}));

import RootLayout from "./layout";
import AppLayout from "./(app)/layout";
import DashboardLayout from "./(app)/dashboard/layout";
import DashboardPage from "./(app)/dashboard/page";
import RetrosPage from "./(app)/dashboard/retros/page";
import DemoLayout from "./(demo)/layout";
import DemoPage from "./(demo)/demo/page";

type Layout = (props: { children: ReactNode }) => ReactNode | Promise<ReactNode>;

/** Serves a page as Next does: the root layout around its group's layout. */
async function serve(groupLayout: Layout, page: ReactElement) {
  return RootLayout({ children: await groupLayout({ children: page }) });
}

/** Serves a dashboard page: the app shell around the dashboard's layout around the page. */
async function serveDashboard(page: ReactElement) {
  return serve(AppLayout, await DashboardLayout({ children: page }));
}

/** Loads a served document in the browser and lets its effects run. */
async function load(served: ReactNode) {
  render(served, { container: document });
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
}

beforeEach(() => {
  backend.path = "/";
  backend.requests = [];
  backend.navigations = [];
  backend.sockets = [];
  backend.reachable = true;
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
  it("fetches the token and the viewer on the server, reads the session and connects, for a live session", async () => {
    backend.framed = false;
    backend.liveSession = true;

    await load(await serve(AppLayout, <p>An app page</p>));

    expect(backend.requests).toContain("server: /api/auth/convex/token");
    expect(backend.requests).toContain("server: /api/query");
    expect(backend.requests).toContain("browser: /api/auth/get-session");
    expect(backend.sockets).toEqual([expect.stringMatching(/^wss:\/\/shells-test-123\.convex\.cloud\//)]);
  });

  it("asks the server for nothing about a visitor with no session", async () => {
    backend.framed = false;
    backend.liveSession = false;

    await load(await serve(AppLayout, <p>An app page</p>));

    expect(backend.requests.filter((request) => request.startsWith("server:"))).toEqual([]);
  });

  it("still serves the page when the server can't reach Convex, leaving the session to the browser", async () => {
    backend.framed = false;
    backend.liveSession = true;
    backend.reachable = false;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await load(await serve(AppLayout, <p>An app page</p>));

    expect(document.body.textContent).toContain("An app page");
    expect(backend.requests).toContain("server: /api/auth/convex/token");
    expect(backend.requests).not.toContain("server: /api/query");
  });
});

describe("a dashboard page", () => {
  it("still serves when the server can't reach Convex, leaving the session to the browser's gate", async () => {
    backend.framed = false;
    backend.liveSession = true;
    backend.reachable = false;
    backend.path = "/dashboard";
    vi.spyOn(console, "error").mockImplementation(() => {});

    await load(await serveDashboard(<DashboardPage />));

    // The page waits for the browser to know who is looking, and nobody is sent to sign in meanwhile.
    expect(document.body.textContent).toContain("Loading dashboard...");
    expect(backend.requests).toContain("server: /api/auth/convex/token");
    expect(backend.navigations).toEqual([]);
  });

  it("sends a visitor with no session to sign in, coming back to the page, without fetching a token", async () => {
    backend.framed = false;
    backend.liveSession = false;
    backend.path = "/dashboard/retros";

    await expect(serveDashboard(<RetrosPage />)).rejects.toMatchObject({
      redirectedTo: "/auth/signin?from=%2Fdashboard%2Fretros",
    });
    expect(backend.requests).toEqual([]);
  });
});
