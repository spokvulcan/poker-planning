"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { browserSessionOf } from "./browser-session";

/**
 * How long to wait before asking again for a session or a token the browser
 * couldn't fetch, after `attempt` tries: a second, doubling up to half a minute.
 */
function retryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 30_000);
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

/**
 * The session's token, asked of the auth route until it answers: the token,
 * or null when there is no session (a 401). A request that fails, or any
 * other answer (Convex unreachable: the route asks Convex, and answers 500
 * without it), is no answer, and it asks again, waiting longer each time,
 * until `signal` aborts.
 */
async function tokenWhenAnswered(signal: AbortSignal): Promise<string | null> {
  for (let attempt = 0; !signal.aborted; attempt++) {
    try {
      const { data, error } = await authClient.convex.token({ fetchOptions: { throw: false, signal } });
      if (data?.token) return data.token;
      if (!error || error.status === 401) return null;
    } catch {
      // No answer: the request failed
    }
    await waitFor(retryDelay(attempt), signal);
  }
  return null;
}

/**
 * Fetches the session's token, one fetch at a time for the session's user:
 * a fetch begun for another (before a sign-in, or a guest's account link)
 * isn't theirs to share. Fetches still asking stop when the provider unmounts.
 */
function useTokenFetch(): (user: string | null) => Promise<string | null> {
  const inFlight = useRef<{ user: string | null; token: Promise<string | null> } | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      lifetime.current?.abort();
      lifetime.current = null;
      inFlight.current = null;
    },
    [],
  );
  return useCallback((user: string | null) => {
    if (inFlight.current?.user !== user) {
      lifetime.current ??= new AbortController();
      const request = { user, token: tokenWhenAnswered(lifetime.current.signal) };
      inFlight.current = request;
      void request.token.finally(() => {
        if (inFlight.current === request) inFlight.current = null;
      });
    }
    return inFlight.current.token;
  }, []);
}

// The token the server fetched for the first render, for useSessionAuth,
// which ConvexProviderWithAuth calls with nothing
const ServerToken = createContext<string | null>(null);

/**
 * Convex's auth state from the browser's session, which ConvexProviderWithAuth
 * asks for as it renders: signed in while BetterAuth holds a session, and
 * signed out once it answers that there is none. Until it knows (the session
 * still loading, or one it couldn't fetch) Convex's auth is loading, or signed
 * in with the server's token when there is one. A session it couldn't fetch
 * is asked for again, waiting longer each time, until BetterAuth answers.
 */
function useSessionAuth() {
  const initialToken = useContext(ServerToken);
  const { data, error, isPending, refetch } = authClient.useSession();
  const session = browserSessionOf({ data, error, isPending });
  const known = session.status === "live" || session.status === "none";

  // The token the server fetched for the first render, until the browser knows the session
  const [serverToken, setServerToken] = useState(initialToken);
  if (known && serverToken !== null) setServerToken(null);

  const attempts = useRef(0);
  useEffect(() => {
    if (known) attempts.current = 0;
    if (session.status !== "unknown") return;
    const timer = setTimeout(() => {
      attempts.current++;
      void refetch();
    }, retryDelay(attempts.current));
    return () => clearTimeout(timer);
  }, [known, session.status, refetch]);

  // A new user builds a new fetchAccessToken, which signs Convex in again
  const user = session.status === "live" ? session.authUserId : null;
  const fetchToken = useTokenFetch();
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
      serverToken !== null && !forceRefreshToken ? serverToken : fetchToken(user),
    [serverToken, fetchToken, user],
  );

  return {
    isLoading: !known && serverToken === null,
    isAuthenticated: session.status === "live" || (!known && serverToken !== null),
    fetchAccessToken,
  };
}

/**
 * Convex, signed in with this browser's BetterAuth session, starting from the
 * token the server fetched for the first render. It stands where
 * @convex-dev/better-auth's ConvexBetterAuthProvider would, which takes a
 * session or a token it couldn't fetch for none, so a person is signed out of
 * Convex for as long as Convex can't be reached. Here only an answer signs
 * them out (browser-session.ts): a session the browser couldn't fetch leaves
 * Convex's auth loading until BetterAuth answers, and a token it couldn't
 * fetch is asked for again until the auth route answers, Convex waiting for
 * it meanwhile.
 */
export function ConvexSessionProvider({
  client,
  initialToken,
  children,
}: {
  client: ConvexReactClient;
  initialToken?: string | null;
  children: ReactNode;
}) {
  return (
    <ServerToken.Provider value={initialToken ?? null}>
      <ConvexProviderWithAuth client={client} useAuth={useSessionAuth}>
        {children}
      </ConvexProviderWithAuth>
    </ServerToken.Provider>
  );
}
