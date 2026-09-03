# A retro is one room, with its ceremony state in a row beside it

**Status:** accepted — decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) via [#264](https://github.com/spokvulcan/poker-planning/issues/264). Specified, not yet built. This is the schema the implementation spec is made of; it extends `convex/schema.ts` on paper only.

Every earlier retro decision handed this ticket a field, and the job here was to give them a home that survives two facts about the codebase. First, the `rooms` row is the most widely read document in the system: every authorization guard reads it and every member subscribes to `api.rooms.get`, so anything that lives on it invalidates everyone whenever it changes (`docs/research/convex-realtime-board.md` §3.2, §5). Second, the chosen board is a **canvas** ([ADR-0011](0011-the-retro-board-is-one-canvas-with-semantic-zoom.md)), which quietly retires the research's central ordering recommendation — fractional index keys were the answer for a column board, and a card on a canvas has a position, not a rank.

So: **`rooms` stays the identity and access row, and a `retros` table holds exactly one row per retro room with the ceremony state** — attribution, the copied format, the stamped stage list, the shared pointer and the discussion walk. Cards, clusters, dots and action items are their own tables. One room is one retro; the **Team** is the series ([ADR-0008](0008-a-team-is-the-permanent-visibility-boundary.md)), so there is no predecessor pointer and carryover is a query over the team's open actions. Dots target either a card or a **cluster**, one row per dot, scoped to the stage entry that collected them. The board is read through three subscriptions split by churn, and the shared one is identity-free so twelve viewers share one cached result and hidden text is never in it.

## Considered Options

- **Widen `rooms` with optional retro fields** (rejected). Every walk step and stage advance would invalidate every member's room subscription and every guard's read, and the row already carries seven poker-only optionals; adding a dozen more makes it a grab bag nobody can validate.
- **A table-level discriminated union on `rooms.roomType`** (rejected). Cleaner on paper, but `roomType` is optional on every existing row, so it is a widen → backfill → narrow migration of the hottest table for a benefit the sidecar row delivers without one. ADR-0013's `permissions` union stays on `rooms` as decided; it is per-room configuration, not ceremony state.
- **`retros` as the ceremony row beside `rooms`** (chosen). Guards and the room subscription never see ceremony churn; poker's row is untouched; the two rows are created in one mutation.
- **One room hosting many retros over time** (rejected). The Team already gives continuity, and a many-retros room would need a "current retro" pointer, a way to close one, and a story for a room whose retros disagree on attribution. Reuse is *New retro* on the team page.
- **A fractional `orderKey` on cards** (rejected, superseded by the canvas). Position is the order. Prompt order is a small integer on the format snapshot.
- **Deriving a card's prompt from which zone its position falls in** (rejected). The prompt someone answered is content; where they dropped the card is layout. Deriving it would change the silhouette count per prompt when a card is nudged across a zone edge, and the phone's async write flow picks a prompt with no spatial step at all.
- **Votes on cards only, cluster tally as the sum** (rejected). During `vote` the unit people vote on is the topic — a named cluster or a loose card, the definition the walk already uses — and a dot placed on a cluster has no honest single card to land on.
- **A member array or a denormalised count on the cluster row** (rejected). The unbounded-list shape the Convex guidelines forbid, and the maximal contention point.
- **A stored default format on the Team** (rejected). The picker pre-selects what the team used last, read from its newest retro; a stored preference is a second thing to keep in sync for a choice made by habit.

## Consequences

### Tables

```ts
// rooms — unchanged shape plus what earlier ADRs added; no ceremony state here
rooms: {
  ...existing,
  roomType: v.optional(v.union(v.literal("canvas"), v.literal("retro"))),
  teamId: v.optional(v.id("teams")),                  // set once (ADR-0008)
  joinPolicy: v.optional(v.union(v.literal("anyone"), v.literal("permanentAccounts"), v.literal("teamMembers"))),
  permissions: v.optional(v.union(pokerPermissions, retroPermissions)), // ADR-0013
}  // + .index("by_team", ["teamId"])

retros: {
  roomId: v.id("rooms"),                              // exactly one per retro room
  attribution: v.union(v.literal("named"), v.literal("anonymous")),   // ADR-0012
  format: v.object({                                  // copied at creation, never referenced
    name: v.string(),
    prompts: v.array(v.object({ id: v.string(), label: v.string(), hint: v.optional(v.string()), color: v.string(), order: v.number() })),
  }),
  stages: v.array(v.object({                          // the stamped stage list (ADR-0010)
    id: v.string(),
    kind: v.union(v.literal("collect"), v.literal("review"), v.literal("group"), v.literal("vote"), v.literal("discuss"), v.literal("close")),
    cardsVisible: v.union(v.literal("hidden"), v.literal("visible")),   // ADR-0015
    tallyVisible: v.union(v.literal("hidden"), v.literal("visible")),
    voteBudget: v.optional(v.number()),
    maxPerTopic: v.optional(v.number()),
    timeboxMinutes: v.optional(v.number()),
  })),
  currentStageId: v.string(),                         // the shared pointer
  walk: v.optional(v.object({                         // snapshotted on entering discuss
    stageEntryId: v.string(),
    order: v.array(topicRef),
    cursor: v.number(),
    covered: v.array(v.string()),
  })),
}  // .index("by_room", ["roomId"])

retroCards: {
  roomId: v.id("rooms"),
  text: v.string(),
  promptId: v.string(),                               // the prompt answered; carries the tint
  position: v.object({ x: v.number(), y: v.number() }),
  authorId: v.optional(v.id("users")),                // exactly one of these two (ADR-0012)
  editKeyHash: v.optional(v.string()),
  clusterId: v.optional(v.id("retroClusters")),
  createdAt: v.number(),
  updatedAt: v.number(),
  committedAt: /* commit-timestamp field per the Convex docs */,  // for "new since last visit"
}  // .index("by_room", ["roomId"]) .index("by_room_author", ["roomId", "authorId"]) .index("by_cluster", ["clusterId"])

retroClusters: {
  roomId: v.id("rooms"),
  name: v.string(),
  createdAt: v.number(),
}  // .index("by_room", ["roomId"])

retroVotes: {                                         // one row per dot
  roomId: v.id("rooms"),
  stageEntryId: v.string(),                           // two vote stages are two rounds
  voterId: v.id("users"),                             // mandatory even when anonymous (ADR-0012)
  target: topicRef,                                   // { kind: "card" | "cluster", id }
}  // .index("by_room_entry", ["roomId", "stageEntryId"]) .index("by_room_entry_voter", ["roomId", "stageEntryId", "voterId"])

retroActions: {                                       // fields are #265's; the home is fixed here
  roomId: v.id("rooms"),
  teamId: v.optional(v.id("teams")),                  // denormalised for the team page
  status: ...,
  ...
}  // .index("by_room", ["roomId"]) .index("by_team_status", ["teamId", "status"])

teams: {
  name: v.string(),
  inviteToken: v.string(),                            // rotatable (ADR-0008)
  retroDefaults: v.object({ attribution, joinPolicy, permissions: retroPermissions }),  // ADR-0013
  createdAt: v.number(),
}
teamMemberships: {
  teamId: v.id("teams"),
  userId: v.id("users"),
  role: v.union(v.literal("admin"), v.literal("member")),
  joinedAt: v.number(),
}  // by_team, by_user, by_team_user
```

### Rules the schema carries

- **One room, one retro.** `retros` is 1:1 with retro rooms and both rows are written in the creation mutation. There is no `previousRetroId`; carryover reads the team's open `retroActions`. A team may have any number of retros in `collect` at once — nothing structural needs a "current retro", and forbidding it would need someone to close the stuck one.
- **The prompt is stored, position is layout.** Moving a card never changes `promptId`; changing it is an edit. Silhouette counts per prompt (ADR-0015) therefore never move because a card was nudged.
- **No order key, no size, no editor trail** on cards. Position is the order; card size is a function of zoom level; the author never changes and no editor is recorded (ADR-0012).
- **Commit timestamp from day one.** `_creationTime` does not reflect commit order (research §7.3), and a later backfill cannot recover it. The "new since your last visit" affordance stays in the fog; its field does not.
- **A cluster is a row with a name.** Members point at it; it stores no position, no member list, no count. Merge re-points members and deletes the empty row; dissolve nulls every member's `clusterId`. The label chip is anchored at the members' centroid at render time.
- **Dots target topics, one row per dot.** A topic is a named cluster or a loose card. Dots placed on a card before it is grouped carry into the cluster's tally (own dots plus members' dots). Merging re-points cluster dots; dissolving a cluster that has dots deletes them behind a confirmation, as a `cardManagement` act (ADR-0013). Budget is a count of the voter's rows for the entry, so stacking is free. `voteBudget` defaults to 5 and `maxPerTopic` to unlimited; both are per-entry data seeded by the format.
- **Tally visibility is per-entry data**: `hidden` on `vote` entries, `visible` everywhere else, a voter always sees their own dots, projected server-side by the same function as cards (ADR-0015).
- **The format is copied whole**, prompts included, extending ADR-0010's copy rule so a retro read years later renders its prompts as run. What a format contains and which ship is [the format library](https://github.com/spokvulcan/poker-planning/issues/275)'s; the seed's shape is fixed here. Both arrays are bounded (≤10 each) and live on the row.
- **The walk lives on the `retros` row.** A retro produces a dozen or two walk steps; that is not churn worth a table, and the structure query wants it anyway.
- **Action items are their own table, denormalised to the team.** `by_team_status` is what lets the team page list open actions without walking rooms (ADR-0014). Whether an action outlives the retro that created it is [#265](https://github.com/spokvulcan/poker-planning/issues/265)'s; until it says otherwise an action row dies with its room.
- **No stored default format on the Team.** The picker pre-selects the newest retro's format, else the shipped default.

### Reads

Three subscriptions, split by churn rate (research §5.3):

| Query | Returns | Identity |
|---|---|---|
| `retro.board` | `retros` row, clusters, every card projected by the **shared pointer's** reveal policy — silhouette (id, position, `promptId`, `clusterId`) or full card | none: all viewers share one cached result |
| `retro.mine` | full text of the viewer's own cards — by `by_room_author` in a named retro, by presented **edit keys** in an anonymous one | per viewer |
| `retro.tally` | `Record<topicId, count>` pre-aggregated, plus the viewer's own dots; mounted only while the pointer is in `vote` or `discuss` | per viewer, small |

Hidden text never enters the shared query, so the ADR-0015 projection is structural rather than a filter a future surface can forget. Export ([#267](https://github.com/spokvulcan/poker-planning/issues/267)) reads through the same projection.

### Cascade and sweep

- `retros`, `retroCards`, `retroClusters`, `retroVotes` and `retroActions` join `ROOM_OWNED_TABLES` so a room delete (an expired teamless retro, or a team deleting one) cascades in bounded steps as today.
- They are **excluded from the daily orphan full-scan** (`cleanupOrphanedData`), which would otherwise scan permanently retained tables against a fixed transaction budget every day (research §7.4).
- The retention discriminator on `rooms` and the compound activity index belong to [retention, deletion and export](https://github.com/spokvulcan/poker-planning/issues/267); the liveness clock to [does a retro write bump room activity](https://github.com/spokvulcan/poker-planning/issues/269). Neither is pre-empted here beyond the note that `retroCards` writes are expected not to touch the `rooms` row.

### Tests that enforce this

Creating a retro writes `rooms` and `retros` in one mutation; advancing a stage or marking coverage leaves the `rooms` row untouched; nudging a card leaves `promptId` untouched; a dot on a card counts toward its cluster's tally after grouping; dissolving a cluster with dots requires `cardManagement` and deletes them; the budget is enforced per stage entry, so a second `vote` entry starts fresh; `retro.board` returns identical bytes for two different viewers while the pointer is in `collect`; the room cascade empties every retro table.
