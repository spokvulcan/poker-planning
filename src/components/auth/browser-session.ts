/**
 * What this browser knows of its BetterAuth session: loading; unknown, when
 * it couldn't fetch the session and holds none from before (Convex slow or
 * unreachable: the auth route asks Convex, and answers 500 without it);
 * none, when BetterAuth answered that there is no session; or the session
 * and its user. Only an answer ends a session: BetterAuth keeps the session
 * it held through a fetch that fails, and a fetch that fails is never taken
 * for a sign-out. Convex is signed in from it (convex-session.tsx), and the
 * sign-in's waits read it (auth-provider.tsx).
 */
export type BrowserSession =
  | { status: "loading" }
  | { status: "unknown" }
  | { status: "none" }
  | { status: "live"; authUserId: string };

/** BetterAuth's session state (authClient.useSession()), as much as says what it knows. */
export interface SessionState {
  data: { user: { id: string } } | null;
  // Set when the last fetch failed: a 401 is BetterAuth's answer of no session, anything else no answer
  error?: { status?: number } | null;
  isPending: boolean;
}

/** The session as this browser knows it, from BetterAuth's session state. */
export function browserSessionOf({ data, error, isPending }: SessionState): BrowserSession {
  if (data?.user) return { status: "live", authUserId: data.user.id };
  if (isPending) return { status: "loading" };
  if (error && error.status !== 401) return { status: "unknown" };
  return { status: "none" };
}
