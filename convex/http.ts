import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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

export default http;
