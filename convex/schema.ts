import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The integration provider union — the one validator shared by the schema
 * tables and every function argument that takes a provider.
 */
export const providerValidator = v.union(
  v.literal("jira"),
  v.literal("github")
);

/**
 * A permission level, shared by every configurable category (ADR-0013).
 */
export const permissionLevelValidator = v.union(
  v.literal("everyone"),
  v.literal("facilitators"),
  v.literal("owner")
);

/** The poker room's four configurable categories. */
export const pokerPermissionsValidator = v.object({
  revealCards: permissionLevelValidator,
  gameFlow: permissionLevelValidator,
  issueManagement: permissionLevelValidator,
  roomSettings: permissionLevelValidator,
});

/** The retro room's four configurable categories (ADR-0013). */
export const retroPermissionsValidator = v.object({
  stageFlow: permissionLevelValidator,
  cardManagement: permissionLevelValidator,
  actionManagement: permissionLevelValidator,
  retroSettings: permissionLevelValidator,
});

/** A retro's step (see retroTemplates.ts). */
export const retroStepValidator = v.union(
  v.literal("write"),
  v.literal("vote"),
  v.literal("discuss"),
  v.literal("done")
);

export const stickyColorValidator = v.union(
  v.literal("yellow"),
  v.literal("green"),
  v.literal("pink"),
  v.literal("blue"),
  v.literal("purple"),
  v.literal("orange")
);

/** One column of a retro board: a sticky pad with a prompt. */
export const retroColumnValidator = v.object({
  id: v.string(),
  title: v.string(),
  emoji: v.string(),
  color: stickyColorValidator,
});

/**
 * A retro's state, held on its room row the way poker holds its round: the
 * step, the columns, the two settings, and where the discussion is.
 */
export const retroStateValidator = v.object({
  step: retroStepValidator,
  columns: v.array(retroColumnValidator),
  votesPerPerson: v.number(),
  showAuthors: v.boolean(),
  /** The topic (a loose sticky or a stack's root) the discussion is on. */
  focusStickyId: v.optional(v.id("retroStickies")),
  /** The retro started from this one's wrap-up, for everyone to follow. */
  nextRoomId: v.optional(v.id("rooms")),
});

/** A GIF on a sticky: a media link from an allowed host and its size. */
export const gifValidator = v.object({
  url: v.string(),
  width: v.number(),
  height: v.number(),
  title: v.optional(v.string()),
});

