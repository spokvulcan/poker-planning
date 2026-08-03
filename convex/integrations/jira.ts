/**
 * Jira integration - actions and internal mutations for OAuth,
 * token management, issue import, and estimate push-back.
 *
 * Fetch orchestration (OAuth token exchange/refresh, Jira REST calls through
 * JiraClient, webhook registration) lives here; the db-side invariants
 * (connection upsert, mapping writes, webhook event dedup/apply) live in
 * model/integrations.ts and the handlers below delegate to it. The
 * token-field contract (key validation, encrypt-on-write, decrypt-on-read,
 * expiry rule) lives in model/tokenVault.ts.
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
import { createIssueInRoom } from "../model/issues";
import * as Integrations from "../model/integrations";
import * as TokenVault from "../model/tokenVault";
import { MAX_ISSUES_PER_ROOM } from "../constants";

// ---------------------------------------------------------------------------
// Token helpers (used within actions)
// ---------------------------------------------------------------------------

export async function getValidAccessToken(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections">
): Promise<string> {
  // If token is valid for >1 minute, decrypt and return
  if (TokenVault.isAccessTokenFresh(connection.expiresAt)) {
    return TokenVault.decryptAccessToken(connection);
  }

  // Token expired or about to expire — refresh
  return refreshJiraToken(ctx, connection);
}

export async function refreshJiraToken(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections">
): Promise<string> {
  const refreshToken = await TokenVault.decryptRefreshToken(connection);

  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Jira token: ${response.status} ${errorText}`);
  }

  const tokens = await response.json();

  // Atlassian uses rotating refresh tokens — encrypt both new tokens
  const enc = await TokenVault.encryptTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });

  await ctx.runMutation(internal.integrations.jira.updateTokens, {
    connectionId: connection._id,
    ...enc,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });

  return tokens.access_token;
}

async function buildJiraClient(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections">
): Promise<JiraClient> {
  if (!connection.cloudId) {
    throw new Error("Jira connection missing cloudId");
  }
  const accessToken = await getValidAccessToken(ctx, connection);
  return new JiraClient(connection.cloudId, accessToken);
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

    // Create bidirectional link
    await ctx.db.insert("issueLinks", {
      issueId,
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
    jiraWebhookId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await Integrations.setMappingWebhook(
      ctx,
      args.mappingId,
      args.jiraWebhookId
    );
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

export const getExpiringConnections = internalQuery({
  args: { expiryThreshold: v.number() },
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("integrationConnections")
      .withIndex("by_provider", (q) => q.eq("provider", "jira"))
      .collect();

    return connections.filter((c) => c.expiresAt < args.expiryThreshold);
  },
});

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
      expiresAt: Date.now() + args.expiresIn * 1000,
      cloudId: args.cloudId,
      siteUrl: args.siteUrl,
      providerUserId: args.providerUserId,
      providerUserEmail: args.providerUserEmail,
      scopes: args.scopes,
    });
  },
});

export const refreshExpiringTokens = internalAction({
  args: {},
  handler: async (ctx) => {
    // Refresh tokens expiring in the next 45 minutes
    const threshold = Date.now() + 45 * 60 * 1000;
    const connections: Doc<"integrationConnections">[] = await ctx.runQuery(
      internal.integrations.jira.getExpiringConnections,
      { expiryThreshold: threshold }
    );

    console.log(`Found ${connections.length} Jira tokens to refresh`);

    for (const connection of connections) {
      try {
        await refreshJiraToken(ctx, connection);
        console.log(`Refreshed token for connection ${connection._id}`);
      } catch (error) {
        console.error(
          `Failed to refresh token for connection ${connection._id}:`,
          error
        );
      }
    }
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
    const user = await requireActionUser(ctx);
    const connection = await getConnectionForUserId(ctx, user._id);
    const client = await buildJiraClient(ctx, connection);
    return await client.getProjects();
  },
});

export const getJiraBoards = action({
  args: { projectKey: v.string() },
  handler: async (ctx, { projectKey }) => {
    const user = await requireActionUser(ctx);
    const connection = await getConnectionForUserId(ctx, user._id);
    const client = await buildJiraClient(ctx, connection);
    return await client.getBoards(projectKey);
  },
});

export const getJiraSprints = action({
  args: { boardId: v.number() },
  handler: async (ctx, { boardId }) => {
    const user = await requireActionUser(ctx);
    const connection = await getConnectionForUserId(ctx, user._id);
    const client = await buildJiraClient(ctx, connection);
    return await client.getSprints(boardId);
  },
});

export const getJiraIssues = action({
  args: {
    projectKey: v.string(),
    sprintId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireActionUser(ctx);
    const connection = await getConnectionForUserId(ctx, user._id);
    const client = await buildJiraClient(ctx, connection);

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
    const user = await requireActionUser(ctx);

    // Verify the caller is a member of the room with issue management permission
    await ctx.runQuery(internal.integrations.jira.verifyCanManageIssues, {
      userId: user._id,
      roomId,
    });

    const connection = await getConnectionForUserId(ctx, user._id);
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

    if (!mapping.storyPointsFieldId) {
      console.log(`No story points field configured for mapping, skipping push`);
      return;
    }

    // Parse estimate to number — skip if non-numeric (e.g., "XL", "?")
    const numericEstimate = parseFloat(finalEstimate);
    if (isNaN(numericEstimate)) {
      console.log(`Non-numeric estimate "${finalEstimate}", skipping Jira push`);
      return;
    }

    const connection = await ctx.runQuery(
      internal.integrations.jira.getConnectionById,
      { connectionId: mapping.connectionId }
    );

    if (!connection) {
      console.error(`Connection ${mapping.connectionId} not found`);
      return;
    }

    const client = await buildJiraClient(ctx, connection);

    try {
      await client.updateStoryPoints(
        issueLink.externalId,
        mapping.storyPointsFieldId,
        numericEstimate
      );

      await client.addComment(
        issueLink.externalId,
        `Estimated at ${finalEstimate} point${numericEstimate !== 1 ? "s" : ""} via AgileKit`
      );

      console.log(
        `Pushed estimate ${finalEstimate} to Jira ${issueLink.externalId}`
      );
    } catch (error) {
      console.error(
        `Failed to push estimate to Jira ${issueLink.externalId}:`,
        error
      );
    }
  },
});

export const detectStoryPointsField = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireActionUser(ctx);
    const connection = await getConnectionForUserId(ctx, user._id);
    const client = await buildJiraClient(ctx, connection);
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
 * this whenever a mapping or connection is torn down, so the remote webhook
 * is deleted instead of being orphaned until its 30-day expiry. If the
 * connection is already gone the webhook is left to expire — logged here so
 * the leak is tracked rather than silent.
 */
export const deregisterWebhook = internalAction({
  args: {
    connectionId: v.id("integrationConnections"),
    jiraWebhookId: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.runQuery(
      internal.integrations.jira.getConnectionById,
      { connectionId: args.connectionId }
    );
    if (!connection) {
      console.warn(
        `Jira connection ${args.connectionId} already removed; webhook ${args.jiraWebhookId} left to expire remotely`
      );
      return;
    }

    try {
      const client = await buildJiraClient(ctx, connection);
      await client.deleteWebhooks([args.jiraWebhookId]);
      console.log(`Deregistered Jira webhook ${args.jiraWebhookId}`);
    } catch (error) {
      console.warn(
        `Failed to deregister Jira webhook ${args.jiraWebhookId}:`,
        error
      );
    }
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
        jiraWebhookId: webhookId,
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
