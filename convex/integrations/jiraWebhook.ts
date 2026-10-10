/**
 * The Jira adapter's inbound webhook boundary: the address a webhook is
 * registered at (jiraWebhookAddress), shared-secret verification and payload
 * parsing for deliveries to it (verifyAndParseJiraWebhook, pure) plus the
 * event application (applyJiraWebhookEvent, model-layer). The generic
 * integrations module owns only the dedup table — what a Jira event *means*
 * lives here, with the rest of the adapter, and the issue module applies it
 * to the issues holding the link.
 */

import { MutationCtx } from "../_generated/server";
import * as Integrations from "../model/integrations";
import * as Issues from "../model/issues";

export interface ParsedJiraWebhookEvent {
  eventKey: string;
  eventType: string;
  /** The Jira site the delivering webhook was registered on. */
  site: string;
  issueKey: string;
  issueSummary?: string;
}

/** An imported Jira issue's title: its key and its summary. */
export function jiraIssueTitle(key: string, summary: string): string {
  return `${key} - ${summary}`;
}

/**
 * An imported Jira issue's link: its key, and its page on the site it was
 * imported from. The page says which site the issue is on, so the same key
 * on two sites is two links.
 */
export function jiraIssueLink(site: string, key: string): Issues.IssueLink {
  return { provider: "jira", externalId: key, externalUrl: `${site}/browse/${key}` };
}

/**
 * The address a mapping's webhook is registered at, for the site of the
 * connection registering it. Jira Cloud webhooks cannot send custom headers,
 * so the shared secret travels in it, and so does the site: a delivery says
 * which site it comes from only by the address it was sent to.
 */
export function jiraWebhookAddress(
  deploymentUrl: string | undefined,
  args: { secret: string; site: string }
): string {
  const query = new URLSearchParams({ secret: args.secret, site: args.site });
  return `${deploymentUrl}/webhooks/jira?${query}`;
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
  const address = new URL(request.url).searchParams;
  const token = request.headers.get("x-hub-secret") ?? address.get("secret");
  if (!token || !(await timingSafeEqual(token, webhookSecret))) {
    console.warn("Jira webhook rejected: invalid secret");
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }

  // A webhook registered before its address named its site says nothing of
  // where the issue lives, and a change applied to the same key on another
  // site would rewrite another team's issue. The weekly renewal registers it
  // again at an address that names the site.
  const site = address.get("site");
  if (!site) {
    console.warn("Jira webhook skipped: its address names no site");
    return { ok: false, response: new Response(null, { status: 200 }) };
  }

  const payload = await request.json();
  const eventType = payload.webhookEvent as string;
  const issue = payload.issue;

  if (!issue?.key) {
    return { ok: false, response: new Response(null, { status: 200 }) };
  }

  // Build a stable dedup key. Use Jira's own timestamp field which is
  // consistent across retries of the same delivery. Never fall back to
  // Date.now() — that would make retries non-deduplicable. Issue ids are
  // numbered per site, so the key names the site too.
  if (!payload.timestamp) {
    console.warn("Jira webhook missing timestamp, skipping");
    return { ok: false, response: new Response(null, { status: 200 }) };
  }

  return {
    ok: true,
    event: {
      eventKey: `jira:${site}:${issue.id}:${payload.timestamp}`,
      eventType,
      site,
      issueKey: issue.key,
      issueSummary: issue.fields?.summary,
    },
  };
}

/**
 * Applies a verified Jira delivery. The generic module records the event key
 * (dedup), then the event becomes a tracker change the issue module follows
 * to that key's issue on the event's site, in every room:
 * `jira:issue_updated` retitles them; `jira:issue_deleted` unlinks them but
 * keeps the AgileKit issues. The same key on another site is another issue.
 *
 * The event key names no room. Each room mapped to the site's project has a
 * webhook delivering the same event, and the first delivery already reaches
 * every room, so the rest are duplicates.
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

  const link = jiraIssueLink(event.site, event.issueKey);
  if (event.eventType === "jira:issue_updated" && event.issueSummary) {
    await Issues.followTrackerChange(ctx, link, {
      kind: "retitled",
      title: jiraIssueTitle(event.issueKey, event.issueSummary),
    });
  }
  if (event.eventType === "jira:issue_deleted") {
    await Issues.followTrackerChange(ctx, link, { kind: "deleted" });
  }
}
