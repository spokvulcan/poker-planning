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
 * freshness/refresh and client construction live in jiraAuth.ts. Every action
 * below acts on Jira through jiraAccess.ts, as the person calling or as one
 * connection, and turns why it can't into its own policy. What happens to a
 * mapping's webhook is decided in jiraWebhookReconcile.ts, and whether and
 * where a settled estimate goes in the estimate push (model/estimatePush.ts,
 * with jiraEstimatePush.ts), both of which the provider registry
 * (integrations/registry.ts) points at; the actions below carry their
 * decisions out against Jira and report back.
 */

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { lastPushValidator, providerValidator } from "../schema";
import { Id } from "../_generated/dataModel";
import { ActionCtx } from "../_generated/server";
import { requireRoomWrite } from "../model/auth";
import { requireCaller, requireUser } from "../model/caller";
import { JiraClient, JiraIssue } from "./jiraClient";
import { buildJiraAuthorizeUrl, connectJiraWithCode } from "./jiraAuth";
import {
  jiraAsCaller,
  jiraAsConnection,
  requireJiraAsCaller,
  unavailableToThePerson,
} from "./jiraAccess";
import { applyJiraWebhookEvent, jiraWebhookAddress } from "./jiraWebhook";
import { jiraIssueLink, jiraIssueTitle } from "./jiraIssueLink";
import {
  recordRegistration,
  registrationValidator,
  renewWebhook,
  wantedWebhookOf,
  type Registration,
  type WantedWebhook,
} from "./jiraWebhookReconcile";
import * as Issues from "../model/issues";
import * as Integrations from "../model/integrations";
import * as EstimatePush from "../model/estimatePush";
import { refusalOf } from "../model/refusal";

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

/** What importing issues into a room asks of the permission guard. */
const ISSUE_MANAGEMENT = { kind: "category", category: "issueManagement" } as const;

/**
 * The import's room-scoped step, taken before Jira is called (a token refresh
 * included): the caller, whom the import action runs as, is in the room and
 * may manage its issues. It writes nothing; it is a mutation because the
 * step is a write's.
 */
export const verifyCanManageIssues = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    await requireRoomWrite(ctx, roomId, ISSUE_MANAGEMENT);
  },
});

/**
 * Hands one Jira issue, as a title and a link, to the issue module's
 * admission, on the room-scoped step like any issue typed in the room: the
 * import action runs this as its caller, so each issue is admitted only while
 * they may still manage the room's issues.
 */
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
    const { room } = await requireRoomWrite(ctx, roomId, ISSUE_MANAGEMENT);
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

/**
 * pushEstimate's tail: hands how the push went, and the connection and field
 * it was made with, back to the estimate push, which records it.
 */
export const recordEstimatePush = internalMutation({
  args: {
    mappingId: v.id("integrationMappings"),
    lastPush: lastPushValidator,
    madeWith: v.object({ connectionId: v.id("integrationConnections"), fieldId: v.string() }),
  },
  handler: async (ctx, args) => {
    await EstimatePush.recordPush(ctx, args.mappingId, args.lastPush, args.madeWith);
  },
});

/**
 * An estimate a reveal handed to Jira before the estimate push decided
 * pushes, by issue and estimate (pushEstimateToJira): decided now, as a
 * reveal decides it. The issue's room may be gone by then.
 */
