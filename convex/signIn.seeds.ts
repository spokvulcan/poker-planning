/**
 * Signing in through BetterAuth's own routes (convex/auth.ts, mounted by
 * http.ts) inside convex-test, the way a browser does. Each sign-in is a
 * device: the cookies BetterAuth set on its browser, and what Convex reads
 * from the token it was handed. `stubAuthDeployment` gives the test
 * deployment the settings a real one has (docs/authentication.md) and
 * catches the magic-link email instead of sending it; undo it with
 * `vi.unstubAllEnvs()` and `vi.unstubAllGlobals()`. Multi-dot like
 * analytics.seeds.ts, so it never deploys.
 */
import { vi } from "vitest";
import { components } from "./_generated/api";
import type { T } from "./analytics.seeds";

/** The site the browser is on, as BetterAuth's trusted origins take it. */
const SITE = "http://localhost:3000";

/** One browser, signed in. */
export interface Device {
  /** The Cookie header its browser sends BetterAuth. */
  cookie: string;
  /**
   * The claims Convex reads from its token: `subject` is BetterAuth's user,
   * `sessionId` the device's session.
   */
  identity: { subject: string; sessionId: string; isAnonymous: boolean; email: string; name: string };
}

/** The magic-link emails caught since the deployment was stubbed, newest last. */
let inbox: string[] = [];

/** The settings a deployment gives BetterAuth, and an email channel that catches instead of sending. */
export function stubAuthDeployment(): void {
  vi.stubEnv("BETTER_AUTH_SECRET", "convex-test-secret-".repeat(2));
  vi.stubEnv("CONVEX_SITE_URL", "https://convex-test.convex.site");
  vi.stubEnv("RESEND_API_KEY", "re_convex_test");
  inbox = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url !== "https://api.resend.com/emails") throw new Error(`Unexpected fetch: ${url}`);
    inbox.push(JSON.parse(String(init?.body)).html);
    return new Response("{}", { status: 200 });
  });
}

/** A request from the device's browser to one of BetterAuth's routes. */
export function authRequest(t: T, path: string, init: { method?: string; cookie?: string; body?: unknown } = {}) {
  return t.fetch(path, {
    method: init.method ?? "GET",
    headers: {
      origin: SITE,
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Signs `email` in on a new device, by the link BetterAuth emails: a new account the first time. */
export async function signInByMagicLink(t: T, email: string): Promise<Device> {
  await authRequest(t, "/api/auth/sign-in/magic-link", { method: "POST", body: { email } });
  const href = /href="([^"]+)"/.exec(inbox.at(-1) ?? "")?.[1];
  if (!href) throw new Error(`No magic link was sent to ${email}`);
  const link = new URL(href.replaceAll("&amp;", "&"));
  return deviceOf(await authRequest(t, link.pathname + link.search));
}

/** A new guest on a new device ("Continue as guest"). */
export async function signInAsGuest(t: T): Promise<Device> {
  return deviceOf(await authRequest(t, "/api/auth/sign-in/anonymous", { method: "POST", body: {} }));
}

/** The device a sign-in's response leaves signed in: its cookies, and its Convex token's claims. */
function deviceOf(response: Response): Device {
  const cookies = response.headers.getSetCookie().map((header) => header.split(";")[0]);
  const token = cookies.find((cookie) => cookie.startsWith("better-auth.convex_jwt="))?.split("=")[1];
  if (!token) throw new Error(`Not signed in (${response.status})`);
  const claims = JSON.parse(atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")));
  return {
    cookie: cookies.join("; "),
    identity: {
      subject: claims.sub,
      sessionId: claims.sessionId,
      isAnonymous: claims.isAnonymous,
      email: claims.email,
      name: claims.name,
    },
  };
}

/** What BetterAuth keeps of a person: their user, and their sessions and accounts. */
export async function signInRows(t: T, authUserId: string) {
  const byUser = (model: "session" | "account") =>
    t.query(components.betterAuth.adapter.findMany, {
      model,
      where: [{ field: "userId", value: authUserId }],
      paginationOpts: { cursor: null, numItems: 100 },
    });
  return {
    user: await t.query(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: authUserId }],
    }),
    sessions: (await byUser("session")).page,
    accounts: (await byUser("account")).page,
  };
}
