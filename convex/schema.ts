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

/** Who may join a room (ADR-0013, spec §4.4). */
export const joinPolicyValidator = v.union(
  v.literal("anyone"),
  v.literal("permanentAccounts"),
  v.literal("teamMembers")
);

/** Whether a retro's cards carry their author (ADR-0012). */
export const attributionValidator = v.union(
  v.literal("named"),
  v.literal("anonymous")
);

/**
 * The bundle a Team carries and copies by value onto every retro created in
 * it (ADR-0013, spec §5): default attribution, join policy and the four retro
 * permission levels.
 */
export const retroDefaultsValidator = v.object({
  attribution: attributionValidator,
  joinPolicy: joinPolicyValidator,
  permissions: retroPermissionsValidator,
});

/** A Team membership's standing (ADR-0008). */
export const teamRoleValidator = v.union(
  v.literal("admin"),
  v.literal("member")
);

/** A retro stage entry's kind (ADR-0010, spec §2). */
export const stageKindValidator = v.union(
  v.literal("collect"),
  v.literal("review"),
  v.literal("group"),
  v.literal("vote"),
  v.literal("discuss"),
  v.literal("close")
);

/** A per-entry reveal policy (ADR-0015): cards or tally, hidden or visible. */
export const visibilityValidator = v.union(
  v.literal("hidden"),
  v.literal("visible")
);

/** What a dot, a walk entry or an action item points at: a card or a cluster. */
export const topicRefValidator = v.union(
  v.object({ kind: v.literal("card"), id: v.id("retroCards") }),
  v.object({ kind: v.literal("cluster"), id: v.id("retroClusters") })
);

/**
 * A retro's format, copied whole onto the retro at creation and never
 * referenced (ADR-0021): a name and up to ten prompts. The picker line the
 * library carries is not part of it.
 */
export const retroFormatValidator = v.object({
  name: v.string(),
  prompts: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      hint: v.optional(v.string()),
      color: v.string(),
      order: v.number(),
    })
  ),
});