export const decideScheduledPush = internalMutation({
  args: { issueId: v.id("issues"), finalEstimate: v.string() },
  handler: async (ctx, { issueId, finalEstimate }) => {
    const issue = await ctx.db.get("issues", issueId);
    const room = issue && (await ctx.db.get("rooms", issue.roomId));
    if (!room) return;
    await EstimatePush.estimateSettled(ctx, { room, issueId, estimate: finalEstimate });
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

// The browser's own Jira reads act as the person calling; when Jira can't be
// reached as them, they are refused in their words.

export const getJiraProjects = action({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireJiraAsCaller(ctx);
    return await client.getProjects();
  },
});

export const getJiraBoards = action({
  args: { projectKey: v.string() },
  handler: async (ctx, { projectKey }) => {
    const { client } = await requireJiraAsCaller(ctx);
    return await client.getBoards(projectKey);
  },
});

export const getJiraSprints = action({
  args: { boardId: v.number() },
  handler: async (ctx, { boardId }) => {
    const { client } = await requireJiraAsCaller(ctx);
    return await client.getSprints(boardId);
  },
});

export const getJiraIssues = action({
  args: {
    projectKey: v.string(),
    sprintId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { client } = await requireJiraAsCaller(ctx);

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
    // An import is a room write: it takes the room-scoped step before any
    // Jira network I/O (a token refresh included), and again for each issue.
    // The mutations an action runs run as its caller, so the step seats them.
    await ctx.runMutation(internal.integrations.jira.verifyCanManageIssues, { roomId });

    // Jira as the importer, on their connection's site, which every link
    // names. When it can't be reached, every key is refused saying why.
    const jira = await jiraAsCaller(ctx);
    if (!jira.ok) {
      const reason = unavailableToThePerson(jira.reason);
      return { imported: 0, skipped: 0, refused: jiraIssueKeys.map((key) => ({ key, reason })) };
    }
    return await importIssuesWithClient(
      jira.client,
      (candidate): Promise<Issues.Admission> =>
        ctx.runMutation(internal.integrations.jira.admitIssue, { roomId, ...candidate }),
      { keys: jiraIssueKeys, site: jira.site }
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
  return refusalOf(error)?.message ?? (error instanceof Error ? error.message : "Unknown error");
}

/**
 * The import itself, decoupled from ctx plumbing: each key is read from Jira,
 * so the title and URL come from Jira rather than the client, and handed to
 * the issue module's admission as a title and a link, a page on the site the
 * client acts on. A key that can't be read or admitted is refused with why;
 * the others still import.
 */
export async function importIssuesWithClient(
  client: Pick<JiraClient, "getIssue">,
  admit: (candidate: { title: string; link: Issues.IssueLink }) => Promise<Issues.Admission>,
  args: { keys: string[]; site: string }
): Promise<JiraImportResult> {
  const { site } = args;
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
        link: jiraIssueLink(site, issue.key),
      });
      if (admission.kind === "admitted") result.imported++;
      else result.skipped++;
    } catch (error) {
      result.refused.push({ key, reason: refusalReason(error) });
    }
  }
  return result;
}

/** A tracker's own words for a refusal, as long as a settings line can carry. */
const REFUSAL_WORDS = 300;

/**
 * A settled estimate's push, as the estimate push decided it
 * (model/estimatePush.ts): the story points written to the issue and a
 * comment saying so, as the mapping's connection and only on the site the
 * issue is on (the connection may have moved to another since). Then how it
 * went goes back to the mapping. It never throws: a push is a reveal's side
 * effect, and whatever goes wrong is recorded instead, where the room's
 * settings show it.
 */
export const pushEstimate = internalAction({
  args: { push: EstimatePush.estimatePushValidator },
  handler: async (ctx, { push }) => {
    const outcome = await pushToJira(ctx, push);
    await ctx.runMutation(internal.integrations.jira.recordEstimatePush, {
      mappingId: push.mappingId,
      lastPush: { at: push.settledAt, issueKey: push.issueKey, estimate: push.estimate.label, ...outcome },
      madeWith: { connectionId: push.connectionId, fieldId: push.fieldId },
    });
  },
});

async function pushToJira(
  ctx: ActionCtx,
  push: EstimatePush.EstimatePush
): Promise<Pick<EstimatePush.LastPush, "outcome" | "message">> {
  const jira = await jiraAsConnection(ctx, push.connectionId, push.site);
  if (!jira.ok) {
    console.warn(`Can't push estimate to Jira ${push.issueKey} as connection ${push.connectionId}: ${jira.reason}`);
    return { outcome: jira.reason === "otherSite" ? "otherSite" : "connectionUnusable" };
  }

  const { label, value } = push.estimate;
  try {
    await jira.client.updateStoryPoints(push.issueKey, push.fieldId, value);
  } catch (error) {
    console.error(`Jira refused the estimate for ${push.issueKey}:`, error);
    const words = error instanceof Error ? error.message : String(error);
    return { outcome: "refused", message: words.slice(0, REFUSAL_WORDS) };
  }
  console.log(`Pushed estimate ${label} to Jira ${push.issueKey}`);
  // The estimate is in Jira: the comment saying so is a courtesy, which a
  // project may not allow (adding comments is a permission of its own), so
  // its failure is only logged.
  try {
    await jira.client.addComment(push.issueKey, `Estimated at ${label} point${value !== 1 ? "s" : ""} via AgileKit`);
  } catch (error) {
    console.warn(`Jira took the estimate for ${push.issueKey} but not the comment saying so:`, error);
  }
  return { outcome: "pushed" };
}

/**
 * The push as reveals scheduled it before the estimate push decided pushes,
 * by issue and estimate: a job queued just before a deploy still finds its
 * function, and the estimate is decided now (decideScheduledPush).
 */
export const pushEstimateToJira = internalAction({
  args: {
    issueId: v.id("issues"),
    finalEstimate: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.integrations.jira.decideScheduledPush, args);
  },
});

