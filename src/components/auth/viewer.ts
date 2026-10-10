import type { Doc } from "@/convex/_generated/dataModel";

/**
 * Who is looking at the page: loading until Convex's auth state and the
 * caller's users row have answered, a visitor when nobody is signed in, else
 * signed in. A signed-in viewer has no row until their first room write
 * makes it (a guest who only continued as one) and is ready all the same:
 * no name, avatar or email yet, and not a permanent account. The auth
 * provider hands it out (auth-provider.tsx), starting from the one the
 * server saw (server-viewer.ts).
 */
export type Viewer =
  | { status: "loading" }
  | { status: "visitor" }
  | {
      status: "signedIn";
      // The users row's, null while there is none
      name: string | null;
      avatarUrl: string | null;
      email: string | null;
      // Whether the users row says the account is permanent. A row with no
      // kind (a guest's made before the server made rows) and no row at all
      // are not a permanent account's
      isPermanent: boolean;
    };

/** A viewer who is signed in. */
export type SignedInViewer = Extract<Viewer, { status: "signedIn" }>;

/**
 * The viewer, from Convex's auth state and the caller's users row (undefined
 * until it answers). The server works it out the same way for the first
 * paint (server-viewer.ts), the auth provider in the browser after.
 */
export function viewerOf(isLoading: boolean, isAuthenticated: boolean, row: Doc<"users"> | null | undefined): Viewer {
  if (isLoading) return { status: "loading" };
  if (!isAuthenticated) return { status: "visitor" };
  if (row === undefined) return { status: "loading" };
  return {
    status: "signedIn",
    name: row?.name ?? null,
    avatarUrl: row?.avatarUrl ?? null,
    email: row?.email ?? null,
    isPermanent: row?.accountType === "permanent",
  };
}

/**
 * The kind of account a signed-in viewer has, as their users row says:
 * "permanent", or "guest" for any other (a row with no kind, or none yet).
 * Null while loading and for a visitor.
 */
export function accountKind(viewer: Viewer): "permanent" | "guest" | null {
  if (viewer.status !== "signedIn") return null;
  return viewer.isPermanent ? "permanent" : "guest";
}