export default defineSchema({
  rooms: defineTable({
    name: v.string(),
    autoCompleteVoting: v.boolean(),
    autoRevealCountdownStartedAt: v.optional(v.number()), // Timestamp when countdown began
    autoRevealScheduledId: v.optional(v.id("_scheduled_functions")), // Scheduled function ID for auto-reveal
    // Room type: undefined and "canvas" are poker rooms (legacy rows carry
    // undefined); "retro" is a retrospective (ADR-0013). Keys the permission
    // category set in getEffectivePermissions.
    roomType: v.optional(v.union(v.literal("canvas"), v.literal("retro"))),
    isGameOver: v.boolean(),
    votingScale: v.optional(
      v.object({
        type: v.union(
          v.literal("fibonacci"),
          v.literal("standard"),
          v.literal("tshirt"),
          v.literal("custom")
        ),
        cards: v.array(v.string()),
        isNumeric: v.boolean(),
      })
    ),
    // Issues panel feature
    currentIssueId: v.optional(v.id("issues")), // Currently active issue being voted
    nextIssueNumber: v.optional(v.number()), // Counter for sequential IDs (1, 2, 3...)
    createdAt: v.number(),
    lastActivityAt: v.number(),
    // Retention: a retained room is never swept for inactivity. True for a
    // retro created by (or later owned by) a permanent account; false for
    // every poker room and every guest retro.
    retained: v.boolean(),
    // Room permissions & ownership
    ownerId: v.optional(v.id("users")),
    // Stored permissions carry either the poker shape or the retro shape;
    // getEffectivePermissions picks by roomType and falls back to that type's
    // defaults. Undefined on legacy rows (ADR-0013).
    permissions: v.optional(
      v.union(pokerPermissionsValidator, retroPermissionsValidator)
    ),
    // The retro's state; set on every retro room, never on a poker room.
    retro: v.optional(retroStateValidator),
  })
    .index("by_retention_activity", ["retained", "lastActivityAt"]) // The sweep: non-retained rooms by staleness
    .index("by_created", ["createdAt"]) // For querying recent rooms
    .index("by_owner", ["ownerId"]), // For transferring ownership on account linking

  issues: defineTable({
    roomId: v.id("rooms"),
    sequentialId: v.number(), // 1, 2, 3... displayed as PP-1, PP-2, etc.
    title: v.string(), // e.g., "CC-278" or "User authentication"
    finalEstimate: v.optional(v.string()), // Consensus value after reveal
    status: v.union(
      v.literal("pending"), // Not yet voted
      v.literal("voting"), // Currently being voted on
      v.literal("completed") // Voting complete
    ),
    votedAt: v.optional(v.number()), // Timestamp when voting completed
    // Vote statistics snapshot (stored when voting is revealed)
    voteStats: v.optional(
      v.object({
        average: v.optional(v.number()), // Average of numeric votes
        median: v.optional(v.number()), // Median of numeric votes
        agreement: v.number(), // Percentage of votes matching consensus
        voteCount: v.number(), // Total votes cast
        timeToConsensusMs: v.optional(v.number()), // Total voting duration across all rounds
      })
    ),
    createdAt: v.number(),
    order: v.number(), // For ordering in the list
  })
    .index("by_room", ["roomId"])
    .index("by_room_order", ["roomId", "order"]),

  // Global user identity (one per person)
  users: defineTable({
    authUserId: v.string(), // BetterAuth ID (required, unique)
    name: v.string(),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    accountType: v.optional(v.union(v.literal("anonymous"), v.literal("permanent"))),
    createdAt: v.number(),
  })
    .index("by_auth_user", ["authUserId"])
    .index("by_email", ["email"]),

  // A sticky on a retro board. The author is always stored and never leaves
  // the server unless the retro shows authors; the column is content, the
  // position is layout.
  retroStickies: defineTable({
    roomId: v.id("rooms"),
    clientId: v.string(), // client-minted: the board's node key and the create dedupe key
    columnId: v.string(),
    text: v.string(),
    gif: v.optional(gifValidator),
    authorId: v.id("users"),
    position: v.object({ x: v.number(), y: v.number() }),
    // The sticky this one is stacked under; stacks are one level deep.
    stackId: v.optional(v.id("retroStickies")),
    createdAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_client", ["roomId", "clientId"])
    .index("by_stack", ["stackId"])
    .index("by_author", ["authorId"]),

  // One vote: one person, one sticky. Totals stay hidden until the discussion.
  retroStickyVotes: defineTable({
    roomId: v.id("rooms"),
    stickyId: v.id("retroStickies"),
    voterId: v.id("users"),
  })
    .index("by_room", ["roomId"])
    .index("by_room_voter", ["roomId", "voterId"])
    .index("by_sticky", ["stickyId"])
    .index("by_voter", ["voterId"]),

  // An action item: what the team agreed to do, and who does it.
  retroActionItems: defineTable({
    roomId: v.id("rooms"),
    text: v.string(),
    done: v.boolean(),
    ownerId: v.optional(v.id("users")),
    // Copied from the previous retro by "Start next retro".
    carriedOver: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_owner", ["ownerId"]),

  // GIF search traffic, one row per hour, for watching GIPHY's hourly rate
  // limit: how many searches the app served (answers from Next's cache
  // included, so an upper bound on calls to GIPHY) and how many GIPHY
  // refused. Counts only: no search terms, no people.
  gifSearchUsage: defineTable({
    hour: v.number(), // the hour's start, in ms since the epoch (UTC)
    requests: v.number(),
    rateLimited: v.number(),
  }).index("by_hour", ["hour"]),

  // Room memberships (user <-> room relationship)
  roomMemberships: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"), // FK to global users
    isSpectator: v.boolean(),
    role: v.optional(
      v.union(
        v.literal("owner"),
        v.literal("facilitator"),
        v.literal("participant")
      )
    ),
    joinedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["userId"])
    .index("by_room_user", ["roomId", "userId"]),

  votes: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),
    cardLabel: v.optional(v.string()),
    cardValue: v.optional(v.number()),
    cardIcon: v.optional(v.string()),
  })
    .index("by_room", ["roomId"])
    .index("by_room_user", ["roomId", "userId"])
    .index("by_user", ["userId"]), // For user-specific queries

  // Canvas persistence tables
  canvasNodes: defineTable({
    roomId: v.id("rooms"),
    nodeId: v.string(), // e.g., "player-userId", "session-current", "note-issueId"
    type: v.union(
      v.literal("player"),
      v.literal("session"),
      v.literal("timer"),
      v.literal("results"),
      v.literal("story"),
      v.literal("note"),
      // Retro boards
      v.literal("retro"),
      v.literal("pad"),
      v.literal("actions")
    ),
    position: v.object({ x: v.number(), y: v.number() }),
    data: v.any(), // Node-specific data
    isLocked: v.optional(v.boolean()), // Prevent accidental moves
    lastUpdatedBy: v.optional(v.id("users")),
    lastUpdatedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_node", ["roomId", "nodeId"])
    .index("by_room_type", ["roomId", "type"]) // For type-specific queries
    .index("by_last_updated", ["lastUpdatedAt"]) // For activity tracking
    .index("by_last_updated_by", ["lastUpdatedBy"]), // For account linking transfers

  // Voting round timestamps for time-to-consensus tracking
  votingTimestamps: defineTable({
    roomId: v.id("rooms"),
    issueId: v.id("issues"),
    votingStartedAt: v.number(),
    votingEndedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    roundNumber: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_room", ["roomId"]),

  // Individual vote snapshots for voter alignment analytics
  individualVotes: defineTable({
    roomId: v.id("rooms"),
    issueId: v.id("issues"),
    userId: v.id("users"),
    cardLabel: v.string(),
    cardValue: v.optional(v.number()),
    consensusLabel: v.optional(v.string()),
    consensusValue: v.optional(v.number()),
    deltaSteps: v.optional(v.number()), // scale index diff from consensus
    votedAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_user", ["userId"])
    .index("by_room_user_issue", ["roomId", "userId", "issueId"])
    .index("by_room", ["roomId"]),

  // Per-room analytics snapshot: the completed-issue history behind every
  // analytics dashboard projection. One row per room, recomputed when a voting
  // round completes its target issue (see model/votingRound.ts); the analytics
  // queries project from it purely and fall back to a live scan when no fresh
  // snapshot exists (see model/analytics.ts).
  roomAnalyticsSnapshots: defineTable({
    roomId: v.id("rooms"),
    history: v.object({
      completedIssues: v.array(
        v.object({
          title: v.string(),
          votedAt: v.optional(v.number()),
          finalEstimate: v.optional(v.string()),
          voteStats: v.optional(
            v.object({
              agreement: v.number(),
              timeToConsensusMs: v.optional(v.number()),
            })
          ),
        })
      ),
      individualVotes: v.array(
        v.object({
          userId: v.id("users"),
          cardLabel: v.string(),
          consensusLabel: v.optional(v.string()),
          deltaSteps: v.optional(v.number()),
          votedAt: v.number(),
        })
      ),
    }),
    computedAt: v.number(),
  }).index("by_room", ["roomId"]),

  // Integration connections (user-level OAuth tokens, encrypted)
  integrationConnections: defineTable({
    userId: v.id("users"),
    provider: providerValidator,
    // Encrypted OAuth tokens (AES-256-GCM)
    encryptedAccessToken: v.string(),
    accessTokenIv: v.string(),
    accessTokenAuthTag: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
    refreshTokenAuthTag: v.optional(v.string()),
    expiresAt: v.number(), // Token expiry timestamp
    // Provider-specific metadata
    providerUserId: v.optional(v.string()),
    providerUserEmail: v.optional(v.string()),
    // Jira-specific
    cloudId: v.optional(v.string()), // Jira Cloud ID
    siteUrl: v.optional(v.string()), // e.g., "https://yourteam.atlassian.net"
    scopes: v.array(v.string()),
    connectedAt: v.number(),
    lastRefreshedAt: v.number(),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_provider", ["provider"]),

  // Room-to-provider project/board mapping
  integrationMappings: defineTable({
    roomId: v.id("rooms"),
    connectionId: v.id("integrationConnections"),
    provider: providerValidator,
    // Jira mapping
    jiraProjectKey: v.optional(v.string()),
    jiraBoardId: v.optional(v.number()),
    jiraSprintId: v.optional(v.number()),
    storyPointsFieldId: v.optional(v.string()), // e.g., "customfield_10016"
    jiraWebhookId: v.optional(v.string()), // Registered Jira webhook ID
    jiraWebhookRegisteredAt: v.optional(v.number()),
    // GitHub mapping (Epic 7)
    githubRepo: v.optional(v.string()),
    githubProjectId: v.optional(v.string()),
    // Sync settings
    autoImport: v.boolean(),
    autoPushEstimates: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_connection", ["connectionId"])
    .index("by_provider_autopush", ["provider", "autoPushEstimates"]), // For webhook-refresh sweep

  // Bidirectional links between AgileKit issues and external issues
  issueLinks: defineTable({
    issueId: v.id("issues"),
    // Denormalized room ownership so room-level readers (export, cascades) can
    // fetch a room's links in one indexed query. by_room is authoritative for
    // room-level reads; rows predating the field are healed by the
    // backfillIssueLinksRoomId migration.
    roomId: v.optional(v.id("rooms")),
    provider: providerValidator,
    externalId: v.string(), // Jira issue key (e.g., "PROJ-123") or GitHub issue number
    externalUrl: v.string(), // Direct link to the issue
    lastSyncedAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_room", ["roomId"])
    .index("by_external", ["provider", "externalId"]),

  // Shared webhook dedup table (Jira, GitHub, Paddle)
  webhookEvents: defineTable({
    eventKey: v.string(), // Stable dedup key
    provider: v.string(), // "jira" | "github" | "paddle"
    processedAt: v.number(),
  })
    .index("by_event_key", ["eventKey"])
    .index("by_processed", ["processedAt"]),
});
