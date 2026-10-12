import type { CallerView } from "@/convex/model/caller";

/**
 * Who is looking at the page: loading until Convex's auth state and its
 * answer about the person (users.getViewer) are in, a visitor when nobody is
 * signed in, else signed in. A signed-in viewer has no users row until their
 * first room write makes it (a guest who only continued as one) and is
 * ready all the same: no name, avatar or email yet. The auth provider hands
 * it out (auth-provider.tsx), starting from the one the server saw
 * (server-viewer.ts), and pages read as the viewer through useCallerQuery.
 */
export type Viewer =
  | { status: "loading" }
  | { status: "visitor" }
  | {
      status: "signedIn";
      // The users row's, null while there is none (a permanent account's token names it)
      name: string | null;
      avatarUrl: string | null;
      email: string | null;
      // Whether the account is permanent, as the session's token says
      isPermanent: boolean;
      // Whether Convex has confirmed the session in this browser. Until it
      // has (the server's first-paint viewer standing in), reads made as the
      // viewer wait: useCallerQuery
      confirmed: boolean;
    };

/** A viewer who is signed in. */
export type SignedInViewer = Extract<Viewer, { status: "signedIn" }>;

/** What Convex answers about the person signed in (users.getViewer): null when nobody is. */
export type ViewerAnswer = CallerView | null;

/**
 * The viewer, from Convex's auth state and its answer (undefined until it
 * answers), confirmed when Convex authenticated the session. The server works
 * it out the same way for the first paint (server-viewer.ts), unconfirmed;
 * the auth provider in the browser after.
 */
export function viewerOf(
  auth: { isLoading: boolean; isAuthenticated: boolean },
  answer: ViewerAnswer | undefined,
  confirmed: boolean = auth.isAuthenticated
): Viewer {
  if (auth.isLoading) return { status: "loading" };
  if (!auth.isAuthenticated || answer === null) return { status: "visitor" };
  if (answer === undefined) return { status: "loading" };
  return { status: "signedIn", ...answer, confirmed };
}

/**
 * The kind of account a signed-in viewer has: "permanent", or "guest" for
 * any other. Null while loading and for a visitor.
 */
export function accountKind(viewer: Viewer): "permanent" | "guest" | null {
  if (viewer.status !== "signedIn") return null;
  return viewer.isPermanent ? "permanent" : "guest";
}
