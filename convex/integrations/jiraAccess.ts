/**
 * Jira access: the one way the Jira adapter's registered actions act on
 * Jira. It acts as the person calling, through their own connection, or as
 * one connection (a mapping's, or the one that made a webhook). Either way it
 * finds the connection, insists on the site it acts on, gets a fresh token
 * through jiraAuth (the token vault decrypts it; Atlassian refreshes it when
 * it is stale) and hands back a client bound to that site, or why there is
 * none, in one vocabulary (JiraUnavailable).
 *
 * What a reason means is each caller's own policy: an action the browser
 * calls refuses with the reason's words, a webhook registration records a
 * failure on the mapping, an estimate's push records why it wasn't made, a
 * webhook's removal retries once when the token was refused, and a disconnect
 * carries on without the webhooks. Nothing
 * else builds a Jira client (convex/jiraActions.test.ts holds every module to
 * that). The OAuth handshake and the token-refresh sweep talk to Atlassian's
 * token endpoints, not to Jira as a connection, and stay in jiraAuth.ts.
 */

import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { requireUser } from "../model/caller";
import { refusal } from "../model/refusal";
import { buildJiraClient } from "./jiraAuth";
import type { JiraClient } from "./jiraClient";

/** Why Jira can't be acted on as a person or a connection. */
export type JiraUnavailable =
  /** No connection: the person never connected Jira, or it has been disconnected. */
  | "noConnection"
  /** The connection names no Jira site to act on. */
  | "noSite"
  /** The connection is on another Jira site than the one the call acts on. */
  | "otherSite"
  /** Its token is unusable: the vault couldn't read it, or Atlassian wouldn't refresh it. */
  | "tokenRefused";

/** Jira, as a person or a connection: a client bound to one site, or why there is none. */
export type JiraAccess =
  | {
      ok: true;
      client: JiraClient;
      /** The site the client acts on, as Atlassian names it: "https://team.atlassian.net". */
      site: string;
      connectionId: Id<"integrationConnections">;
    }
  | { ok: false; reason: JiraUnavailable };

/** Jira as the person calling: their own connection, on its own site. */
export async function jiraAsCaller(ctx: ActionCtx): Promise<JiraAccess> {
  const { user } = await requireUser(ctx);
  const connection: Doc<"integrationConnections"> | null = await ctx.runQuery(
    internal.integrations.jira.getConnectionForUser,
    { userId: user._id, provider: "jira" }
  );
  return await accessThrough(ctx, connection);
}

/**
 * Jira as one connection, on its own site; or, when `site` is given, only on
 * that one: a call about an issue on one site must never reach the same key on
 * another (the connection may have been reconnected to another site since).
 */
export async function jiraAsConnection(
  ctx: ActionCtx,
  connectionId: Id<"integrationConnections">,
  site?: string
): Promise<JiraAccess> {
  const connection: Doc<"integrationConnections"> | null = await ctx.runQuery(
    internal.integrations.jira.getConnectionById,
    { connectionId }
  );
  return await accessThrough(ctx, connection, site);
}

async function accessThrough(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections"> | null,
  site?: string
): Promise<JiraAccess> {
  if (!connection) return { ok: false, reason: "noConnection" };
  if (!connection.siteUrl || !connection.cloudId) return { ok: false, reason: "noSite" };
  if (site !== undefined && site !== connection.siteUrl) return { ok: false, reason: "otherSite" };
  try {
    const client = await buildJiraClient(ctx, connection);
    return { ok: true, client, site: connection.siteUrl, connectionId: connection._id };
  } catch (error) {
    // The vault couldn't read the token (or has no key), the deployment has
    // no Jira credentials to refresh it with, or Atlassian refused the
    // refresh: whichever, this connection can't act until it is reconnected.
    console.warn(`Jira connection ${connection._id} can't act: its token is unusable:`, error);
    return { ok: false, reason: "tokenRefused" };
  }
}

/** Each reason in the words of the person whose own connection it is. */
const TO_THE_PERSON: Record<JiraUnavailable, string> = {
  noConnection: "Connect Jira first, in Settings > Integrations.",
  noSite: "Your Jira connection has no site address; reconnect Jira.",
  otherSite: "Your Jira connection is to another Jira site; reconnect Jira.",
  tokenRefused: "Jira no longer accepts your connection; reconnect Jira.",
};

/** Why Jira can't be reached as the person calling, in their words. */
export function unavailableToThePerson(reason: JiraUnavailable): string {
  return TO_THE_PERSON[reason];
}

/**
 * Jira as the person calling, or a refusal in their words (ADR-0031): what
 * the browser's own Jira actions take. A refusal's message survives
 * production, where a plain Error's is redacted.
 */
export async function requireJiraAsCaller(
  ctx: ActionCtx
): Promise<{ client: JiraClient; site: string }> {
  const jira = await jiraAsCaller(ctx);
  if (!jira.ok) throw refusal("missing", unavailableToThePerson(jira.reason));
  return jira;
}