export const detectStoryPointsField = action({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireJiraAsCaller(ctx);
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
 * Best-effort remote deletion of one Jira webhook, as the connection that
 * made it. A failure, the connection's token refused among them, is retried
 * once after a delay (the connection row still exists at that point, so the
 * retry can authenticate); a webhook that survives the retry, or whose
 * connection is gone or names no site, is left to its 30-day expiry, which
 * no retry could change. Logged here, so the leak is tracked rather than
 * silent.
 */
async function deleteWebhook(
  ctx: ActionCtx,
  webhook: { connectionId: Id<"integrationConnections">; webhookId: string },
  attemptsLeft: number
): Promise<void> {
  const jira = await jiraAsConnection(ctx, webhook.connectionId);
  if (!jira.ok && jira.reason !== "tokenRefused") {
    console.warn(
      `Jira connection ${webhook.connectionId} can't act (${jira.reason}); webhook ${webhook.webhookId} left to expire remotely`
    );
    return;
  }

  let failure: unknown = "the connection's token was refused";
  if (jira.ok) {
    try {
      await jira.client.deleteWebhooks([webhook.webhookId]);
      console.log(`Deregistered Jira webhook ${webhook.webhookId}`);
      return;
    } catch (error) {
      failure = error;
    }
  }
  if (attemptsLeft > 0) {
    console.warn(`Failed to deregister Jira webhook ${webhook.webhookId}; retrying in 5 minutes:`, failure);
    await ctx.scheduler.runAfter(5 * 60 * 1000, internal.integrations.jira.deregisterWebhook, {
      connectionId: webhook.connectionId,
      webhookId: webhook.webhookId,
      attemptsLeft: attemptsLeft - 1,
    });
    return;
  }
  console.warn(
    `Failed to deregister Jira webhook ${webhook.webhookId} (no retries left); left to expire remotely:`,
    failure
  );
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
    // As the connection that is going, while its row still holds the token;
    // whatever keeps it from acting, the disconnect carries on without them.
    const jira = await jiraAsConnection(ctx, args.connectionId);
    if (!jira.ok) {
      console.warn(
        `Jira connection ${args.connectionId} can't act (${jira.reason}); ${args.webhookIds.length} webhook(s) left to expire remotely`
      );
    } else {
      for (const webhookId of args.webhookIds) {
        try {
          await jira.client.deleteWebhooks([webhookId]);
          console.log(`Deregistered Jira webhook ${webhookId}`);
        } catch (error) {
          console.warn(
            `Failed to deregister Jira webhook ${webhookId} during disconnect; left to expire remotely:`,
            error
          );
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

  // As the mapping's own connection, on its site: the address names that
  // site, since a delivery says which site's issues it is about only by the
  // address it was sent to. A connection that can't act is a failed
  // registration, like Jira refusing it.
  const jira = await jiraAsConnection(ctx, wanted.connectionId);
  if (!jira.ok) {
    console.error(`Can't register a Jira webhook as connection ${wanted.connectionId}: ${jira.reason}`);
    return { kind: "failed", failure: "jiraError", ...wanted };
  }

  try {
    const webhookUrl = jiraWebhookAddress(process.env.CONVEX_SITE_URL, {
      secret: webhookSecret,
      site: jira.site,
    });
    const webhookId = await jira.client.registerWebhook(`project = ${wanted.projectKey}`, webhookUrl);
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
 * days after it is registered, so every Jira mapping goes to the reconcile's
 * renewal (renewWebhook): a wanted webhook is registered afresh (replacing
 * the one on record, or retrying a failed registration) and a recorded one
 * nobody wants is removed. Pages through the mappings, rescheduling itself
 * until done.
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
      await renewWebhook(ctx, mapping);
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.integrations.jira.refreshJiraWebhooks, {
        cursor: continueCursor,
        batchSize,
      });
    }
  },
});
