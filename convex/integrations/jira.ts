/**
 * Jira integration - the Jira adapter's registered actions and internal
 * mutations for OAuth connect, issue import, estimate push-back, and webhook
 * registration.
 *
 * Fetch orchestration (OAuth token exchange/refresh, Jira REST calls through
 * JiraClient, webhook registration) lives in the adapter; the db-side
 * invariants (connection upsert, mapping writes, webhook event dedup/apply)
 * live in model/integrations.ts and the handlers below delegate to it. The
 * token-field contract (key validation, encrypt-on-write, decrypt-on-read,
 * expiry rule) lives in model/tokenVault.ts. Token freshness/refresh and
 * client construction live in jiraAuth.ts; the provider registry
 * (integrations/registry.ts) points at this adapter's actions.
 */

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { ActionCtx } from "../_generated/server";
import { requireAuth, requireCanForUser } from "../model/auth";
import { JiraClient } from "./jiraClient";
import { buildJiraClient } from "./jiraAuth";
import { createIssueInRoom } from "../model/issues";
import * as Integrations from "../model/integrations";
import * as TokenVault from "../model/tokenVault";
import { MAX_ISSUES_PER_ROOM } from "../constants";

// ---------------------------------------------------------------------------
// Action preamble — the one chain from auth identity to a ready Jira client
// ---------------------------------------------------------------------------

/**
 * ActionCtx-compatible identity→user resolution: actions have no db access,
 * so the lookup goes through the internal query. Throws the same messages as
 * requireAuthUser ("Not authenticated" / "User not found").
 */
async function requireActionUser(ctx: ActionCtx): Promise<Doc<"users">> {
  const identity = await requireAuth(ctx);
  const user: Doc<"users"> | null = await ctx.runQuery(
    internal.integrations.jira.getUserByAuthId,
    { authUserId: identity.subject }
  );
  if (!user) throw new Error("User not found");
  return user;
}

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
  const user = await requireActionUser(ctx);
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
    provider: v.union(v.literal("jira"), v.literal("github")),
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

export const createIssueWithLink = internalMutation({
  args: {
    roomId: v.id("rooms"),
    title: v.string(),
    provider: v.union(v.literal("jira"), v.literal("github")),
    externalId: v.string(),
    externalUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // externalUrl is rendered as an anchor href in the room UI — only allow
    // real web URLs so a malicious integration connection can't inject a
    // javascript: link.
    if (!args.externalUrl.startsWith("https://")) {
      throw new Error("externalUrl must be an https:// URL");
    }

    // Dedup per-room: same Jira issue can exist in multiple rooms,
    // but not twice in the same room.
    const roomIssues = await ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Cap check stays ahead of dedup so a full room errors even when this key
    // was already imported; createIssueInRoom re-enforces it on creation.
    if (roomIssues.length >= MAX_ISSUES_PER_ROOM) {
      throw new Error(`Rooms are limited to ${MAX_ISSUES_PER_ROOM} issues`);
    }

    for (const issue of roomIssues) {
      const link = await ctx.db
        .query("issueLinks")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .first();
      if (
        link &&
        link.provider === args.provider &&
        link.externalId === args.externalId
      ) {
        return null; // Already imported in this room
      }
    }

    const issueId = await createIssueInRoom(ctx, {
      roomId: args.roomId,
      title: args.title,
    });

    // Create bidirectional link (roomId-tagged so room-wide link fetches can
    // use the by_room index instead of one by_issue query per issue)
    await ctx.db.insert("issueLinks", {
      issueId,
      roomId: args.roomId,
      provider: args.provider,
      externalId: args.externalId,
      externalUrl: args.externalUrl,
      lastSyncedAt: Date.now(),
    });

    return issueId;
  },
});

export const setMappingWebhook = internalMutation({
  args: {
    mappingId: v.id("integrationMappings"),
    webhookId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await Integrations.setMappingWebhook(ctx, args.mappingId, args.webhookId);
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
    return await ctx.db.get(args.connectionId);
  },
});

