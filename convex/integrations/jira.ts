/**
 * Jira integration - the Jira adapter's registered actions and internal
 * mutations for OAuth connect, issue import, estimate push-back, and webhook
 * registration.
 *
 * Fetch orchestration (OAuth token exchange/refresh, Jira REST calls through
 * JiraClient, webhook registration) lives in the adapter; the db-side
 * invariants (connection upsert, mapping writes, webhook event dedup/apply)
 * live in model/integrations.ts and the handlers below delegate to it. An
 * imported Jira issue enters a room through the issue module's admission
 * (model/issues.ts): the adapter only turns it into a title and a link. The
 * token-field contract (key validation, encrypt-on-write, decrypt-on-read,
 * expiry rule) lives in model/tokenVault.ts. The OAuth handshake, token
 * freshness/refresh and client construction live in jiraAuth.ts. What happens
 * to a mapping's webhook is decided in jiraWebhookReconcile.ts, which the
 * provider registry (integrations/registry.ts) points at; the webhook actions
 * below carry its decisions out against Jira.
 */

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { providerValidator } from "../schema";
import { Doc, Id } from "../_generated/dataModel";
import { ActionCtx } from "../_generated/server";
import { requireCanForUser } from "../model/auth";
import { requireCaller, requireUser } from "../model/caller";
import { JiraClient, JiraIssue } from "./jiraClient";
import {
  buildJiraAuthorizeUrl,
  buildJiraClient,
  connectJiraWithCode,
} from "./jiraAuth";
import {
  applyJiraWebhookEvent,
  jiraIssueLink,
  jiraIssueTitle,
  jiraWebhookAddress,
} from "./jiraWebhook";
import {
  jiraWebhookReconcile,
  recordRegistration,
  registrationValidator,
  wantedWebhookOf,
  type Registration,
  type WantedWebhook,
} from "./jiraWebhookReconcile";
import { cardNumericValue } from "../scales";
import * as Issues from "../model/issues";
import * as Integrations from "../model/integrations";
import type { Refusal } from "../model/refusal";

// ---------------------------------------------------------------------------
// Action preamble — the one chain from auth identity to a ready Jira client
// ---------------------------------------------------------------------------

