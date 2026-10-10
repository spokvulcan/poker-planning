import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  EncryptedTokenFields,
  assertEncryptedTokenFields,
} from "./tokenVault";
import * as Rooms from "./rooms";
import { getProviderHandler } from "../integrations/registry";
import type { UserRows } from "./userRows";

/**
 * The integrations model: the one owner of the db-side invariants for
 * provider connections, room mappings, and webhook event dedup.
 *
 * Everything here is db-pure (MutationCtx only) — remote provider calls stay
 * in the integrations/<provider> adapter actions. Whatever changes or ends a
 * mapping hands it to its provider's webhook reconcile through the provider
 * registry (integrations/registry.ts), keyed by the connection's or mapping's
 * `provider`, never by a hardcoded provider name; the reconcile alone writes
 * the mapping's webhook record. Webhook *semantics* (what an event does to
 * issues and links) live in the adapter too; this module owns only the
 * shared dedup table. The registered wrappers in integrations.ts (public API)
 * and integrations/jira.ts (internal), and account deletion and linking
 * (integrationUserRows, run by model/accountLifecycle.ts), delegate here, so
 * every writer of these tables funnels through the same code.
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
    await ctx.db.patch("integrationConnections", existing._id, {
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
  await ctx.db.patch("integrationConnections", args.connectionId, {
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
  const connection = await ctx.db.get("integrationConnections", connectionId);
  if (connection) {
    await ctx.db.delete("integrationConnections", connectionId);
  }
}

// ---------------------------------------------------------------------------
// Room mappings
// ---------------------------------------------------------------------------

/**
 * Provider-neutral mapping args. The db columns keep their provider-prefixed
 * names (jiraProjectKey, … — schema.ts), because each provider persists its
 * own mapping shape; the neutral names here are what the generic module
 * routes on. Public endpoint args map 1:1 onto these, the room loaded (see
 * integrations.ts).
 */
export interface RoomMappingArgs {
  /** The room the mapping is for, as the room-scoped step loaded it. */
  room: Doc<"rooms">;
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
 * mutation. Then hands the row as it was and as it is to the provider's
 * webhook reconcile, which registers, replaces or removes the mapping's
 * webhook to match.
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
    .withIndex("by_room", (q) => q.eq("roomId", args.room._id))
    .first();

  let mappingId: Id<"integrationMappings">;
  if (existing) {
    await ctx.db.patch("integrationMappings", existing._id, fields);
    mappingId = existing._id;
  } else {
    mappingId = await ctx.db.insert("integrationMappings", {
      roomId: args.room._id,
      ...fields,
      createdAt: Date.now(),
    });
  }

  await Rooms.updateRoomActivity(ctx, args.room);
  const after = (await ctx.db.get("integrationMappings", mappingId))!;
  await getProviderHandler(args.provider).webhooks.reconcile(ctx, {
    kind: "saved",
    before: existing,
    after,
  });
  return mappingId;
}

/**
 * Removes the room's mapping (if any) from the room's settings, through
 * deleteMapping. The connection row survives the mapping, so the webhook's
 * removal can still authenticate with it. Takes the room as the room-scoped
 * step loaded it.
 */
export async function removeRoomMapping(
  ctx: MutationCtx,
  room: Doc<"rooms">
): Promise<void> {
  const mapping = await ctx.db
    .query("integrationMappings")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .first();

  if (mapping) {
    await deleteMapping(ctx, mapping);
    // Removing the room's integration mapping is user-initiated room
    // activity — route it through the single chokepoint.
    await Rooms.updateRoomActivity(ctx, room);
  }
}

/**
 * Deletes a room's mapping row and hands the row, as data, to its provider's
 * webhook reconcile, which removes the webhook on its record. Removing the
 * mapping from the room's settings and its room ending (the sweep's too) all
 * delete through here; a disconnect hands its mappings over together
 * (disconnectConnection). Bumps no activity: a room ending is not activity.
 */
export async function deleteMapping(
  ctx: MutationCtx,
  mapping: Doc<"integrationMappings">
): Promise<void> {
  await ctx.db.delete("integrationMappings", mapping._id);
  await getProviderHandler(mapping.provider).webhooks.reconcile(ctx, {
    kind: "removed",
    mapping,
  });
}

/**
 * The disconnect cascade: deletes every mapping on the connection, then hands
 * them to the provider's webhook reconcile. While a webhook the connection
 * made is live, the reconcile's disconnect tail deletes the connection row
 * after deregistering it with the row's credentials; with nothing live the
 * row goes immediately.
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
  await Promise.all(mappings.map((m) => ctx.db.delete("integrationMappings", m._id)));

  const connection = await ctx.db.get("integrationConnections", connectionId);
  if (!connection) return;

  // Every mapping of a connection shares the connection's provider, so the
  // one reconcile takes all of them.
  const row = await getProviderHandler(connection.provider).webhooks.disconnect(
    ctx,
    connectionId,
    mappings
  );
  if (row === "now") await ctx.db.delete("integrationConnections", connectionId);
}

/** A person's provider connections: at most one per provider (saveConnection upserts). */
async function connectionsOf(ctx: MutationCtx, userId: Id<"users">): Promise<Doc<"integrationConnections">[]> {
  return await ctx.db
    .query("integrationConnections")
    .withIndex("by_user_provider", (q) => q.eq("userId", userId))
    .collect();
}

/**
 * A person's provider connections, with the OAuth tokens they hold. A deleted
 * account's connections disconnect like any other: their room mappings go,
 * their webhooks are deregistered, and the tokens are deleted, so nothing
 * refreshes or uses them again. A guest's connection becomes the account's,
 * unless the account already has its own with that provider.
 */
export const integrationUserRows: UserRows = {
  fields: ["integrationConnections.userId"],

  async forget(ctx, userId) {
    for (const connection of await connectionsOf(ctx, userId)) {
      await disconnectConnection(ctx, connection._id);
    }
  },

  async fold(ctx, from, into) {
    for (const connection of await connectionsOf(ctx, from)) {
      const own = await ctx.db
        .query("integrationConnections")
        .withIndex("by_user_provider", (q) => q.eq("userId", into).eq("provider", connection.provider))
        .first();
      if (own) await disconnectConnection(ctx, connection._id);
      else await ctx.db.patch("integrationConnections", connection._id, { userId: into });
    }
  },
};

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

/**
 * Records a webhook delivery, deduplicated by event key: the check and insert
 * happen in this one mutation, so a redelivery of the same event can never
 * re-apply. Returns false for a duplicate. Provider-neutral — what the event
 * *does* is the adapter's business (integrations/<provider>); this module
 * owns only the dedup table.
 */
export async function recordWebhookEvent(
  ctx: MutationCtx,
  args: { eventKey: string; provider: Doc<"webhookEvents">["provider"] }
): Promise<boolean> {
  const existing = await ctx.db
    .query("webhookEvents")
    .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
    .first();
  if (existing) return false; // Already processed

  await ctx.db.insert("webhookEvents", {
    eventKey: args.eventKey,
    provider: args.provider,
    processedAt: Date.now(),
  });
  return true;
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

  await Promise.all(oldEvents.map((e) => ctx.db.delete("webhookEvents", e._id)));
  if (oldEvents.length > 0) {
    console.log(`Cleaned up ${oldEvents.length} old webhook events`);
  }
}
