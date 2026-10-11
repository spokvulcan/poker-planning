import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { SERVER_AUTH_WAIT_MS, within, type ServerSession } from "@/lib/server-session";
import { viewerOf, type Viewer } from "./viewer";

/**
 * The viewer as the server sees them, for the page's first paint: the (app)
 * layout hands it to the auth provider, which shows it until Convex answers
 * in the browser, so a refresh draws who is looking at once rather than a
 * loading state. One read of the caller's users row, with the token the
 * layout already has, and none when nobody is signed in. A session or a read
 * Convex didn't answer in time leaves the viewer loading, for the browser to
 * answer, rather than failing the page.
 */
export async function getServerViewer(session: ServerSession): Promise<Viewer> {
  if (session.status === "none") return { status: "visitor" };
  if (session.status === "unknown") return { status: "loading" };
  try {
    const row = await within(
      fetchQuery(api.users.getGlobalUser, {}, { token: session.token }),
      SERVER_AUTH_WAIT_MS,
      "The viewer",
    );
    return viewerOf(false, true, row);
  } catch (error) {
    console.error("Failed to read the viewer on the server:", error);
    return { status: "loading" };
  }
}
