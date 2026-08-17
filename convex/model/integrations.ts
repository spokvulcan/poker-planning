import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  EncryptedTokenFields,
  assertEncryptedTokenFields,
} from "./tokenVault";
import * as Rooms from "./rooms";
import { getProviderHandler } from "../integrations/registry";

/**
 * The integrations model: the one owner of the db-side invariants for
 * provider connections, room mappings, and webhook event processing.
 *
 * Everything here is db-pure (MutationCtx only) — remote provider calls stay
 * in the integrations/<provider> adapter actions; this module schedules them
 * through the provider registry (integrations/registry.ts) keyed by the
 * connection's or mapping's `provider`, never by a hardcoded provider name.
 * The registered wrappers in integrations.ts (public API) and
 * integrations/jira.ts (internal) delegate here, so every writer of these
 * tables funnels through the same code.
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

/**
 * Provider-neutral mapping args. The db columns keep their provider-prefixed
 * names (jiraProjectKey, … — schema.ts), because each provider persists its
 * own mapping shape; the neutral names here are what the generic module
 * routes on. Public endpoint args map 1:1 onto these (see integrations.ts).
 */
export interface RoomMappingArgs {
  roomId: Id<"rooms">;
  connectionId: Id<"integrationConnections">;
  provider: Doc<"integrationMappings">["provider"];
  projectKey?: string;
  boardId?: number;
  sprintId?: number;
  storyPointsFieldId?: string;
  autoImport: boolean;
  autoPushEstimates: boolean;
}

/**
 * Upserts the room's provider mapping (one per room), preserving the original
 * `createdAt` on update, and bumps the room's activity through the single
 * chokepoint (Rooms.updateRoomActivity) like every other user-initiated
 * mutation. When auto-push is enabled and the provider handler sees a
 * registration target, schedules webhook (re-)registration — the registration
 * action deletes any previous remote webhook before registering the new one.
 */
export async function saveRoomMapping(
  ctx: MutationCtx,
  args: RoomMappingArgs
): Promise<Id<"integrationMappings">> {
  const fields = {
    connectionId: args.connectionId,
    provider: args.provider,
    jiraProjectKey: args.projectKey,
    jiraBoardId: args.boardId,
    jiraSprintId: args.sprintId,
    storyPointsFieldId: args.storyPointsFieldId,
    autoImport: args.autoImport,
    autoPushEstimates: args.autoPushEstimates,
  };

  // Upsert: check for existing mapping
  const existing = await ctx.db
    .query("integrationMappings")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .first();

  let mappingId: Id<"integrationMappings">;
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    mappingId = existing._id;
  } else {
    mappingId = await ctx.db.insert("integrationMappings", {
      roomId: args.roomId,
      ...fields,
      createdAt: Date.now(),
    });
  }

  await Rooms.updateRoomActivity(ctx, args.roomId);
  await scheduleWebhookRegistration(ctx, args, mappingId);
  return mappingId;
}

async function scheduleWebhookRegistration(
  ctx: MutationCtx,
  args: RoomMappingArgs,
  mappingId: Id<"integrationMappings">
): Promise<void> {
  // Schedule webhook registration when auto-push is on and the provider
  // handler sees a registration target in the mapping (for Jira, the project
  // key).
  const handler = getProviderHandler(args.provider);
  if (args.autoPushEstimates && handler.hasWebhookTarget(args)) {
    await ctx.scheduler.runAfter(0, handler.registerWebhook, { mappingId });
  }
}

/**
 * Records the registered webhook on a mapping — or clears it when called
 * without an id. The registration timestamp is written iff an id is present,
 * so the pair never drifts. (The db columns keep the jira prefix; they are
 * the Jira adapter's webhook slot, read through its handler's webhookIdOf.)
 */
export async function setMappingWebhook(
  ctx: MutationCtx,
  mappingId: Id<"integrationMappings">,
  webhookId?: string
): Promise<void> {
  await ctx.db.patch(mappingId, {
    jiraWebhookId: webhookId,
    jiraWebhookRegisteredAt: webhookId ? Date.now() : undefined,
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
    // Removing the room's integration mapping is user-initiated room
    // activity — route it through the single chokepoint.
    await Rooms.updateRoomActivity(ctx, roomId);
  }
}

/**
 * The disconnect cascade: deletes every mapping on the connection, then hands
 * the live webhooks to the provider handler's finalizeDisconnect action,
 * which deregisters them and deletes the connection row only afterwards — the
 * ordering comes from that action's own awaits, not from same-tick
 * scheduled-job ordering (which Convex does not guarantee). With nothing to
 * deregister the row goes immediately.
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

  const connection = await ctx.db.get(connectionId);
  if (!connection) return;

  // Every mapping of a connection shares the connection's provider, so the
  // one handler reads all of their live webhook ids.
  const handler = getProviderHandler(connection.provider);
  const liveWebhookIds = mappings
    .map((m) => handler.webhookIdOf(m))
    .filter((id): id is string => !!id);

  if (liveWebhookIds.length > 0) {
    await ctx.scheduler.runAfter(0, handler.finalizeDisconnect, {
      connectionId,
      webhookIds: liveWebhookIds,
    });
  } else {
    await ctx.db.delete(connectionId);
  }
}

/**
 * Schedules remote deregistration of a mapping's webhook via its provider
 * handler. Deleting the mapping row alone orphans the remote webhook — it
 * keeps POSTing until its remote expiry — so every mapping-removal path
 * (removeRoomMapping, the room cascade in model/roomAggregate) must go
 * through this.
 */
export async function scheduleWebhookDeregistration(
  ctx: MutationCtx,
  mapping: Doc<"integrationMappings">
): Promise<void> {
  const handler = getProviderHandler(mapping.provider);
  const webhookId = handler.webhookIdOf(mapping);
  if (webhookId) {
    await ctx.scheduler.runAfter(0, handler.deregisterWebhook, {
      connectionId: mapping.connectionId,
      webhookId,
    });
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
