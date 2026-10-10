import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchAuthAction } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
import { jiraConnectFailed, jiraRefusalCode } from "../refusal";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    redirect(jiraConnectFailed("jira_denied"));
  }

  if (!code || !state) {
    redirect(jiraConnectFailed("jira_invalid"));
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get("jira_oauth_state")?.value;
  cookieStore.delete("jira_oauth_state");

  if (!storedState || storedState !== state) {
    redirect(jiraConnectFailed("jira_state_mismatch"));
  }

  try {
    // Convex exchanges the code and stores the connection, as the person
    // (fetchAuthAction carries the user's session cookie automatically)
    await fetchAuthAction(api.integrations.jira.connectJira, { code });
  } catch (err) {
    console.error("Failed to connect Jira:", err);
    redirect(jiraConnectFailed(jiraRefusalCode(err) ?? "jira_store_failed"));
  }

  redirect("/dashboard/settings?tab=integrations&connected=jira");
}
