import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { getToken } from "@/lib/auth-server";

/**
 * How long the page's first render waits on Convex for each session read
 * before it renders without it. Convex answers in a few hundred milliseconds;
 * when it is slow or unreachable the page must not hang on it, let alone
 * fail: the browser fetches the session itself once it connects.
 */
export const SERVER_AUTH_WAIT_MS = 2_500;

/** `promise`, or a rejection naming `what` once `ms` have passed. */
export function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The session as the server sees it for the first render: no session at all
 * (no cookie, or one Convex no longer knows), a session whose token Convex
 * didn't give in time or at all, or the token.
 */
export type ServerSession = { status: "none" } | { status: "unknown" } | { status: "token"; token: string };

/**
 * The session's token for the page's first render. A visitor with no
 * session cookie costs no network at all, so a page that needs no session
 * never waits on Convex; a signed-in person's waits at most
 * SERVER_AUTH_WAIT_MS, and a token Convex can't give leaves the session
 * unknown, for the browser to fetch, rather than failing the page.
 */
export async function getServerSession(): Promise<ServerSession> {
  if (!getSessionCookie(await headers())) return { status: "none" };
  try {
    const token = await within(getToken(), SERVER_AUTH_WAIT_MS, "The session's token");
    return token ? { status: "token", token } : { status: "none" };
  } catch (error) {
    console.error("Couldn't fetch the session's token on the server:", error);
    return { status: "unknown" };
  }
}
