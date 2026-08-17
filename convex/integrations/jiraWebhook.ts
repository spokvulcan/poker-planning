/**
 * The Jira adapter's inbound webhook boundary: shared-secret verification and
 * payload parsing for deliveries to /webhooks/jira (verifyAndParseJiraWebhook,
 * pure) plus the event application (applyJiraWebhookEvent, model-layer). The
 * generic integrations module owns only the dedup table — what a Jira event
 * *does* lives here, with the rest of the adapter.
 */

import { MutationCtx } from "../_generated/server";
import * as Integrations from "../model/integrations";
import * as Rooms from "../model/rooms";

export interface ParsedJiraWebhookEvent {
  eventKey: string;
  eventType: string;
  issueKey: string;
  issueSummary?: string;
}

export type JiraWebhookVerification =
  | { ok: true; event: ParsedJiraWebhookEvent }
  // Rejection/accept-without-processing Responses are built here so the route
  // handler has exactly one job left: run the processing mutation.
  | { ok: false; response: Response };

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

/**
 * Verifies the shared secret and parses a Jira webhook delivery into the
 * event the processing mutation consumes. Fail-closed: without a configured
 * secret no delivery is trusted. Deliveries that are valid but carry no
 * tracked issue (or no dedup timestamp) get a 200 so Jira does not retry.
 * `webhookSecret` is passed in (not read from env here) so tests drive every
 * branch directly.
 */
export async function verifyAndParseJiraWebhook(
  request: Request,
  webhookSecret: string | undefined
): Promise<JiraWebhookVerification> {
  // Shared-secret check. Jira Cloud webhooks cannot send custom headers,
  // so the registration embeds the secret in the webhook URL as a query
  // param (high-entropy, HTTPS-only); the header is accepted as well.
  if (!webhookSecret) {
    console.error(
      "Jira webhook rejected: JIRA_WEBHOOK_SECRET is not configured"
    );
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }
  const token =
    request.headers.get("x-hub-secret") ??
    new URL(request.url).searchParams.get("secret");
  if (!token || !(await timingSafeEqual(token, webhookSecret))) {
    console.warn("Jira webhook rejected: invalid secret");
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }

  const payload = await request.json();
  const eventType = payload.webhookEvent as string;
  const issue = payload.issue;

  if (!issue?.key) {
    return { ok: false, response: new Response(null, { status: 200 }) };
  }

  // Build a stable dedup key. Use Jira's own timestamp field which is
  // consistent across retries of the same delivery. Never fall back to
  // Date.now() — that would make retries non-deduplicable.
  if (!payload.timestamp) {
    console.warn("Jira webhook missing timestamp, skipping");
    return { ok: false, response: new Response(null, { status: 200 }) };
  }

  return {
    ok: true,
    event: {
      eventKey: `jira:${issue.id}:${payload.timestamp}`,
      eventType,
      issueKey: issue.key,
      issueSummary: issue.fields?.summary,
    },
  };
}

/**
 * Applies a verified Jira delivery. The generic module records the event key
 * (dedup), then the Jira semantics run here: `jira:issue_updated` syncs the
 * linked issue's title; `jira:issue_deleted` removes the link but keeps the
 * AgileKit issue.
 */
export async function applyJiraWebhookEvent(
  ctx: MutationCtx,
  event: ParsedJiraWebhookEvent
): Promise<void> {
  // Atomic dedup: check + insert in the same mutation (no race window)
  const isNew = await Integrations.recordWebhookEvent(ctx, {
    eventKey: event.eventKey,
    provider: "jira",
  });
  if (!isNew) return;

  // Find linked issue
  const link = await ctx.db
    .query("issueLinks")
    .withIndex("by_external", (q) =>
      q.eq("provider", "jira").eq("externalId", event.issueKey)
    )
    .first();

  if (!link) return; // Not a tracked issue

  if (event.eventType === "jira:issue_updated" && event.issueSummary) {
    // Update issue title
    const issue = await ctx.db.get(link.issueId);
    if (issue) {
      await ctx.db.patch(link.issueId, {
        title: `${event.issueKey} - ${event.issueSummary}`,
      });
      // The title change feeds the room's analytics history — bump activity
      // through the chokepoint so a fresh analytics snapshot can't serve the
      // stale title.
      await Rooms.updateRoomActivity(ctx, issue.roomId);
    }
    await ctx.db.patch(link._id, { lastSyncedAt: Date.now() });
  }

  if (event.eventType === "jira:issue_deleted") {
    // Remove the link (keep the AgileKit issue)
    await ctx.db.delete(link._id);
  }
}