async function getConnectionForUserId(
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<Doc<"integrationConnections">> {
  const connection: Doc<"integrationConnections"> | null = await ctx.runQuery(
    internal.integrations.jira.getConnectionForUser,
    { userId, provider: "jira" }
  );
  if (!connection) throw new Error("No Jira connection found. Please connect Jira first.");

  return connection;
}

/** Authenticated app user → their Jira connection. */
async function requireJiraConnection(
  ctx: ActionCtx
): Promise<{ user: Doc<"users">; connection: Doc<"integrationConnections"> }> {
  const { user } = await requireUser(ctx);
  const connection = await getConnectionForUserId(ctx, user._id);
  return { user, connection };
}

/**
 * The one action preamble: authenticated app user → their Jira connection →
 * a client on a valid token. Handlers that must run a permission check before
 * any network I/O take the two-step form (requireJiraConnection, check, then
 * buildJiraClient) instead.
 */
async function requireJiraClient(ctx: ActionCtx): Promise<{
  user: Doc<"users">;
  connection: Doc<"integrationConnections">;
  client: JiraClient;
}> {
  const { user, connection } = await requireJiraConnection(ctx);
  const client = await buildJiraClient(ctx, connection);
  return { user, connection, client };
}

// ---------------------------------------------------------------------------
// Internal mutations — DB operations
// ---------------------------------------------------------------------------

export const saveConnection = internalMutation({
  args: {
    userId: v.id("users"),
    provider: providerValidator,
    encryptedAccessToken: v.string(),
    accessTokenIv: v.string(),
    accessTokenAuthTag: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
    refreshTokenAuthTag: v.optional(v.string()),
    expiresAt: v.number(),
    cloudId: v.optional(v.string()),
    siteUrl: v.optional(v.string()),
    providerUserId: v.optional(v.string()),
    providerUserEmail: v.optional(v.string()),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await Integrations.saveConnection(ctx, args);
  },
});

export const updateTokens = internalMutation({
  args: {
    connectionId: v.id("integrationConnections"),
    encryptedAccessToken: v.string(),
    accessTokenIv: v.string(),
    accessTokenAuthTag: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
    refreshTokenAuthTag: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await Integrations.updateConnectionTokens(ctx, args);
  },
});

/** Hands one Jira issue, as a title and a link, to the issue module's admission. */
export const admitIssue = internalMutation({
  args: {
    roomId: v.id("rooms"),
    title: v.string(),
    link: v.object({
      provider: providerValidator,
      externalId: v.string(),
      externalUrl: v.string(),
    }),
  },
  handler: async (ctx, { roomId, ...issue }) => {
    const room = await ctx.db.get("rooms", roomId);
    if (!room) throw new Error("Room not found");
    return await Issues.admitIssue(ctx, { room, ...issue });
  },
});

/** registerWebhook's tail: hands the registration back to the reconcile. */
export const recordWebhookRegistration = internalMutation({
  args: {
    mappingId: v.id("integrationMappings"),
    registration: registrationValidator,
  },
  handler: async (ctx, args) => {
    await recordRegistration(ctx, args.mappingId, args.registration);
  },
});

/** Scheduled tail of the disconnect cascade — see model/integrations.ts. */
export const deleteConnection = internalMutation({
  args: { connectionId: v.id("integrationConnections") },
  handler: async (ctx, args) => {
    await Integrations.deleteConnection(ctx, args.connectionId);
  },
});

// ---------------------------------------------------------------------------
// Internal queries
// ---------------------------------------------------------------------------

export const getConnectionById = internalQuery({
  args: { connectionId: v.id("integrationConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get("integrationConnections", args.connectionId);
  },
});

export const getMappingById = internalQuery({
  args: { mappingId: v.id("integrationMappings") },
  handler: async (ctx, args) => {
    return await ctx.db.get("integrationMappings", args.mappingId);
  },
});

export const getConnectionForUser = internalQuery({
  args: { userId: v.id("users"), provider: providerValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("integrationConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .first();
  },
});

export const getIssueData = internalQuery({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get("issues", args.issueId);
    if (!issue) return null;

    const issueLink = await ctx.db
      .query("issueLinks")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .first();

    const mapping = await ctx.db
      .query("integrationMappings")
      .withIndex("by_room", (q) => q.eq("roomId", issue.roomId))
      .first();

    return { issue, issueLink, mapping };
  },
});

// ---------------------------------------------------------------------------
// Public actions — called from frontend
// ---------------------------------------------------------------------------

/**
 * Called from the Next.js authorize route via fetchAuthQuery: the Atlassian
 * consent URL for the state the route keeps in a cookie. Convex builds it
 * because the Jira OAuth app's settings live here and nowhere else.
 */
export const getJiraAuthorizeUrl = query({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    await requireCaller(ctx);
    return buildJiraAuthorizeUrl(state);
  },
});

/**
 * Called from the Next.js OAuth callback via fetchAuthAction with the
 * authorization code Atlassian handed back; Convex exchanges it and stores
 * the connection (jiraAuth.ts), so no token ever crosses a public argument.
 */
export const connectJira = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { user } = await requireUser(ctx);
    await connectJiraWithCode(ctx, user._id, code);
  },
});

export const getJiraProjects = action({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireJiraClient(ctx);
    return await client.getProjects();
  },
});

export const getJiraBoards = action({
  args: { projectKey: v.string() },
  handler: async (ctx, { projectKey }) => {
    const { client } = await requireJiraClient(ctx);
    return await client.getBoards(projectKey);
  },
});

export const getJiraSprints = action({
  args: { boardId: v.number() },
  handler: async (ctx, { boardId }) => {
    const { client } = await requireJiraClient(ctx);
    return await client.getSprints(boardId);
  },
});

export const getJiraIssues = action({
  args: {
    projectKey: v.string(),
    sprintId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { client } = await requireJiraClient(ctx);

    if (args.sprintId) {
      return await client.getSprintIssues(args.sprintId);
    }
    return await client.getBacklogIssues(args.projectKey);
  },
});

export const importIssues = action({
  args: {
    roomId: v.id("rooms"),
    jiraIssueKeys: v.array(v.string()),
  },
  handler: async (ctx, { roomId, jiraIssueKeys }): Promise<JiraImportResult> => {
    const { user, connection } = await requireJiraConnection(ctx);

    // Verify the caller is a member of the room with issue management
    // permission — before any Jira network I/O (a token refresh included).
    await ctx.runQuery(internal.integrations.jira.verifyCanManageIssues, {
      userId: user._id,
      roomId,
    });

    const client = await buildJiraClient(ctx, connection);
    return await importIssuesWithClient(
      client,
      (candidate): Promise<Issues.Admission> =>
        ctx.runMutation(internal.integrations.jira.admitIssue, { roomId, ...candidate }),
      { keys: jiraIssueKeys, siteUrl: connection.siteUrl }
    );
  },
});