export const getMappingById = internalQuery({
  args: { mappingId: v.id("integrationMappings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.mappingId);
  },
});

export const getConnectionForUser = internalQuery({
  args: { userId: v.id("users"), provider: v.union(v.literal("jira"), v.literal("github")) },
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
    const issue = await ctx.db.get(args.issueId);
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
// Internal actions — OAuth + external API calls
// ---------------------------------------------------------------------------

export const storeConnection = internalAction({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresIn: v.number(),
    cloudId: v.string(),
    siteUrl: v.string(),
    scopes: v.array(v.string()),
    providerUserId: v.optional(v.string()),
    providerUserEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const enc = await TokenVault.encryptTokens({
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
    });

    await ctx.runMutation(internal.integrations.jira.saveConnection, {
      userId: args.userId,
      provider: "jira",
      ...enc,
      expiresAt: TokenVault.computeExpiresAt(args.expiresIn),
      cloudId: args.cloudId,
      siteUrl: args.siteUrl,
      providerUserId: args.providerUserId,
      providerUserEmail: args.providerUserEmail,
      scopes: args.scopes,
    });
  },
});

// ---------------------------------------------------------------------------
// Public actions — called from frontend
// ---------------------------------------------------------------------------

/** Called from Next.js OAuth callback via fetchAuthAction */
export const connectJira = action({
  args: {
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresIn: v.number(),
    cloudId: v.string(),
    siteUrl: v.string(),
    scopes: v.array(v.string()),
    providerUserId: v.optional(v.string()),
    providerUserEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireActionUser(ctx);

    // The siteUrl is stored and later concatenated into issue browse links
    // rendered as anchor hrefs. This action is public, so a client could
    // bypass the OAuth callback and store a javascript: URL — validate it.
    let parsedSiteUrl: URL;
    try {
      parsedSiteUrl = new URL(args.siteUrl);
    } catch {
      throw new Error("Invalid Jira site URL");
    }
    if (
      parsedSiteUrl.protocol !== "https:" ||
      !parsedSiteUrl.hostname.endsWith(".atlassian.net")
    ) {
      throw new Error("Jira site URL must be an https://*.atlassian.net URL");
    }

    // Delegate to internal action that handles encryption + storage
    await ctx.runAction(internal.integrations.jira.storeConnection, {
      userId: user._id,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresIn: args.expiresIn,
      cloudId: args.cloudId,
      siteUrl: args.siteUrl,
      scopes: args.scopes,
      providerUserId: args.providerUserId,
      providerUserEmail: args.providerUserEmail,
    });
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
  handler: async (ctx, { roomId, jiraIssueKeys }) => {
    const { user, connection } = await requireJiraConnection(ctx);

    // Verify the caller is a member of the room with issue management
    // permission — before any Jira network I/O (a token refresh included).
    await ctx.runQuery(internal.integrations.jira.verifyCanManageIssues, {
      userId: user._id,
      roomId,
    });

    const client = await buildJiraClient(ctx, connection);
    const siteUrl = connection.siteUrl ?? "";

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const key of jiraIssueKeys) {
      try {
        const issue = await client.getIssue(key);
        const result = await ctx.runMutation(
          internal.integrations.jira.createIssueWithLink,
          {
            roomId,
            title: `${issue.key} - ${issue.fields.summary}`,
            provider: "jira",
            externalId: issue.key,
            externalUrl: `${siteUrl}/browse/${issue.key}`,
          }
        );
        if (result) {
          imported++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors.push(`${key}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    return { imported, skipped, errors };
  },
});

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

  // Parse estimate to number — skip if non-numeric (e.g., "XL", "?")
  const numericEstimate = parseFloat(push.finalEstimate);
  if (isNaN(numericEstimate)) {
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
    issueKey: v.string(),
    issueSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await Integrations.processJiraWebhookEvent(ctx, args);
  },
});

export const cleanupOldWebhookEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    await Integrations.cleanupOldWebhookEvents(ctx);
  },
});

/**
 * Best-effort remote deregistration of one Jira webhook. The model schedules
 * this (through the provider registry) whenever a mapping or connection is
 * torn down, so the remote webhook is deleted instead of being orphaned until
 * its 30-day expiry. A failure is retried once after a delay (the connection
 * row still exists at that point, so the retry can authenticate); a webhook
 * that survives the retry is left to expire — logged here so the leak is
 * tracked rather than silent.
 */
export const deregisterWebhook = internalAction({
  args: {
    connectionId: v.id("integrationConnections"),
    webhookId: v.string(),
    attemptsLeft: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.runQuery(
      internal.integrations.jira.getConnectionById,
      { connectionId: args.connectionId }
    );
    if (!connection) {
      console.warn(
        `Jira connection ${args.connectionId} already removed; webhook ${args.webhookId} left to expire remotely`
      );
      return;
    }

    try {
      const client = await buildJiraClient(ctx, connection);
      await client.deleteWebhooks([args.webhookId]);
      console.log(`Deregistered Jira webhook ${args.webhookId}`);
    } catch (error) {
      const attemptsLeft = args.attemptsLeft ?? 1;
      if (attemptsLeft > 0) {
        console.warn(
          `Failed to deregister Jira webhook ${args.webhookId}; retrying in 5 minutes:`,
          error
        );
        await ctx.scheduler.runAfter(
          5 * 60 * 1000,
          internal.integrations.jira.deregisterWebhook,
          {
            connectionId: args.connectionId,
            webhookId: args.webhookId,
            attemptsLeft: attemptsLeft - 1,
          }
        );
        return;
      }
      console.warn(
        `Failed to deregister Jira webhook ${args.webhookId} (no retries left); left to expire remotely:`,
        error
      );
    }
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

export const registerWebhook = internalAction({
  args: {
    mappingId: v.id("integrationMappings"),
  },
  handler: async (ctx, args) => {
    const mapping = await ctx.runQuery(
      internal.integrations.jira.getMappingById,
      { mappingId: args.mappingId }
    );
    if (!mapping || mapping.provider !== "jira" || !mapping.jiraProjectKey) {
      return null;
    }

    const connection = await ctx.runQuery(
      internal.integrations.jira.getConnectionById,
      { connectionId: mapping.connectionId }
    );
    if (!connection) throw new Error("Connection not found");

    const client = await buildJiraClient(ctx, connection);
    // Jira Cloud webhooks cannot send custom headers, so the shared secret
    // travels in the registered URL. The endpoint rejects deliveries without
    // it, so registration must not proceed when the secret is missing.
    const webhookSecret = process.env.JIRA_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error(
        "JIRA_WEBHOOK_SECRET must be configured to register a Jira webhook"
      );
    }
    const webhookUrl = `${process.env.CONVEX_SITE_URL}/webhooks/jira?secret=${encodeURIComponent(webhookSecret)}`;

    try {
      if (mapping.jiraWebhookId) {
        try {
          await client.deleteWebhooks([mapping.jiraWebhookId]);
        } catch (error) {
          console.warn(
            `Failed to delete old Jira webhook ${mapping.jiraWebhookId} for mapping ${mapping._id}:`,
            error
          );
        }
      }

      const jqlFilter = `project = ${mapping.jiraProjectKey}`;
      const webhookId = await client.registerWebhook(jqlFilter, webhookUrl);
      await ctx.runMutation(internal.integrations.jira.setMappingWebhook, {
        mappingId: mapping._id,
        webhookId,
      });
      console.log(`Registered Jira webhook ${webhookId}`);
      return webhookId;
    } catch (error) {
      console.error("Failed to register Jira webhook:", error);
      throw error;
    }
  },
});

export const refreshJiraWebhooks = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all Jira mappings and refresh their webhook registration
    const allMappings = await ctx.runQuery(
      internal.integrations.jira.getAllJiraMappings,
      {}
    );

    for (const mapping of allMappings) {
      try {
        await ctx.runAction(internal.integrations.jira.registerWebhook, {
          mappingId: mapping._id,
        });
      } catch (error) {
        console.error(
          `Failed to refresh webhook for mapping ${mapping._id}:`,
          error
        );
      }
    }
  },
});

export const getAllJiraMappings = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("integrationMappings")
      .withIndex("by_provider_autopush", (q) =>
        q.eq("provider", "jira").eq("autoPushEstimates", true)
      )
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const getUserByAuthId = internalQuery({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", args.authUserId))
      .first();
  },
});

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
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await requireCanForUser(ctx, user, args.roomId, {
      kind: "category",
      category: "issueManagement",
    });

    return { userId: user._id };
  },
});
