import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// Constant-time string comparison via fixed-length digests, so neither the
// length nor the matching prefix of the secret leaks through timing.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

// Jira webhook endpoint — receives issue updates from Jira Cloud
http.route({
  path: "/webhooks/jira",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      // Shared-secret check. Jira Cloud webhooks cannot send custom headers,
      // so the registration embeds the secret in the webhook URL as a query
      // param (high-entropy, HTTPS-only); the header is accepted as well.
      // Fail closed: without a configured secret no delivery is trusted.
      const webhookSecret = process.env.JIRA_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error(
          "Jira webhook rejected: JIRA_WEBHOOK_SECRET is not configured"
        );
        return new Response("Forbidden", { status: 403 });
      }
      const token =
        request.headers.get("x-hub-secret") ??
        new URL(request.url).searchParams.get("secret");
      if (!token || !(await timingSafeEqual(token, webhookSecret))) {
        console.warn("Jira webhook rejected: invalid secret");
        return new Response("Forbidden", { status: 403 });
      }

      const payload = await request.json();
      const eventType = payload.webhookEvent as string;
      const issue = payload.issue;

      if (!issue?.key) {
        return new Response(null, { status: 200 });
      }

      // Build a stable dedup key. Use Jira's own timestamp field which is
      // consistent across retries of the same delivery. Never fall back to
      // Date.now() — that would make retries non-deduplicable.
      if (!payload.timestamp) {
        console.warn("Jira webhook missing timestamp, skipping");
        return new Response(null, { status: 200 });
      }
      const eventKey = `jira:${issue.id}:${payload.timestamp}`;

      // Dedup + processing happen in a single mutation (atomic).
      // This avoids the race where concurrent deliveries both pass a
      // separate query check and then both insert + process.
      await ctx.runMutation(internal.integrations.jira.processJiraWebhook, {
        eventKey,
        eventType,
        issueKey: issue.key,
        issueSummary: issue.fields?.summary,
      });

      return new Response(null, { status: 200 });
    } catch (error) {
      console.error("Jira webhook error:", error);
      return new Response(null, { status: 200 }); // Always 200 to prevent retries
    }
  }),
});

export default http;