/** What an import did with the selected keys. */
export interface JiraImportResult {
  imported: number;
  /** Keys whose issue is already in the room. */
  skipped: number;
  /** Keys not imported, each with why, in words the import modal shows. */
  refused: { key: string; reason: string }[];
}

/**
 * The words a refused admission carries. A coded refusal keeps its message
 * across the mutation boundary in production; any other error has only its
 * own message to give.
 */
function refusalReason(error: unknown): string {
  if (error instanceof ConvexError) {
    const message = (error.data as Partial<Refusal> | undefined)?.message;
    if (typeof message === "string" && message) return message;
  }
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * The import itself, decoupled from ctx plumbing: each key is read from Jira,
 * so the title and URL come from Jira rather than the client, and handed to
 * the issue module's admission as a title and a link. A key that can't be
 * linked, read or admitted is refused with why; the others still import.
 */
export async function importIssuesWithClient(
  client: Pick<JiraClient, "getIssue">,
  admit: (candidate: { title: string; link: Issues.IssueLink }) => Promise<Issues.Admission>,
  args: { keys: string[]; siteUrl: string | undefined }
): Promise<JiraImportResult> {
  const { siteUrl } = args;
  // Every link is a page on the connection's site: without one, none can be.
  if (!siteUrl) {
    const reason = "Your Jira connection has no site address; reconnect Jira";
    return { imported: 0, skipped: 0, refused: args.keys.map((key) => ({ key, reason })) };
  }

  const result: JiraImportResult = { imported: 0, skipped: 0, refused: [] };
  for (const key of args.keys) {
    let issue: JiraIssue;
    try {
      issue = await client.getIssue(key);
    } catch (error) {
      console.warn(`Jira import: could not read ${key}:`, error);
      result.refused.push({
        key,
        reason: "Couldn't be read from Jira (deleted, or not visible to you)",
      });
      continue;
    }

    try {
      const admission = await admit({
        title: jiraIssueTitle(issue.key, issue.fields.summary),
        link: jiraIssueLink(siteUrl, issue.key),
      });
      if (admission.kind === "admitted") result.imported++;
      else result.skipped++;
    } catch (error) {
      result.refused.push({ key, reason: refusalReason(error) });
    }
  }
  return result;
}

/**
 * The estimate push itself, decoupled from ctx plumbing: an already-built
 * client (tests inject a fake) pushes the settled estimate and its comment.
 * Every skip condition returns false with a log line rather than throwing —
 * the push is a reveal side effect and must never fail the round.
 */
export async function pushEstimateWithClient(
  client: Pick<JiraClient, "updateStoryPoints" | "addComment">,
  push: {
    externalId: string;
    storyPointsFieldId?: string;
    finalEstimate: string;
  }
): Promise<boolean> {
  if (!push.storyPointsFieldId) {
    console.log("No story points field configured for mapping, skipping push");
    return false;
  }

  // Convert via the one card→numeric conversion — skip non-numeric estimates
  // (e.g., "XL", "?")
  const numericEstimate = cardNumericValue(push.finalEstimate);
  if (numericEstimate === undefined) {
    console.log(`Non-numeric estimate "${push.finalEstimate}", skipping Jira push`);
    return false;
  }

  try {
    await client.updateStoryPoints(
      push.externalId,
      push.storyPointsFieldId,
      numericEstimate
    );

    await client.addComment(
      push.externalId,
      `Estimated at ${push.finalEstimate} point${numericEstimate !== 1 ? "s" : ""} via AgileKit`
    );

    console.log(`Pushed estimate ${push.finalEstimate} to Jira ${push.externalId}`);
    return true;
  } catch (error) {
    console.error(`Failed to push estimate to Jira ${push.externalId}:`, error);
    return false;
  }
}

export const pushEstimateToJira = internalAction({
  args: {
    issueId: v.id("issues"),
    finalEstimate: v.string(),
  },
  handler: async (ctx, { issueId, finalEstimate }) => {
    const data = await ctx.runQuery(
      internal.integrations.jira.getIssueData,
      { issueId }
    );

    if (!data?.issueLink || !data?.mapping) {
      console.log(`No Jira link or mapping for issue ${issueId}, skipping push`);
      return;
    }

    const { issueLink, mapping } = data;

    const connection = await ctx.runQuery(
      internal.integrations.jira.getConnectionById,
      { connectionId: mapping.connectionId }
    );

    if (!connection) {
      console.error(`Connection ${mapping.connectionId} not found`);
      return;
    }

    const client = await buildJiraClient(ctx, connection);
    await pushEstimateWithClient(client, {
      externalId: issueLink.externalId,
      storyPointsFieldId: mapping.storyPointsFieldId,
      finalEstimate,
    });
  },
});

export const detectStoryPointsField = action({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireJiraClient(ctx);
    return await client.findStoryPointsField();
  },
});

