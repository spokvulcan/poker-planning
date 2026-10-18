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
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

const backend = vi.hoisted(() => {
  // The shells build their Convex clients from it when they load.
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://shells-test-123.convex.cloud");

  const backend = {
    /** Whether the visitor has a live session. */
    liveSession: false,
    /** Whether the server can reach Convex for the session. */
    reachable: true,
    /** The browser's requests the auth route can't answer: it asks Convex, and answers 500 without it. */
    failing: [] as string[],
    /** Who Convex says the live session is (users.getViewer). */
    viewer: { name: "Ada Lovelace", avatarUrl: null, email: null, isPermanent: false },
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
    if (backend.failing.includes(pathname)) return new Response(null, { status: 500 });
    if (pathname === "/api/auth/sign-out") {
      backend.liveSession = false;
      return json({ success: true });
    }
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
    return backend.liveSession ? backend.viewer : null;
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

// Each document loads in a browser of its own: the modules are evaluated anew
// for every test, so nothing a browser learned for another document carries
// over (BetterAuth's session, the Convex clients).
let RootLayout: typeof import("./layout").default;
let AppLayout: typeof import("./(app)/layout").default;
let DashboardLayout: typeof import("./(app)/dashboard/layout").default;
let DashboardPage: typeof import("./(app)/dashboard/page").default;
let RetrosPage: typeof import("./(app)/dashboard/retros/page").default;
let DemoLayout: typeof import("./(demo)/layout").default;
let DemoPage: typeof import("./(demo)/demo/page").default;
let authClient: typeof import("@/lib/auth-client").authClient;

beforeEach(async () => {
  vi.resetModules();
  ({ default: RootLayout } = await import("./layout"));
  ({ default: AppLayout } = await import("./(app)/layout"));
  ({ default: DashboardLayout } = await import("./(app)/dashboard/layout"));
  ({ default: DashboardPage } = await import("./(app)/dashboard/page"));
  ({ default: RetrosPage } = await import("./(app)/dashboard/retros/page"));
  ({ default: DemoLayout } = await import("./(demo)/layout"));
  ({ default: DemoPage } = await import("./(demo)/demo/page"));
  ({ authClient } = await import("@/lib/auth-client"));
});

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
  backend.failing = [];
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

// Convex unreachable from the server and, through the auth route, from the
// browser: a signed-in person's session is unknown, not gone.
describe("a dashboard page, while Convex can't be reached", () => {
  beforeEach(() => {
    backend.framed = false;
    backend.liveSession = true;
    backend.reachable = false;
    backend.path = "/dashboard";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("waits for a session the browser can't fetch, sending nobody to sign in", async () => {
    backend.failing = ["/api/auth/get-session", "/api/auth/convex/token"];

    await load(await serveDashboard(<DashboardPage />));

    expect(backend.requests).toContain("browser: /api/auth/get-session");
    expect(document.body.textContent).toContain("Loading dashboard...");
    expect(backend.navigations).toEqual([]);
  });

  it("waits for a session whose token the browser can't fetch, sending nobody to sign in", async () => {
    backend.failing = ["/api/auth/convex/token"];

    await load(await serveDashboard(<DashboardPage />));

    expect(backend.requests).toContain("browser: /api/auth/convex/token");
    expect(document.body.textContent).toContain("Loading dashboard...");
    expect(backend.navigations).toEqual([]);
  });

  it("asks for the session again, and sends the person to sign in once the browser finds it ended", async () => {
    backend.failing = ["/api/auth/get-session", "/api/auth/convex/token"];
    await load(await serveDashboard(<DashboardPage />));

    // Convex is back, and the session ended meanwhile.
    backend.failing = [];
    backend.liveSession = false;

    await waitFor(() => expect(backend.navigations).toEqual(["/auth/signin?from=%2Fdashboard"]), { timeout: 3_000 });
  });
});

describe("a dashboard page, for a signed-in person", () => {
  it.each([
    { where: "here", signOut: () => authClient.signOut() },
    {
      where: "in another tab",
      // BetterAuth's message to every other tab of the site
      signOut: () => {
        backend.liveSession = false;
        const message = { event: "session", data: { trigger: "signout" }, clientId: "another-tab" };
        window.dispatchEvent(new StorageEvent("storage", { key: "better-auth.message", newValue: JSON.stringify(message) }));
      },
    },
  ])("sends them to sign in, coming back to the page, once they sign out $where", async ({ signOut }) => {
    backend.framed = false;
    backend.liveSession = true;
    backend.path = "/dashboard";
    await load(await serveDashboard(<DashboardPage />));
    expect(document.body.textContent).toContain("Ada Lovelace");
    expect(backend.navigations).toEqual([]);

    await act(async () => {
      await signOut();
    });

    await waitFor(() => expect(backend.navigations).toEqual(["/auth/signin?from=%2Fdashboard"]));
  });
});
