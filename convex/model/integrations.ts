import { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import {
  EncryptedTokenFields,
  assertEncryptedTokenFields,
} from "./tokenVault";

/**
 * The integrations model: the one owner of the db-side invariants for
 * provider connections, room mappings, and webhook event processing.
 *
 * Everything here is db-pure (MutationCtx only) — remote Jira calls stay in
 * the integrations/jira.ts actions; this module schedules them, the way the
 * voting round schedules the estimate push. The registered wrappers in
 * integrations.ts (public API) and integrations/jira.ts (internal) delegate
 * here, so every writer of these tables funnels through the same code.
 */

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export interface ConnectionArgs extends EncryptedTokenFields {
  userId: Id<"users">;
  provider: Doc<"integrationConnections">["provider"];
  expiresAt: number;
  cloudId?: string;
  siteUrl?: string;
  providerUserId?: string;
  providerUserEmail?: string;
  scopes: string[];
}

/**
 * Upserts a user's provider connection: one row per (userId, provider).
 * Token material is always re-encrypted by the caller (through the token
 * vault) and re-written here; the vault tripwire runs first so only
 * ciphertext can ever reach the token columns. `connectedAt` survives
 * re-connects, `lastRefreshedAt` always advances.
 */
export async function saveConnection(
  ctx: MutationCtx,
  args: ConnectionArgs
): Promise<Id<"integrationConnections">> {
  assertEncryptedTokenFields(args);
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
}

export interface TokenUpdateArgs extends EncryptedTokenFields {
  connectionId: Id<"integrationConnections">;
  expiresAt: number;
}

/**
 * Re-writes the token fields after a provider refresh. Like saveConnection,
 * only vault-produced ciphertext is accepted; `lastRefreshedAt` always
 * advances with the tokens.
 */
export async function updateConnectionTokens(
  ctx: MutationCtx,
  args: TokenUpdateArgs
): Promise<void> {
  assertEncryptedTokenFields(args);
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
}

/**
 * The sanitized read projection of a connection — exactly the fields a reader
 * may see. Encrypted token material never leaves the db layer; every reader
 * must go through this projection.
 */
export function toConnectionView(connection: Doc<"integrationConnections">): {
  _id: Id<"integrationConnections">;
  provider: Doc<"integrationConnections">["provider"];
  siteUrl?: string;
  providerUserEmail?: string;
  connectedAt: number;
  scopes: string[];
} {
  return {
    _id: connection._id,
    provider: connection.provider,
    siteUrl: connection.siteUrl,
    providerUserEmail: connection.providerUserEmail,
    connectedAt: connection.connectedAt,
    scopes: connection.scopes,
  };
}

/**
 * Deletes a connection row directly. Runs as the tail of finalizeDisconnect —
 * the action that deregisters the connection's webhooks first, so the row
 * deletion happens only after every deregistration has read the credentials
 * it authenticates with.
 */
export async function deleteConnection(
  ctx: MutationCtx,
  connectionId: Id<"integrationConnections">
): Promise<void> {
  const connection = await ctx.db.get(connectionId);
  if (connection) {
    await ctx.db.delete(connectionId);
  }
}

// ---------------------------------------------------------------------------
// Room mappings
// ---------------------------------------------------------------------------

export interface RoomMappingArgs {
  roomId: Id<"rooms">;
  connectionId: Id<"integrationConnections">;
  provider: Doc<"integrationMappings">["provider"];
  jiraProjectKey?: string;
  jiraBoardId?: number;
  jiraSprintId?: number;
  storyPointsFieldId?: string;
  autoImport: boolean;
  autoPushEstimates: boolean;
}

/**
 * Upserts the room's provider mapping (one per room), preserving the original
 * `createdAt` on update. When auto-push is enabled for a Jira project,
 * schedules webhook (re-)registration — the registration action deletes any
 * previous remote webhook before registering the new one.
 */
export async function saveRoomMapping(
  ctx: MutationCtx,
  args: RoomMappingArgs
): Promise<Id<"integrationMappings">> {
  // Upsert: check for existing mapping
  const existing = await ctx.db
    .query("integrationMappings")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      connectionId: args.connectionId,
      provider: args.provider,
      jiraProjectKey: args.jiraProjectKey,
      jiraBoardId: args.jiraBoardId,
      jiraSprintId: args.jiraSprintId,
      storyPointsFieldId: args.storyPointsFieldId,
      autoImport: args.autoImport,
      autoPushEstimates: args.autoPushEstimates,
    });

    await scheduleWebhookRegistration(ctx, args, existing._id);
    return existing._id;
  }

  const mappingId = await ctx.db.insert("integrationMappings", {
    roomId: args.roomId,
    connectionId: args.connectionId,
    provider: args.provider,
    jiraProjectKey: args.jiraProjectKey,
    jiraBoardId: args.jiraBoardId,
    jiraSprintId: args.jiraSprintId,
    storyPointsFieldId: args.storyPointsFieldId,
    autoImport: args.autoImport,
    autoPushEstimates: args.autoPushEstimates,
    createdAt: Date.now(),
  });

  await scheduleWebhookRegistration(ctx, args, mappingId);
  return mappingId;
}

