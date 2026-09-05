import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { verifyAndParseJiraWebhook } from "./integrations/jiraWebhook";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// Jira webhook endpoint — receives issue updates from Jira Cloud. Secret
// verification and payload parsing live in the Jira adapter
// (integrations/jiraWebhook.ts); this route only dispatches the processing
// mutation and always answers 200 to non-forbidden deliveries so Jira does
// not retry.
http.route({
  path: "/webhooks/jira",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const parsed = await verifyAndParseJiraWebhook(
        request,
        process.env.JIRA_WEBHOOK_SECRET
      );
      if (!parsed.ok) {
        return parsed.response;
      }

      // Dedup + processing happen in a single mutation (atomic).
      // This avoids the race where concurrent deliveries both pass a
      // separate query check and then both insert + process.
      await ctx.runMutation(
        internal.integrations.jira.processJiraWebhook,
        parsed.event
      );

      return new Response(null, { status: 200 });
    } catch (error) {
      console.error("Jira webhook error:", error);
      return new Response(null, { status: 200 }); // Always 200 to prevent retries
    }
  }),
});

// RFC 8058 one-click unsubscribe (spec §16.4): the `List-Unsubscribe`
// header on every nudge and reminder points here. The mail client POSTs
// `List-Unsubscribe=One-Click`; the token in the query string is the whole
// authorization, and a mismatch flips nothing. Always 200 once the route
// answers, so a client never retries a link that was simply stale.
http.route({
  path: "/api/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    try {
      await ctx.runMutation(api.email.unsubscribe, { token });
    } catch (error) {
      console.error("Unsubscribe error:", error);
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