// ---------------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------------

export const processJiraWebhook = internalMutation({
  args: {
    eventKey: v.string(),
    eventType: v.string(),
    site: v.string(),
    issueKey: v.string(),
    issueSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await applyJiraWebhookEvent(ctx, args);
  },
});

export const cleanupOldWebhookEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    await Integrations.cleanupOldWebhookEvents(ctx);
  },
});

/**
 * Best-effort remote deletion of one Jira webhook, with the connection that
 * made it. A failure is retried once after a delay (the connection row still
 * exists at that point, so the retry can authenticate); a webhook that
 * survives the retry, or whose connection is already gone, is left to its
 * 30-day expiry — logged here so the leak is tracked rather than silent.
 */
async function deleteWebhook(
  ctx: ActionCtx,
  webhook: { connectionId: Id<"integrationConnections">; webhookId: string },
  attemptsLeft: number
): Promise<void> {
  const connection = await ctx.runQuery(
    internal.integrations.jira.getConnectionById,
    { connectionId: webhook.connectionId }
  );
  if (!connection) {
    console.warn(
      `Jira connection ${webhook.connectionId} already removed; webhook ${webhook.webhookId} left to expire remotely`
    );
    return;
  }

  try {
    const client = await buildJiraClient(ctx, connection);
    await client.deleteWebhooks([webhook.webhookId]);
    console.log(`Deregistered Jira webhook ${webhook.webhookId}`);
  } catch (error) {
    if (attemptsLeft > 0) {
      console.warn(
        `Failed to deregister Jira webhook ${webhook.webhookId}; retrying in 5 minutes:`,
        error
      );
      await ctx.scheduler.runAfter(
        5 * 60 * 1000,
        internal.integrations.jira.deregisterWebhook,
        {
          connectionId: webhook.connectionId,
          webhookId: webhook.webhookId,
          attemptsLeft: attemptsLeft - 1,
        }
      );
      return;
    }
    console.warn(
      `Failed to deregister Jira webhook ${webhook.webhookId} (no retries left); left to expire remotely:`,
      error
    );
  }
}

/**
 * Deletes a webhook the reconcile (jiraWebhookReconcile.ts) let go of: a
 * mapping that no longer wants it, or one whose row is gone.
 */
export const deregisterWebhook = internalAction({
  args: {
    connectionId: v.id("integrationConnections"),
    webhookId: v.string(),
    attemptsLeft: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await deleteWebhook(ctx, args, args.attemptsLeft ?? 1);
  },
});

/**
 * The disconnect tail: deregisters every live webhook of a torn-down
 * connection, then deletes the connection row. Scheduling deregistrations and
 * the row deletion as independent same-tick jobs would race (the deletion
 * could win, leaving the deregistrations unable to authenticate), so the
 * ordering is enforced here by the action's own awaits. Deregistration is
 * best-effort: a webhook that cannot be deleted remotely is logged and left
 * to its 30-day expiry rather than blocking the disconnect.
 */
export const finalizeDisconnect = internalAction({
  args: {
    connectionId: v.id("integrationConnections"),
    webhookIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.runQuery(
      internal.integrations.jira.getConnectionById,
      { connectionId: args.connectionId }
    );

    if (!connection) {
      console.warn(
        `Jira connection ${args.connectionId} already removed; ${args.webhookIds.length} webhook(s) left to expire remotely`
      );
    } else {
      let client: JiraClient | null = null;
      try {
        client = await buildJiraClient(ctx, connection);
      } catch (error) {
        console.warn(
          `Could not build a Jira client for connection ${args.connectionId}; ${args.webhookIds.length} webhook(s) left to expire remotely:`,
          error
        );
      }
      if (client) {
        for (const webhookId of args.webhookIds) {
          try {
            await client.deleteWebhooks([webhookId]);
            console.log(`Deregistered Jira webhook ${webhookId}`);
          } catch (error) {
            console.warn(
              `Failed to deregister Jira webhook ${webhookId} during disconnect; left to expire remotely:`,
              error
            );
          }
        }
      }
    }

    // The row goes only now — after every deregistration has had its turn.
    await ctx.runMutation(internal.integrations.jira.deleteConnection, {
      connectionId: args.connectionId,
    });
  },
});

