import { api } from "@/convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { viewerOf, type Viewer } from "./viewer";

/**
 * The viewer as the server sees them, for the page's first paint: the (app)
 * layout hands it to the auth provider, which shows it until Convex answers
 * in the browser, so a refresh draws who is looking at once rather than a
 * loading state. One read of the caller's users row, with the token the
 * request already fetched (the auth server caches it per request), and none
 * when nobody is signed in.
 */
export async function getServerViewer(): Promise<Viewer> {
  if (!(await isAuthenticated())) return { status: "visitor" };
  try {
    return viewerOf(false, true, await fetchAuthQuery(api.users.getGlobalUser));
  } catch (error) {
    // The page renders all the same, and the browser answers once it connects
    console.error("Failed to read the viewer on the server:", error);
    return { status: "loading" };
  }
}