/** One entry of the stamped stage list (ADR-0010, ADR-0015, ADR-0016). */
export const retroStageValidator = v.object({
  id: v.string(),
  kind: stageKindValidator,
  cardsVisible: visibilityValidator,
  tallyVisible: visibilityValidator,
  voteBudget: v.optional(v.number()),
  maxPerTopic: v.optional(v.number()),
  timeboxMinutes: v.optional(v.number()),
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
    // Retention (ADR-0019): true iff the room belongs to a Team, so the
    // five-day sweep leaves it alone. Every row carries it: new rows from
    // the writers, legacy rows from the backfill that ran before this field
    // became required.
    retained: v.boolean(),
    // Room permissions & ownership
    ownerId: v.optional(v.id("users")),
    // Stored permissions carry either the poker shape or the retro shape;
    // getEffectivePermissions picks by roomType and falls back to that type's
    // defaults. Undefined on legacy rows (ADR-0013).
    permissions: v.optional(
      v.union(pokerPermissionsValidator, retroPermissionsValidator)
    ),
    // Admission policy (ADR-0013, spec §4.4). Undefined on poker rooms;
    // "teamMembers" is only meaningful once the room has a Team. Read by
    // evaluateJoin; written by nothing yet.
    joinPolicy: v.optional(joinPolicyValidator),
    // The owning Team (ADR-0008): set once at creation or adoption, never
    // changed or cleared. Undefined on poker rooms and teamless retros.
    teamId: v.optional(v.id("teams")),
  })
    .index("by_retention_activity", ["retained", "lastActivityAt"]) // The sweep: non-retained rooms by staleness
    .index("by_team", ["teamId"]) // A Team's history and its deletion cascade
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
    emailOptOut: v.optional(v.boolean()), // ADR-0020; undefined means opted in
    createdAt: v.number(),
  })
    .index("by_auth_user", ["authUserId"])
    .index("by_email", ["email"]),

  // A Team (ADR-0008): the permanent visibility boundary that owns retro
  // history. Deliberately minimal — a name, a rotatable invite token and the
  // retro defaults it stamps onto new retros.
  teams: defineTable({
    name: v.string(),
    inviteToken: v.string(), // Rotated by any admin; rotation invalidates the old link
    retroDefaults: retroDefaultsValidator,
    createdAt: v.number(),
  }).index("by_invite_token", ["inviteToken"]),

  // Team memberships (user <-> team relationship). Permanent accounts only,
  // enforced in the model layer; written only by consuming the invite link.
  teamMemberships: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
    role: teamRoleValidator,
    joinedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_user", ["userId"])
    .index("by_team_user", ["teamId", "userId"]),

  // The retro's ceremony state, one row beside its room (ADR-0016): written
  // in the same mutation as the room, so the guards and the room
  // subscription never see stage churn.
  retros: defineTable({
    roomId: v.id("rooms"),
    attribution: attributionValidator, // ratchets named → anonymous only (ADR-0012)
    format: retroFormatValidator, // copied whole at creation (ADR-0021)
    stages: v.array(retroStageValidator), // the stamped stage list (ADR-0010); ≤ 10
    currentStageId: v.string(), // the shared pointer
    currentStageEnteredAt: v.number(), // re-stamped by every advance; the timebox counts from it
    walk: v.optional(
      v.object({
        stageEntryId: v.string(),
        snapshotAt: v.number(),
        order: v.array(topicRefValidator),
        cursor: v.number(),
        covered: v.array(v.string()), // topic ids
      })
    ),
    collectUntil: v.optional(v.number()), // advisory cards-due date (ADR-0020)
    lastNudge: v.optional(v.object({ at: v.number(), by: v.id("users") })),
  }).index("by_room", ["roomId"]),

  // A retro card: the prompt answered is content, the position is layout
  // (ADR-0016). Exactly one of authorId / editKeyHash (ADR-0012).
  retroCards: defineTable({
    roomId: v.id("rooms"),
    clientId: v.string(), // client-minted UUID: node key and create dedupe key (ADR-0022)
    text: v.string(),
    promptId: v.string(),
    position: v.object({ x: v.number(), y: v.number() }),
    authorId: v.optional(v.id("users")),
    editKeyHash: v.optional(v.string()),
    clusterId: v.optional(v.id("retroClusters")),
    createdAt: v.number(),
    updatedAt: v.number(),
    committedAt: v.number(), // Date.now() inside the create mutation (spec §23)
  })
    .index("by_room", ["roomId"])
    .index("by_room_author", ["roomId", "authorId"])
    .index("by_room_prompt", ["roomId", "promptId"]) // the prompt-removal check (spec §6.4)
    .index("by_room_client", ["roomId", "clientId"])
    .index("by_cluster", ["clusterId"]),

  // A cluster is a row with a name and nothing else (ADR-0016).
  retroClusters: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_room", ["roomId"]),

  // One row per dot, scoped to the stage entry that collected it.
  retroVotes: defineTable({
    roomId: v.id("rooms"),
    stageEntryId: v.string(),
    voterId: v.id("users"), // always stored, projected away for other readers in an anonymous retro
    target: topicRefValidator,
  })
    .index("by_room", ["roomId"]) // The cascade reads every room-owned table by this name
    .index("by_room_entry", ["roomId", "stageEntryId"])
    .index("by_room_entry_voter", ["roomId", "stageEntryId", "voterId"])
    .index("by_room_target", ["roomId", "target.id"]) // a topic's dots across entries: merge, dissolve
    .index("by_voter", ["voterId"]), // account linking re-points a voter's rows

  // An action item (ADR-0017): one home, denormalised to the Team.
  retroActions: defineTable({
    roomId: v.id("rooms"),
    teamId: v.optional(v.id("teams")),
    text: v.string(),
    ownerId: v.optional(v.id("users")), // zero or one, always named
    dueAt: v.optional(v.number()),
    source: v.optional(topicRefValidator), // nulled when the topic is gone
    status: v.union(v.literal("open"), v.literal("done"), v.literal("dropped")),
    note: v.optional(v.string()), // written only when status leaves open
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    reminderJobId: v.optional(v.id("_scheduled_functions")), // ADR-0020
    // Seam only, never written in v1 (ADR-0017).
    externalRef: v.optional(
      v.object({ provider: providerValidator, key: v.string(), url: v.string() })
    ),
  })
    .index("by_room", ["roomId"])
    .index("by_team_status", ["teamId", "status"]),

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