// ---------------------------------------------------------------------------
// Webhook registration
// ---------------------------------------------------------------------------

/**
 * Registers the webhook a mapping wants, after deleting the one it replaces
 * (with the connection that made that one), and hands the outcome back to
 * the reconcile, which records it or, when the mapping moved on meanwhile,
 * lets it go. A failure is recorded on the mapping, where the room's settings
 * show it, rather than thrown.
 */
export const registerWebhook = internalAction({
  args: {
    mappingId: v.id("integrationMappings"),
    replacing: v.optional(
      v.object({
        connectionId: v.id("integrationConnections"),
        webhookId: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.replacing) await deleteWebhook(ctx, args.replacing, 1);

    const mapping = await ctx.runQuery(
      internal.integrations.jira.getMappingById,
      { mappingId: args.mappingId }
    );
    const wanted = mapping ? wantedWebhookOf(mapping) : null;
    // The mapping moved on before this ran; whatever moved it reconciled it.
    if (!wanted) return;

    const registration = await attemptRegistration(ctx, wanted);
    await ctx.runMutation(internal.integrations.jira.recordWebhookRegistration, {
      mappingId: args.mappingId,
      registration,
    });
  },
});

async function attemptRegistration(
  ctx: ActionCtx,
  wanted: WantedWebhook
): Promise<Registration> {
  // Jira Cloud webhooks cannot send custom headers, so the shared secret
  // travels in the registered address. The endpoint rejects deliveries
  // without it, so registration must not proceed when the secret is missing.
  const webhookSecret = process.env.JIRA_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("JIRA_WEBHOOK_SECRET must be configured to register a Jira webhook");
    return { kind: "failed", failure: "missingSecret", ...wanted };
  }

  try {
    const connection = await ctx.runQuery(
      internal.integrations.jira.getConnectionById,
      { connectionId: wanted.connectionId }
    );
    if (!connection) throw new Error("Connection not found");
    // The address names the site the webhook watches; without it, no
    // delivery could say which site's issues it is about.
    if (!connection.siteUrl) throw new Error("Connection has no site address");

    const webhookUrl = jiraWebhookAddress(process.env.CONVEX_SITE_URL, {
      secret: webhookSecret,
      site: connection.siteUrl,
    });
    const client = await buildJiraClient(ctx, connection);
    const webhookId = await client.registerWebhook(`project = ${wanted.projectKey}`, webhookUrl);
    if (!webhookId) throw new Error("Jira registered no webhook");
    console.log(`Registered Jira webhook ${webhookId}`);
    return { kind: "registered", webhookId, ...wanted };
  } catch (error) {
    console.error("Failed to register Jira webhook:", error);
    return { kind: "failed", failure: "jiraError", ...wanted };
  }
}

/** Jira mappings one step of the weekly renewal hands to the reconcile. */
const WEBHOOK_RENEWAL_BATCH = 100;

/**
 * The weekly renewal (cron refresh-jira-webhooks). Jira drops a webhook 30
 * days after it is registered, so every Jira mapping goes to the reconcile as
 * renewed: a wanted webhook is registered afresh (replacing the one on
 * record, or retrying a failed registration) and a recorded one nobody wants
 * is removed. Pages through the mappings, rescheduling itself until done.
 */
export const refreshJiraWebhooks = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? WEBHOOK_RENEWAL_BATCH;
    const { page, isDone, continueCursor } = await ctx.db
      .query("integrationMappings")
      .withIndex("by_provider_autopush", (q) => q.eq("provider", "jira"))
      .paginate({ numItems: batchSize, cursor: args.cursor ?? null });

    for (const mapping of page) {
      await jiraWebhookReconcile.reconcile(ctx, { kind: "renewed", mapping });
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.integrations.jira.refreshJiraWebhooks, {
        cursor: continueCursor,
        batchSize,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies that the user may manage issues in the room. The calling action
 * resolves the user from its own auth identity (actions have no db access)
 * and passes it through; this internal query routes the check through the
 * permission guard's explicit-user entry point, so the decision and the
 * thrown messages are the guard's own.
 */
export const verifyCanManageIssues = internalQuery({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");

    await requireCanForUser(ctx, user, args.roomId, {
      kind: "category",
      category: "issueManagement",
    });

    return { userId: user._id };
  },
});
