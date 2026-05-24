/**
 * Jira integration - actions and internal mutations for OAuth,
 * token management, issue import, and estimate push-back.
 */

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { ActionCtx } from "../_generated/server";
import { encryptToken, decryptToken } from "../lib/encryption";
import {
  Action,
  resolve,
  getEffectivePermissions,
  getEffectiveRole,
} from "../permissions";
import { isRoomOwnerAbsent } from "../model/permissions";
import { JiraClient } from "./jiraClient";

function getTokenEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "Missing TOKEN_ENCRYPTION_KEY environment variable. Set a 32-byte hex key."
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "Invalid TOKEN_ENCRYPTION_KEY. Expected 64 hex characters (32 bytes)."
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Token helpers (used within actions)
// ---------------------------------------------------------------------------

export async function getValidAccessToken(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections">
): Promise<string> {
  const encKey = getTokenEncryptionKey();

  // If token is valid for >1 minute, decrypt and return
  if (connection.expiresAt > Date.now() + 60_000) {
    return decryptToken(
      connection.encryptedAccessToken,
      connection.accessTokenIv,
      connection.accessTokenAuthTag,
      encKey
    );
  }

  // Token expired or about to expire — refresh
  return refreshJiraToken(ctx, connection);
}

export async function refreshJiraToken(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections">
): Promise<string> {
  const encKey = getTokenEncryptionKey();

  if (
    !connection.encryptedRefreshToken ||
    !connection.refreshTokenIv ||
    !connection.refreshTokenAuthTag
  ) {
    throw new Error("No refresh token available for this connection");
  }

  const refreshToken = await decryptToken(
    connection.encryptedRefreshToken,
    connection.refreshTokenIv,
    connection.refreshTokenAuthTag,
    encKey
  );

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
  const encAccess = await encryptToken(tokens.access_token, encKey);
  const encRefresh = await encryptToken(tokens.refresh_token, encKey);

  await ctx.runMutation(internal.integrations.jira.updateTokens, {
    connectionId: connection._id,
    encryptedAccessToken: encAccess.ciphertext,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
    encryptedRefreshToken: encRefresh.ciphertext,
    refreshTokenIv: encRefresh.iv,
    refreshTokenAuthTag: encRefresh.authTag,
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
    // Check for existing connection
    const existing = await ctx.db
      .query("integrationConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedAccessToken: args.encryptedAccessToken,
        accessTokenIv: args.accessTokenIv,
        accessTokenAuthTag: args.accessTokenAuthTag,
        encryptedRefreshToken: args.encryptedRefreshToken,
        refreshTokenIv: args.refreshTokenIv,
        refreshTokenAuthTag: args.refreshTokenAuthTag,
        expiresAt: args.expiresAt,
        cloudId: args.cloudId,
        siteUrl: args.siteUrl,
        providerUserId: args.providerUserId,
        providerUserEmail: args.providerUserEmail,
        scopes: args.scopes,
        lastRefreshedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("integrationConnections", {
      userId: args.userId,
      provider: args.provider,
      encryptedAccessToken: args.encryptedAccessToken,
      accessTokenIv: args.accessTokenIv,
      accessTokenAuthTag: args.accessTokenAuthTag,
      encryptedRefreshToken: args.encryptedRefreshToken,
      refreshTokenIv: args.refreshTokenIv,
      refreshTokenAuthTag: args.refreshTokenAuthTag,
      expiresAt: args.expiresAt,
      cloudId: args.cloudId,
      siteUrl: args.siteUrl,
      providerUserId: args.providerUserId,
      providerUserEmail: args.providerUserEmail,
      scopes: args.scopes,
      connectedAt: now,
      lastRefreshedAt: now,
    });
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
    await ctx.db.patch(args.connectionId, {
      encryptedAccessToken: args.encryptedAccessToken,
      accessTokenIv: args.accessTokenIv,
      accessTokenAuthTag: args.accessTokenAuthTag,
      encryptedRefreshToken: args.encryptedRefreshToken,
      refreshTokenIv: args.refreshTokenIv,
      refreshTokenAuthTag: args.refreshTokenAuthTag,
      expiresAt: args.expiresAt,
      lastRefreshedAt: Date.now(),
    });
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
    // Dedup per-room: same Jira issue can exist in multiple rooms,
    // but not twice in the same room.
    const roomIssues = await ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

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

    // Create issue (follows Issues.createIssue pattern)
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    const currentNumber = room.nextIssueNumber ?? 1;
    await ctx.db.patch(args.roomId, { nextIssueNumber: currentNumber + 1 });

    // Find current max order
    const existingIssues = await ctx.db
      .query("issues")
      .withIndex("by_room_order", (q) => q.eq("roomId", args.roomId))
      .collect();
    const maxOrder =
      existingIssues.length > 0
        ? Math.max(...existingIssues.map((i) => i.order))
        : 0;

    const issueId = await ctx.db.insert("issues", {
      roomId: args.roomId,
      sequentialId: currentNumber,
      title: args.title,
      status: "pending",
      createdAt: Date.now(),
      order: maxOrder + 1,
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
    await ctx.db.patch(args.mappingId, {
      jiraWebhookId: args.jiraWebhookId,
      jiraWebhookRegisteredAt: args.jiraWebhookId ? Date.now() : undefined,
    });
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
    const encKey = getTokenEncryptionKey();

    const encAccess = await encryptToken(args.accessToken, encKey);
    const encRefresh = await encryptToken(args.refreshToken, encKey);

    await ctx.runMutation(internal.integrations.jira.saveConnection, {
      userId: args.userId,
      provider: "jira",
      encryptedAccessToken: encAccess.ciphertext,
      accessTokenIv: encAccess.iv,
      accessTokenAuthTag: encAccess.authTag,
      encryptedRefreshToken: encRefresh.ciphertext,
      refreshTokenIv: encRefresh.iv,
      refreshTokenAuthTag: encRefresh.authTag,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Resolve user from auth identity
    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.integrations.jira.getUserByAuthId,
      { authUserId: identity.subject }
    );
    if (!user) throw new Error("User not found");

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await getConnectionFromIdentity(ctx, identity.subject);
    const client = await buildJiraClient(ctx, connection);
    return await client.getProjects();
  },
});

export const getJiraBoards = action({
  args: { projectKey: v.string() },
  handler: async (ctx, { projectKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await getConnectionFromIdentity(ctx, identity.subject);
    const client = await buildJiraClient(ctx, connection);
    return await client.getBoards(projectKey);
  },
});

export const getJiraSprints = action({
  args: { boardId: v.number() },
  handler: async (ctx, { boardId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await getConnectionFromIdentity(ctx, identity.subject);
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await getConnectionFromIdentity(ctx, identity.subject);
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Verify the caller is a member of the room with issue management permission
    await ctx.runQuery(internal.integrations.jira.verifyRoomAccess, {
      authUserId: identity.subject,
      roomId,
    });

    const connection = await getConnectionFromIdentity(ctx, identity.subject);
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const connection = await getConnectionFromIdentity(ctx, identity.subject);
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
    // Atomic dedup: check + insert in the same mutation (no race window)
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
      .first();
    if (existing) return; // Already processed

    await ctx.db.insert("webhookEvents", {
      eventKey: args.eventKey,
      provider: "jira",
      processedAt: Date.now(),
    });

    // Find linked issue
    const link = await ctx.db
      .query("issueLinks")
      .withIndex("by_external", (q) =>
        q.eq("provider", "jira").eq("externalId", args.issueKey)
      )
      .first();

    if (!link) return; // Not a tracked issue

    if (args.eventType === "jira:issue_updated" && args.issueSummary) {
      // Update issue title
      const issue = await ctx.db.get(link.issueId);
      if (issue) {
        await ctx.db.patch(link.issueId, {
          title: `${args.issueKey} - ${args.issueSummary}`,
        });
      }
      await ctx.db.patch(link._id, { lastSyncedAt: Date.now() });
    }

    if (args.eventType === "jira:issue_deleted") {
      // Remove the link (keep the AgileKit issue)
      await ctx.db.delete(link._id);
    }
  },
});

export const cleanupOldWebhookEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oldEvents = await ctx.db
      .query("webhookEvents")
      .withIndex("by_processed", (q) => q.lt("processedAt", sevenDaysAgo))
      .collect();

    await Promise.all(oldEvents.map((e) => ctx.db.delete(e._id)));
    if (oldEvents.length > 0) {
      console.log(`Cleaned up ${oldEvents.length} old webhook events`);
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
    const webhookUrl = `${process.env.CONVEX_SITE_URL}/webhooks/jira`;

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
      .filter((q) =>
        q.and(
          q.eq(q.field("provider"), "jira"),
          q.eq(q.field("autoPushEstimates"), true)
        )
      )
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getConnectionFromIdentity(
  ctx: ActionCtx,
  authSubject: string
): Promise<Doc<"integrationConnections">> {
  // Resolve user from auth identity
  const user: Doc<"users"> | null = await ctx.runQuery(
    internal.integrations.jira.getUserByAuthId,
    { authUserId: authSubject }
  );
  if (!user) throw new Error("User not found");

  const connection: Doc<"integrationConnections"> | null = await ctx.runQuery(
    internal.integrations.jira.getConnectionForUser,
    { userId: user._id, provider: "jira" }
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

/** Verifies that the user is a room member with issueManagement permission. */
export const verifyRoomAccess = internalQuery({
  args: {
    authUserId: v.string(),
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", args.authUserId))
      .first();
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("roomMemberships")
      .withIndex("by_room_user", (q) =>
        q.eq("roomId", args.roomId).eq("userId", user._id)
      )
      .first();
    if (!membership) throw new Error("Not a member of this room");

    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    // This internal query authenticates via an explicit authUserId rather than
    // ctx.auth, so it can't use requireCan; it reaches the permission decision
    // directly with the room and membership already in hand.
    const permissions = getEffectivePermissions(room);
    const action: Action = {
      kind: "category",
      category: "issueManagement",
      level: permissions.issueManagement,
    };
    const decision = resolve(action, {
      actorRole: getEffectiveRole(membership),
      permissions,
      ownerAbsent: await isRoomOwnerAbsent(ctx, room),
    });
    if (!decision.allowed) {
      throw new Error(decision.message);
    }

    return { userId: user._id };
  },
});
