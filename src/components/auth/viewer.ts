/**
 * Who is looking at the page: loading until Convex's auth state and the
 * caller's users row have answered, a visitor when nobody is signed in, else
 * signed in. A signed-in viewer has no row until their first room write
 * makes it (a guest who only continued as one) and is ready all the same:
 * no name, avatar or email yet, and not a permanent account. The auth
 * provider hands it out (auth-provider.tsx).
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
 * The kind of account a signed-in viewer has, as their users row says:
 * "permanent", or "guest" for any other (a row with no kind, or none yet).
 * Null while loading and for a visitor.
 */
export function accountKind(viewer: Viewer): "permanent" | "guest" | null {
  if (viewer.status !== "signedIn") return null;
  return viewer.isPermanent ? "permanent" : "guest";
}
