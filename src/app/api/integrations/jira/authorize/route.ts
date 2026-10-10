import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
import { jiraConnectFailed, jiraRefusalCode } from "../refusal";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    redirect(jiraConnectFailed("jira_unauthorized"));
  }

  // CSRF protection: random state, kept in an httpOnly cookie below
  const state = crypto.randomUUID();

  let authorizeUrl: string;
  try {
    // The Jira OAuth app's settings live in Convex, so it builds the URL
    authorizeUrl = await fetchAuthQuery(
      api.integrations.jira.getJiraAuthorizeUrl,
      { state }
    );
  } catch (err) {
    console.error("Failed to start connecting Jira:", err);
    redirect(jiraConnectFailed(jiraRefusalCode(err) ?? "jira_authorize_failed"));
  }

  const cookieStore = await cookies();
  cookieStore.set("jira_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return Response.redirect(authorizeUrl);
}