async function scheduleWebhookRegistration(
  ctx: MutationCtx,
  args: RoomMappingArgs,
  mappingId: Id<"integrationMappings">
): Promise<void> {
  // Schedule webhook registration if auto-push enabled
  if (args.autoPushEstimates && args.jiraProjectKey) {
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.jira.registerWebhook,
      {
        mappingId,
      }
    );
  }
}

/**
 * Records the registered Jira webhook on a mapping — or clears it when called
 * without an id. The registration timestamp is written iff an id is present,
 * so the pair never drifts.
 */
export async function setMappingWebhook(
  ctx: MutationCtx,
  mappingId: Id<"integrationMappings">,
  jiraWebhookId?: string
): Promise<void> {
  await ctx.db.patch(mappingId, {
    jiraWebhookId,
    jiraWebhookRegisteredAt: jiraWebhookId ? Date.now() : undefined,
  });
}

/**
 * Removes the room's mapping (if any) and schedules deregistration of its
 * Jira webhook. The connection row survives the mapping, so the scheduled
 * action can still authenticate the remote delete.
 */
export async function removeRoomMapping(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<void> {
  const mapping = await ctx.db
    .query("integrationMappings")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .first();

  if (mapping) {
    await ctx.db.delete(mapping._id);
    await scheduleWebhookDeregistration(ctx, mapping);
  }
}

/**
 * The disconnect cascade: deletes every mapping on the connection, then hands
 * the live Jira webhooks to one finalizeDisconnect action, which deregisters
 * them and deletes the connection row only afterwards — the ordering comes
 * from that action's own awaits, not from same-tick scheduled-job ordering
 * (which Convex does not guarantee). With nothing to deregister the row goes
 * immediately.
 */
export async function disconnectConnection(
  ctx: MutationCtx,
  connectionId: Id<"integrationConnections">
): Promise<void> {
  // Cascade delete all mappings using this connection
  const mappings = await ctx.db
    .query("integrationMappings")
    .withIndex("by_connection", (q) => q.eq("connectionId", connectionId))
    .collect();
  await Promise.all(mappings.map((m) => ctx.db.delete(m._id)));

  const liveWebhookIds = mappings
    .filter((m) => m.provider === "jira" && !!m.jiraWebhookId)
    .map((m) => m.jiraWebhookId!);

  if (liveWebhookIds.length > 0) {
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.jira.finalizeDisconnect,
      { connectionId, jiraWebhookIds: liveWebhookIds }
    );
  } else {
    await ctx.db.delete(connectionId);
  }
}

/**
 * Schedules remote deregistration of a mapping's Jira webhook. Deleting the
 * mapping row alone orphans the remote webhook — it keeps POSTing until its
 * 30-day expiry — so every mapping-removal path (removeRoomMapping, the room
 * cascade in model/roomAggregate) must go through this.
 */
export async function scheduleWebhookDeregistration(
  ctx: MutationCtx,
  mapping: Doc<"integrationMappings">
): Promise<void> {
  if (mapping.provider === "jira" && mapping.jiraWebhookId) {
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.jira.deregisterWebhook,
      {
        connectionId: mapping.connectionId,
        jiraWebhookId: mapping.jiraWebhookId,
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

export interface JiraWebhookEvent {
  eventKey: string;
  eventType: string;
  issueKey: string;
  issueSummary?: string;
}

/**
 * Applies a Jira webhook delivery, deduplicated by event key: the dedup check
 * and insert happen in this one mutation, so a redelivery of the same event
 * can never re-apply. `jira:issue_updated` syncs the linked issue's title;
 * `jira:issue_deleted` removes the link but keeps the AgileKit issue.
 */
export async function processJiraWebhookEvent(
  ctx: MutationCtx,
  event: JiraWebhookEvent
): Promise<void> {
  // Atomic dedup: check + insert in the same mutation (no race window)
  const existing = await ctx.db
    .query("webhookEvents")
    .withIndex("by_event_key", (q) => q.eq("eventKey", event.eventKey))
    .first();
  if (existing) return; // Already processed

  await ctx.db.insert("webhookEvents", {
    eventKey: event.eventKey,
    provider: "jira",
    processedAt: Date.now(),
  });

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
    }
    await ctx.db.patch(link._id, { lastSyncedAt: Date.now() });
  }

  if (event.eventType === "jira:issue_deleted") {
    // Remove the link (keep the AgileKit issue)
    await ctx.db.delete(link._id);
  }
}

/** Sweeps processed webhook dedup rows older than 7 days. */
export async function cleanupOldWebhookEvents(
  ctx: MutationCtx
): Promise<void> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const oldEvents = await ctx.db
    .query("webhookEvents")
    .withIndex("by_processed", (q) => q.lt("processedAt", sevenDaysAgo))
    .collect();

  await Promise.all(oldEvents.map((e) => ctx.db.delete(e._id)));
  if (oldEvents.length > 0) {
    console.log(`Cleaned up ${oldEvents.length} old webhook events`);
  }
}
