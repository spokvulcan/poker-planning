import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchAuthAction } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
import { exchangeJiraCode } from "./exchangeCode";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    redirect("/dashboard/settings?tab=integrations&error=jira_denied");
  }

  if (!code || !state) {
    redirect("/dashboard/settings?tab=integrations&error=jira_invalid");
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get("jira_oauth_state")?.value;
  cookieStore.delete("jira_oauth_state");

  if (!storedState || storedState !== state) {
    redirect("/dashboard/settings?tab=integrations&error=jira_state_mismatch");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL!;

  const result = await exchangeJiraCode(code, {
    clientId: process.env.JIRA_CLIENT_ID!,
    clientSecret: process.env.JIRA_CLIENT_SECRET!,
    appUrl,
  });

  if (!result.ok) {
    redirect(`/dashboard/settings?tab=integrations&error=${result.error}`);
  }

  try {
    // Call public action via user's auth session (fetchAuthAction
    // carries the user's session cookie automatically)
    await fetchAuthAction(api.integrations.jira.connectJira, result.connection);
  } catch (err) {
    console.error("Failed to store Jira connection:", err);
    redirect(
      "/dashboard/settings?tab=integrations&error=jira_store_failed"
    );
  }

  redirect("/dashboard/settings?tab=integrations&connected=jira");
}
