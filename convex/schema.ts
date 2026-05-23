import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    name: v.string(),
    autoCompleteVoting: v.boolean(),
    autoRevealCountdownStartedAt: v.optional(v.number()), // Timestamp when countdown began
    autoRevealScheduledId: v.optional(v.id("_scheduled_functions")), // Scheduled function ID for auto-reveal
    roomType: v.optional(v.literal("canvas")), // Optional for backward compatibility
    isGameOver: v.boolean(),
    // Deprecated (ADR-0003): the Demo is now client-side, so nothing writes this.
    // Drop it — with roomMemberships.isBot and the demo filter in model/cleanup.ts
    // — only after `npx convex run cleanupDemo:purgeDemoRoom` has run in prod.
    isDemoRoom: v.optional(v.boolean()),
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
    // Room permissions & ownership
    ownerId: v.optional(v.id("users")),
    permissions: v.optional(
      v.object({
        revealCards: v.union(
          v.literal("everyone"),
          v.literal("facilitators"),
          v.literal("owner")
        ),
        gameFlow: v.union(
          v.literal("everyone"),
          v.literal("facilitators"),
          v.literal("owner")
        ),
        issueManagement: v.union(
          v.literal("everyone"),
          v.literal("facilitators"),
          v.literal("owner")
        ),
        roomSettings: v.union(
          v.literal("everyone"),
          v.literal("facilitators"),
          v.literal("owner")
        ),
      })
    ),
  })
    .index("by_activity", ["lastActivityAt"])
    .index("by_created", ["createdAt"]), // For querying recent rooms

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

  // Room memberships (user <-> room relationship)
  roomMemberships: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"), // FK to global users
    isSpectator: v.boolean(),
    // Deprecated (ADR-0003): see rooms.isDemoRoom — drop after purgeDemoRoom runs.
    isBot: v.optional(v.boolean()),
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
      v.literal("note")
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
    .index("by_room_user", ["roomId", "userId"])
    .index("by_room", ["roomId"]),

  // Integration connections (user-level OAuth tokens, encrypted)
  integrationConnections: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("jira"), v.literal("github")),
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
    provider: v.union(v.literal("jira"), v.literal("github")),
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
    .index("by_connection", ["connectionId"]),

  // Bidirectional links between AgileKit issues and external issues
  issueLinks: defineTable({
    issueId: v.id("issues"),
    provider: v.union(v.literal("jira"), v.literal("github")),
    externalId: v.string(), // Jira issue key (e.g., "PROJ-123") or GitHub issue number
    externalUrl: v.string(), // Direct link to the issue
    lastSyncedAt: v.number(),
  })
    .index("by_issue", ["issueId"])
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
