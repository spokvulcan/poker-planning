# Retro: build specification

**Status:** assembled from the accepted ADRs of [map #253](https://github.com/spokvulcan/poker-planning/issues/253) on 2026-09-04. Not yet built. The ADRs are the authority on *why*; this file orders them into a build sequence and carries the parts no single ADR holds whole. Where two ADRs disagree, §23 records which reading this spec takes.

Vocabulary is fixed in [`CONTEXT.md`](../../CONTEXT.md) (sections Ceremonies through Testing). This file uses those words and no others: **Team**, **stage**, **advance**, **attribution**, **reveal policy**, **silhouette**, **cluster**, **topic**, **dot**, **discussion walk**, **raise**, **late card**, **action item**, **nudge**, **reminder**, **retro facts**, **history row**, **hand**, **refusal**, **test seam**, **layer rule**.

Conventions the whole build inherits, unchanged: two-layer Convex backend (`convex/*.ts` validates and guards, `convex/model/*.ts` holds the logic); every mutation runs a guard from `convex/model/auth.ts` and never re-implements one; every user-initiated model mutation calls `Rooms.updateRoomActivity`; shadcn over Base UI (`render`, not `asChild`); design tokens from `src/app/globals.css`.

## 1. Build order

Build in this order. Each phase is shippable on its own and nothing in a later phase is needed to keep an earlier one correct. Each ADR is linked here exactly once; the rest of the file refers to them by number.

| Phase | ADR | What it contributes to the build |
|---|---|---|
| 0 Foundations | [ADR-0016](../adr/0016-a-retro-is-one-room-with-its-ceremony-state-beside-it.md) | The schema: `retros` beside `rooms`, cards, clusters, dots, actions, teams; three board reads; cascade membership. §2, §9 |
| 0 | [ADR-0019](../adr/0019-retention-follows-the-team-and-export-never-widens-access.md) | `rooms.retained`, the sweep index and its three-release migration; `delete`; account deletion; export; privacy copy. §3, §15 |
| 0 | [ADR-0009](../adr/0009-room-access-and-room-attendance-are-separate-guards.md) | `requireRoomReader` beside `requireRoomMember`. §4.1 |
| 0 | [ADR-0013](../adr/0013-retro-permissions-extend-the-one-decision.md) | Retro permission categories over the one `evaluate`; `joinPolicy` and `evaluateJoin`; `claim`; the Team retro-defaults bundle. §4 |
| 0 | [ADR-0018](../adr/0018-the-activity-chokepoint-owns-the-clocks-precision.md) | The hourly-coarse clock for retro rooms inside `updateRoomActivity`. §14 |
| 1 Teams | [ADR-0008](../adr/0008-a-team-is-the-permanent-visibility-boundary.md) | The Team: set-once `teamId`, memberships, admin invariant, invite link, write-time disclosure. §5 |
| 2 Creation | [ADR-0010](../adr/0010-a-retro-stage-projects-and-defaults-but-never-forbids.md) | The stage list as stamped data; advance; readiness; advisory timebox; no finished state. §7 |
| 2 | [ADR-0021](../adr/0021-a-custom-format-is-the-last-retros-format.md) | The six formats with prompts, the standard seed, the create form, editing a running retro. §6 |
| 3 Cards | [ADR-0012](../adr/0012-an-anonymous-retro-card-has-no-stored-author.md) | Attribution, the edit key, the ratchet, the vote projection, the write-time copy. §8 |
| 3 | [ADR-0015](../adr/0015-a-hidden-retro-card-is-a-silhouette-projected-by-the-shared-stage.md) | Per-entry reveal policy, the server-side silhouette projection, reveal-on-advance, the in-place toggle. §8 |
| 4 Board | [ADR-0011](../adr/0011-the-retro-board-is-one-canvas-with-semantic-zoom.md) | One React Flow canvas with three zoom levels, cluster as identity, tidy, hulls, touch, mobile chrome. §10 |
| 4 | [ADR-0022](../adr/0022-the-canvass-only-local-state-is-the-hand.md) | The hand, keyed single-flight, one batch move, `clientId`, optimistic functions, `ConvexError` codes, rollback. §10.5 to §10.8 |
| 5 Discussion | [ADR-0023](../adr/0023-the-walk-covers-what-was-voted-for-and-a-person-raises-the-rest.md) | The scoped walk snapshot, `raise`, late-card marker, coverage readout. §12 |
| 5 | [ADR-0017](../adr/0017-an-action-item-has-one-home-and-carries-over-by-staying-open.md) | Action item shape, ownership, three states, `review` as carryover, the integration seam. §13 |
| 6 Email | [ADR-0020](../adr/0020-a-nudge-is-sent-by-a-person-and-a-reminder-by-a-date.md) | `collectUntil`, the nudge, the two reminders, `emailOptOut`, one-click unsubscribe, the send shape. §16 |
| 7 Surfaces | [ADR-0024](../adr/0024-a-retro-shows-facts-and-never-a-measure-of-the-team.md) | Retro facts, the history row, the team page count line, the standing refusals. §17 |
| 7 | [ADR-0014](../adr/0014-retro-is-the-second-ceremony-of-one-toolkit.md) | Routes, dashboard sidebar, team page contents, homepage and `/features`, the claims register, words. §18 |
| 8 Tests | [ADR-0025](../adr/0025-tests-sign-in-through-a-guarded-seam-and-prove-each-guarantee-in-the-cheapest-layer.md) | The layer rule, the test seam, data attributes, twelve Playwright scenarios, CI. §21 |

Prior decisions this build stands on and must not break: [ADR-0001](../adr/0001-lockdown-is-a-denial-reason-not-a-gate.md) (lockdown is a denial reason; exactly one owner-role membership iff the owner is present), [ADR-0005](../adr/0005-room-activity-has-one-model-layer-chokepoint.md) (one writer of `lastActivityAt`), [ADR-0006](../adr/0006-integration-providers-sit-behind-a-registry.md) (provider registry), [ADR-0007](../adr/0007-analytics-read-from-a-write-time-snapshot.md) (poker analytics compares `computedAt` to `lastActivityAt` exactly, which is why poker's clock stays exact).

## 2. Schema

One listing, reconciled across ADR-0016 (the base), ADR-0012, ADR-0013, ADR-0017, ADR-0019, ADR-0020, ADR-0022, ADR-0023 and ADR-0025. Everything below is new or additive to `convex/schema.ts`; §3 says which additions need a migration.

```ts
// Shared validators (convex/schema.ts, exported like providerValidator)
const permissionLevel = v.union(v.literal("everyone"), v.literal("facilitators"), v.literal("owner"));
const pokerPermissions = v.object({ revealCards: permissionLevel, gameFlow: permissionLevel, issueManagement: permissionLevel, roomSettings: permissionLevel }); // today's shape, unchanged
const retroPermissions = v.object({ stageFlow: permissionLevel, cardManagement: permissionLevel, actionManagement: permissionLevel, retroSettings: permissionLevel });
const attribution = v.union(v.literal("named"), v.literal("anonymous"));
const joinPolicy = v.union(v.literal("anyone"), v.literal("permanentAccounts"), v.literal("teamMembers"));
const topicRef = v.union(
  v.object({ kind: v.literal("card"), id: v.id("retroCards") }),
  v.object({ kind: v.literal("cluster"), id: v.id("retroClusters") })
);
const stageKind = v.union(v.literal("collect"), v.literal("review"), v.literal("group"), v.literal("vote"), v.literal("discuss"), v.literal("close"));
const visibility = v.union(v.literal("hidden"), v.literal("visible"));

rooms: {
  ...existing,
  roomType: v.optional(v.union(v.literal("canvas"), v.literal("retro"))), // widened literal; still optional, undefined means poker
  permissions: v.optional(v.union(pokerPermissions, retroPermissions)),  // which shape applies is decided by roomType (ADR-0013)
  teamId: v.optional(v.id("teams")),          // set once, never changed (ADR-0008)
  joinPolicy: v.optional(joinPolicy),         // retro rooms only; undefined on poker rooms
  retained: v.boolean(),                      // true iff teamId is set (ADR-0019); optional during the widen release, see §3
  testRun: v.optional(v.string()),            // test seam only (ADR-0025), see §21.3
}
  // existing indexes unchanged, plus:
  .index("by_team", ["teamId"])
  .index("by_retention_activity", ["retained", "lastActivityAt"])   // replaces by_activity after the narrow release

users: {
  ...existing,
  emailOptOut: v.optional(v.boolean()),       // ADR-0020; undefined means opted in
}

teams: {
  name: v.string(),
  inviteToken: v.string(),                    // rotatable (ADR-0008)
  retroDefaults: v.object({ attribution, joinPolicy, permissions: retroPermissions }), // copied by value onto every new team retro (ADR-0013)
  createdAt: v.number(),
  testRun: v.optional(v.string()),
}
  .index("by_invite_token", ["inviteToken"])

teamMemberships: {
  teamId: v.id("teams"),
  userId: v.id("users"),                      // permanent accounts only, enforced in the model layer
  role: v.union(v.literal("admin"), v.literal("member")),
  joinedAt: v.number(),
}
  .index("by_team", ["teamId"]).index("by_user", ["userId"]).index("by_team_user", ["teamId", "userId"])

retros: {                                     // exactly one per retro room, written in the same mutation as the room
  roomId: v.id("rooms"),
  attribution,                                // ratchets named → anonymous only (ADR-0012)
  format: v.object({                          // copied whole at creation, never referenced (ADR-0021)
    name: v.string(),
    prompts: v.array(v.object({ id: v.string(), label: v.string(), hint: v.optional(v.string()), color: v.string(), order: v.number() })), // ≤ 10
  }),
  stages: v.array(v.object({                  // the stamped stage list (ADR-0010); ≤ 10
    id: v.string(),
    kind: stageKind,
    cardsVisible: visibility,                 // reveal policy (ADR-0015)
    tallyVisible: visibility,                 // hidden on vote entries, visible elsewhere (ADR-0016)
    voteBudget: v.optional(v.number()),       // default 5 on vote entries
    maxPerTopic: v.optional(v.number()),      // default unlimited
    timeboxMinutes: v.optional(v.number()),   // advisory (ADR-0010)
  })),
  currentStageId: v.string(),                 // the shared pointer
  currentStageEnteredAt: v.number(),          // re-stamped by every advance; the timebox counts from it (§7)
  walk: v.optional(v.object({                 // snapshotted on entering a discuss entry (ADR-0010, ADR-0023)
    stageEntryId: v.string(),
    snapshotAt: v.number(),
    order: v.array(topicRef),
    cursor: v.number(),
    covered: v.array(v.string()),             // topic ids
  })),
  collectUntil: v.optional(v.number()),       // advisory cards-due date (ADR-0020)
  lastNudge: v.optional(v.object({ at: v.number(), by: v.id("users") })), // ADR-0020
}
  .index("by_room", ["roomId"])

retroCards: {
  roomId: v.id("rooms"),
  clientId: v.string(),                       // client-minted UUID: React Flow node key and create dedupe key (ADR-0022)
  text: v.string(),
  promptId: v.string(),                       // the prompt answered; carries the tint; never changed by a move
  position: v.object({ x: v.number(), y: v.number() }),
  authorId: v.optional(v.id("users")),        // exactly one of authorId / editKeyHash (ADR-0012)
  editKeyHash: v.optional(v.string()),
  clusterId: v.optional(v.id("retroClusters")),
  createdAt: v.number(),
  updatedAt: v.number(),
  committedAt: v.number(),                    // Date.now() inside the create mutation; see §23
}
  .index("by_room", ["roomId"]).index("by_room_author", ["roomId", "authorId"])
  .index("by_room_client", ["roomId", "clientId"]).index("by_cluster", ["clusterId"])

retroClusters: {                              // a row with a name and nothing else
  roomId: v.id("rooms"),
  name: v.string(),
  createdAt: v.number(),
}
  .index("by_room", ["roomId"])

retroVotes: {                                 // one row per dot
  roomId: v.id("rooms"),
  stageEntryId: v.string(),                   // two vote entries are two rounds
  voterId: v.id("users"),                     // always stored, projected away for other readers in an anonymous retro
  target: topicRef,
}
  .index("by_room_entry", ["roomId", "stageEntryId"])
  .index("by_room_entry_voter", ["roomId", "stageEntryId", "voterId"])

retroActions: {
  roomId: v.id("rooms"),
  teamId: v.optional(v.id("teams")),          // denormalised for the team page
  text: v.string(),
  ownerId: v.optional(v.id("users")),         // zero or one, always named
  dueAt: v.optional(v.number()),
  source: v.optional(topicRef),               // nulled when the cluster is dissolved or the card deleted
  status: v.union(v.literal("open"), v.literal("done"), v.literal("dropped")),
  note: v.optional(v.string()),               // written only when status leaves open
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  reminderJobId: v.optional(v.id("_scheduled_functions")), // ADR-0020
  externalRef: v.optional(v.object({ provider: providerValidator, key: v.string(), url: v.string() })), // seam only, never written in v1 (ADR-0017)
}
  .index("by_room", ["roomId"]).index("by_team_status", ["teamId", "status"])

testMagicLinks: {                             // test seam only (ADR-0025)
  email: v.string(),
  url: v.string(),
  createdAt: v.number(),
}
  .index("by_email", ["email"])
```

Rules the schema carries (ADR-0016): one room is one retro and both rows are written in the creation mutation; there is no predecessor pointer; the prompt is content and position is layout; there is no order key, no card size and no editor trail; a cluster stores no position, member list or count; dots target topics and budget is a count of the voter's rows for the entry; the format is copied whole; the walk lives on the `retros` row; action items are denormalised to the team.

`ROOM_OWNED_TABLES` in `convex/model/roomAggregate.ts` gains `retros`, `retroCards`, `retroClusters`, `retroVotes`, `retroActions`, so the existing bounded cascade deletes them. `cleanupOrphanedData` (`convex/model/cleanup.ts`) is given an explicit list that **excludes** those five tables; it must not scan permanently retained tables daily. Team deletion schedules one cascade per team room (`by_team`) and then deletes `teamMemberships` and the `teams` row.

## 3. Migration

Only one field needs staged rollout. Everything else is additive (optional fields, a widened literal union, new tables). The five retro tables (`retros`, `retroCards`, `retroClusters`, `retroVotes`, `retroActions`) ship together with the first retro creation ticket, because they reference one another (`clusterId`, `topicRef`, `source`) and a cascade list edited once is safer than five edits; each optional field ships in the phase that first writes it.

**`rooms.retained`** (ADR-0019), three releases, never two of them in one release:

1. **Widen.** `retained: v.optional(v.boolean())`; add `by_retention_activity`; keep `by_activity`. `createRoom` and the adoption mutation write `retained` on every new row (`true` iff `teamId`). The sweep still reads `by_activity`.
2. **Backfill.** `internalMutation` in the `backfillIssueLinksRoomId` pattern (`convex/migrations.ts`): self-scheduling batches setting `retained: false` on every row where it is undefined. Run to completion before release 3.
3. **Narrow.** `retained: v.boolean()`; drop `by_activity`; `removeInactiveRooms` reads `withIndex("by_retention_activity", q => q.eq("retained", false).lt("lastActivityAt", cutoff))`. The push validates data at rest, so the narrow fails loudly if the backfill is incomplete.

**`rooms.roomType`** needs no migration. It stays optional; the literal union gains `"retro"`. Every reader treats `undefined` as poker: `getEffectivePermissions`, the chokepoint's precision rule (§14), the room page branch (§18.1). ADR-0016 rejected a table-level discriminated union precisely to avoid backfilling the hottest table.

`rooms.permissions` widens to `v.union(pokerPermissions, retroPermissions)`; existing rows already satisfy the first member. `users.emailOptOut`, `rooms.teamId`, `rooms.joinPolicy`, `rooms.testRun` are optional and additive.

## 4. Authorization

### 4.1 Guards (`convex/model/auth.ts`)

| Guard | Question | Who passes | Used by |
|---|---|---|---|
| `requireRoomMember(ctx, roomId)` | Are you *in* this room? | a `roomMemberships` row | every mutation, unchanged; base of `requireActingUser` and `requireCan` |
| `requireRoomReader(ctx, roomId)` (new, ADR-0009) | May you *read* this room's contents? | a room member **or** a member of `rooms.teamId` | read-only queries on room-owned data: `retro.board`, `retro.mine`, `retro.tally`, the actions panel, both exports; also migrate `canvas.getCanvasNodes` and the two issue-export queries to it |
| `requireAuth` / `requireActingUser` / `requireCan` / `requireCanForUser` | unchanged | | |

`rooms.get` stays unguarded: name, roster, `roomType`, `joinPolicy`, the owning team's name and the retention disclosure are readable by anyone with the link (ADR-0008, ADR-0009). Every new read-only query on room-owned data picks one of the two guards; a query that takes neither is a bug, and the convex-test net in §21.1 proves a non-member non-team-member cannot read cards.

Team actions (rename team, rotate invite, change roles, remove member, edit retro defaults, delete team, export history) are guarded by a new `requireTeamRole(ctx, teamId, "admin" | "member")` in the same module. Team role never grants a room power except `claim` (§4.4).

### 4.2 Permission categories (`convex/permissions.ts`, ADR-0013)

`PermissionCategory` becomes a union keyed by room type; `evaluate`, `resolve`, `denialMessage` and `requireCan` keep their shape. `getEffectivePermissions(room)` returns the poker set for `roomType` `"canvas"` or `undefined` and the retro set for `"retro"`; `DEFAULT_RETRO_PERMISSIONS` is the retro fallback. `canDoAction` on the client (`src/hooks/usePermissions.ts`) selects its category set the same way.

| Retro category | Default | Governs |
|---|---|---|
| `stageFlow` | `facilitators` | advance in either direction; the in-place reveal toggle on the current entry; the current entry's timebox; moving the walk cursor and marking coverage; `raise`; sending a nudge |
| `cardManagement` | `facilitators` | editing the text of, deleting or moving *another person's* card; tidy; renaming, merging or dissolving a cluster; deleting dots by dissolving a cluster that has them |
| `actionManagement` | `everyone` | creating, editing, deleting, reassigning or changing the status of action items other than your own |
| `retroSettings` | `facilitators` | renaming the retro; editing the join policy; `collectUntil`; prompt labels, hints, additions and removals; adding, removing or reordering stage entries (§6.4) |

**Never in the config** (always allowed to any member): write a card; edit, move or delete your own card; form a cluster from a selection, add or remove cluster membership; place a dot within budget; set readiness; navigate your own view away from the shared pointer; create an action item; edit, complete, drop or reopen an action item you own; leave. No spectator in retro: `isSpectator` stays on the membership row, always `false`, and the retro join form hides the toggle.

### 4.3 Relationship verbs

`Action`'s relationship member gains three verbs. `requiresOwnerLevel` returns true for `ratchet` and `delete`. `DecisionContext` gains `actorTeamRole?: "admin" | "member"` (populated by the guard only for rooms with a `teamId`) and `ownerInTeam: boolean`. `DenialReason` gains `owner-present`.

| Verb | Level | Effect | Denial copy |
|---|---|---|---|
| `remove`, `promote`, `demote`, `transfer`, `changePerms` | unchanged | unchanged. In a team retro, `remove` ends attendance, not access | unchanged |
| `ratchet` (ADR-0012) | owner | flips `attribution` to `anonymous` and, in the same mutation, strips `authorId` from every card of the room (`by_room`, batched by 500 with `runAfter` continuation when over the limit; the first batch flips the flag so no read ever sees a named card in an anonymous retro). Irreversible. Never strips `voterId`. Allowed on a retro at rest | `owner-absent`: existing copy |
| `delete` (ADR-0019) | owner | hard delete through the room cascade | `owner-absent`: existing copy |
| `claim` (ADR-0013) | `actorTeamRole === "admin"` and (`ownerAbsent` or not `ownerInTeam`); actor must already be a room member | actor becomes `ownerId` and their membership `owner`; the previous owner's membership, if present, becomes `participant` | `owner-present`: "The owner is still here — ask them to transfer ownership." |

The route for a team admin to anonymise or delete a retro whose owner is gone is always `claim` first, then `ratchet` or `delete`. Teamless retros keep plain lockdown; they expire. Retro rooms always have an `ownerId`.

### 4.4 Join policy (ADR-0013)

`evaluateJoin(policy: JoinPolicy, accountType: "anonymous" | "permanent", isTeamMember: boolean): { allowed: true } | { allowed: false; reason: "permanent-account-required" | "team-members-only" }` is a pure function beside `evaluate`, not a branch of it. A team member satisfies every policy. `joinRoom` (`convex/model/users.ts`) calls it before the membership insert and throws a refusal (§4.5) on denial; the join page calls it for its disabled state and copy:

- `permanent-account-required`: "This retro is for signed-in accounts. Sign in to join."
- `team-members-only`: "This retro is for members of {team}. Ask an admin for the invite link."

Values: `anyone` (teamless default), `permanentAccounts`, `teamMembers` (offered only when the room has a `teamId`). Team rooms copy the Team's default at creation.

### 4.5 Refusal codes (ADR-0022)

The retro model layer throws `ConvexError({ code, message? })` with exactly four codes for every rule-based refusal and never a plain `Error` on a rule path: `forbidden` (guard or permission denial, including join denial, with the denial reason as `message`), `budget` (dot budget or per-topic cap reached; a nudge inside its 24-hour window), `missing` (target row gone: card, cluster, action, stage entry), `stage` (an act that needs the shared pointer in a particular kind of entry, such as `raise` outside `discuss` or a nudge outside `collect`). Anything else is a transient failure and is retried by the client (§10.8).

## 5. Teams (ADR-0008)

- **Create.** Any permanent account may create a Team from the dashboard Retros section or from the team picker on `/retro/new`; the creator becomes `admin`. Anonymous accounts see "Sign in to create a team". `retroDefaults` starts as `{ attribution: "named", joinPolicy: "anyone", permissions: DEFAULT_RETRO_PERMISSIONS }`.
- **Invite.** `/team/join/[inviteToken]` consumes the rotatable link: a permanent account becomes `member`; an anonymous account is shown "Sign in to join {team}" and returns after linking (`linkAnonymousToPermanent` needs no change). Any admin may rotate the token, which invalidates the old link. Membership is created by this route and nowhere else; joining a team retro never joins the team.
- **Roles.** `admin` and `member`. Admins rename the team, rotate the invite, promote and demote, remove members, edit the retro-defaults bundle, delete the team. **A Team can never be left without an admin**: the last admin's leave and demote are refused with "Make someone else an admin first, or delete the team." Nobody is auto-promoted.
- **Removal** deletes the `teamMemberships` row and nothing else: no cards, no attribution, no room ejection. The removed person keeps `roomMemberships` they earned and so keeps reading retros they attended (§4.1).
- **`teamId` is set once.** `createRetro` sets it; `adoptIntoTeam(roomId, teamId)` sets it on a teamless retro (actor must be room owner and a member of the team; sets `retained: true`; stamps `teamId` onto the room's existing `retroActions` rows in the same mutation so earlier action items reach the team page and later reviews; never rewrites the stage list, the join policy, the attribution or the permissions). No mutation ever changes or clears it.
- **Write-time disclosure** (with ADR-0019's retention half) is shown in the board header, before the first card is typed, and again in the create flow. It doubles as the link to the team page. Copy in §19.
- **Team page** `/team/[teamId]`, members only: retro history as history rows in creation order (§17); open action items across the team's retros with done, drop, edit and reassign in place (§13); one count line (§17); members with roles, invite link and rotate; the retro-defaults panel (attribution, join policy, four permission levels); *New retro*; *Export history* (§15.4); admin-only *Delete team*. Nothing else.

## 6. Creating a retro (ADR-0021, ADR-0014)

### 6.1 `/retro/new`

Fields: name; team (optional; the picker lists the person's teams and offers *New team*; hidden entirely for an anonymous account, who can only create a teamless retro); format, pre-selected and collapsed to one line, expandable to the library with the team's last-used format first; the "Email the team that it's open" checkbox (team retros only, on by default, remembered nowhere); `collectUntil` (optional date). Pre-selection is the team's newest retro's `format` (edited or not), else Went well, Do differently, Ideas. A first retro never opens with a decision.

Expanding the format shows its prompts and stage list, both editable before stamping: rename or add prompts up to ten, pick a tint from the eight-colour palette, add, remove or reorder stage entries except `collect` and `discuss`, flip `collect` between hidden and visible. The creator may rename an edited format; otherwise it keeps its base name. The edited copy is what is stamped; the shipped constant is never touched.

`createRetro` writes `rooms` (`roomType: "retro"`, `ownerId`, `teamId?`, `joinPolicy` = team default or `anyone`, `permissions` = team default or `DEFAULT_RETRO_PERMISSIONS`, `retained` = has team) and `retros` (`attribution` = team default or `named`, the stamped format and stages, `currentStageId` = the first entry, `collectUntil?`) in one mutation, then the creator's owner membership, then, if the checkbox was on, the "it's open" nudge (§16.2). Any team member may create a team retro; anyone, anonymous included, may create a teamless one.

### 6.2 The library

Six formats as code constants in `convex/model/retroFormats.ts`, all prompts with soft zones on the one canvas, Went well, Do differently, Ideas as the default. Picker descriptions are not copied onto the retro. Hints appear in the write flow only, never on the board. This list is a familiarity choice, not an evidenced one; no study compares formats.

| # | Format | Picker line | Prompts (label — hint) |
|---|---|---|---|
| 1 | **Went well, Do differently, Ideas** (default) | "The familiar three. A good first retro." | *What went well?* — "Something worth keeping. Name what made it work." / *What should we do differently?* — "A change you would make, not a complaint. What would you try instead?" / *Ideas* — "Anything you would like the team to try, even half-formed." |
| 2 | **Start, Stop, Continue** | "Every card asks for a change." | *Continue* — "Something that works and should stay." / *Start* — "Something we do not do yet that would help." / *Stop* — "Something we do that costs more than it gives." |
| 3 | **Glad, Sad, Mad** | "How the sprint felt, glad first." | *Glad* — "What made you glad this sprint?" / *Sad* — "What disappointed you, and what would have helped?" / *Mad* — "What frustrated you? Say what you would change." |
| 4 | **4Ls** | "Liked, learned, lacked, longed for." | *Liked* — "What did you enjoy?" / *Learned* — "Something you know now that you did not before." / *Lacked* — "What was missing, and what would it have changed?" / *Longed for* — "What do you wish we had?" |
| 5 | **Sailboat** | "The team as a boat: what pushes, what drags, what is ahead." | *Wind* — "What is pushing us forward?" / *Island* — "Where are we trying to get to?" / *Anchors* — "What is holding us back, and how would we lift it?" / *Rocks* — "A risk ahead we should steer around." |
| 6 | **Lean Coffee** | "No prompts, just topics. Vote, then talk." | *Topics* — "Something you want the team to talk about. One topic per card." |

Prompt order is as listed (positive-first). No shipped label or hint contains "badly", "wrong" or "didn't"; a node test enforces it. "What went well / What didn't" is not shipped under that name.

### 6.3 The seed

One standard seed for every format: `collect (cardsVisible: hidden, tallyVisible: visible) → review → group → vote (tallyVisible: hidden, voteBudget: 5, maxPerTopic: unlimited) → discuss → close`, all other entries `cardsVisible: visible`, `tallyVisible: visible`, no timeboxes. Lean Coffee overrides `collect` to `visible`. **A teamless retro drops `review` at creation** (a creation rule, not a format rule); adoption into a team never adds it back, a `retroSettings` holder may.

### 6.4 Editing a running retro

Under `retroSettings`: prompt labels and hints at any stage; add a prompt at any stage; remove a prompt only while no card answers it (`missing`-free refusal: `stage` is wrong here, use `forbidden` with message "Cards still answer this prompt"); add, remove or reorder stage entries except `collect`, `discuss` and the current entry. Renaming a prompt changes no card's `promptId`. Past entries are never rewritten. The current entry's `cardsVisible` toggle and `timeboxMinutes` are `stageFlow` acts (§4.2).

## 7. Stages (ADR-0010)

- **Kinds** and what each foregrounds: `collect` (write; prompts as soft zones; silhouettes by default; the collection window; the nudge button; no action affordance), `review` (the team's open action items from other retros, editable in place; empty state "No open actions from earlier retros"), `group` (proximity hulls drawn; select-then-group; tidy), `vote` (dots with the entry's budget; own dots visible, tally hidden), `discuss` (the walk panel, coverage, raise, "Add action" on the current topic), `close` (the actions panel with this retro's actions and the facts line "4 actions, 1 unowned").
- **A stage never forbids.** Writing, editing, grouping, voting and action creation stay open in every stage; entering an empty stage renders an empty state, never a lock. The backend has no stage guard; every retro mutation is correct in every stage, and the convex-test net proves each in an unexpected stage. The only `stage`-coded refusals are acts that reference the current entry's state: `raise` and the walk cursor outside a `discuss` entry with a walk, a nudge outside `collect`.
- **Advance** is `stageFlow`: `advance({ toStageId })` sets `currentStageId` to any entry, forward or back. Leaving `collect` for a visible entry is the reveal (§8.3); entering a `discuss` entry with no walk keyed to it snapshots one (§12.1); re-entering keeps it. Advancing destroys, finalises and hides nothing beyond the read-time projection. Nothing advances itself; timeboxes and `collectUntil` never fire one.
- **Own view.** Any member may navigate their own view to another entry; the projection still follows the shared pointer (§8.3). The board root shows the shared stage; a "Back to the team" affordance returns the view.
- **Readiness** lives in the presence payload (`convex/presence.ts` room data), shown named per person in the roster, cleared when the pointer moves; `collect` has none. In `collect` the roster shows "has written" per person in a named retro and a total card count in an anonymous one.
- **Timebox** is advisory: shown as a countdown on the stage pill, `timeboxMinutes * 60` minus the seconds since `currentStageEnteredAt` computed with `calculateCurrentTime` from `convex/timerState.ts`, never the `TimerNode`; at zero it shows "Timebox over" and nothing else happens.
- **No finished state.** A retro rests where it was left; the history row shows its resting stage.

## 8. Cards, attribution and reveal

### 8.1 Writing a card

`createCard({ roomId, clientId, text, promptId, position })`: the client mints `clientId` (UUID) and picks `promptId` (the phone's write flow picks a prompt with no spatial step; the desktop drops the card in a prompt zone but the stored prompt is the one chosen in the composer). In a named retro the server sets `authorId`; in an anonymous one it mints a random edit key, stores `editKeyHash` (SHA-256), and returns the key once. The client keeps edit keys in `localStorage` under the room id. A retried create with the same `clientId` returns the existing row. `committedAt = createdAt = Date.now()`.

Own-card rights (edit text, move, delete) are proven by `authorId` in a named retro and by presenting the edit key in an anonymous one; a card stripped by the ratchet has neither and is then touchable only under `cardManagement`. A card's author never changes; no editor is recorded.

### 8.2 Attribution (ADR-0012)

`attribution` is per retro, `named` by default, constant across stages, stamped by copy from the Team default, and ratchets one way via the owner-only `ratchet` verb (§4.3), including on a retro at rest. Votes always store `voterId`; the tally projection strips it for everyone but the voter in an anonymous retro; the ratchet never strips it. Presence and the roster stay visible in both modes. Attribution is by reference: a named card renders the author's current display name, or "Former member" when the user row is gone. Action items are never anonymous (§13).

### 8.3 Reveal (ADR-0015)

The projection is one pure function `projectCard(entry, reader, card)` in `convex/model/retro.ts`, applied in every read function and export: when the **shared pointer's** entry has `cardsVisible: "hidden"` and the card is not the reader's own, return `{ _id, clientId, position, promptId, clusterId, late? }` only, in both attribution modes. The read function takes the stage from the `retros` row, never from a client argument. Rewinding into a hidden entry hides every card again; a second `collect` entry hides again. No role peeks. The in-place toggle `setCardsVisible({ stageId: currentStageId, value })` is `stageFlow`. Tallies use the same mechanism with `tallyVisible`; a voter always sees their own dots.

## 9. Board reads (ADR-0016)

| Query | Guard | Returns | Identity |
|---|---|---|---|
| `retro.board({ roomId })` | `requireRoomReader` | the `retros` row (format, stages, pointer, walk, `collectUntil`, `lastNudge`), all clusters, every card through `projectCard` as silhouette or full card, with `late` (§12.3) and, in a named retro, `authorId` | none: identical bytes for every viewer, one cached result |
| `retro.mine({ roomId, editKeys? })` | `requireRoomReader` | full text of the viewer's own cards: `by_room_author` in a named retro, by presented edit keys (hashed and matched) in an anonymous one | per viewer |
| `retro.tally({ roomId })` | `requireRoomReader` | `Record<topicId, count>` for the current entry's votes when `tallyVisible`, always the viewer's own dots; the tally of a cluster is its own dots plus its members' | per viewer, small |

`retro.tally` is mounted only while the shared pointer is in a `vote` or `discuss` entry. Hidden text never enters `retro.board`, so the projection is structural. The room shell (`api.rooms.get`) is unchanged and never carries ceremony state.

## 10. The canvas (ADR-0011, ADR-0022)

### 10.1 Structure

A new React Flow integration under `src/components/retro/`, sharing tokens, shadcn/Base UI components, `Background` dots and drag feel with the poker room and **no canvas code**. Not inherited: `translateExtent` (no cage), `panOnDrag={[1, 2]}` (pan on primary button and trackpad), `useNodeDragBuffer`. Uses `onlyRenderVisibleElements`, marquee selection, `setCenter` / `fitBounds` for the walk.

### 10.2 Semantic zoom

Three levels derived from the viewport zoom in a jsdom-tested pure function: **detail** above 0.70 (full card: text, prompt tint, author chip in a named retro, dots, late marker), **headline** from 0.35 to 0.70 (first line clamped, tint, dots, late marker), **shape** below 0.35 (tinted block; cluster labels held at constant screen size and drawn as the content; late marker as a dot; covered clusters ticked). Silhouettes render as tint-only blocks at every level. Card size is a function of level, never stored.

### 10.3 Clusters, hulls, tidy

A cluster is an identity, not a location: forming one from a selection (everyone) sets `clusterId` on the members and creates the row with a name (default "Group {n}", rename is `cardManagement`); members never move. The label chip is anchored at the members' centroid at render time. Proximity hulls are drawn only while the shared pointer is in a `group` entry, have no identity, and dissolve when a member moves. **Tidy** (`cardManagement`) is the client computing target positions around the centroid and calling the one move batch. Merge re-points members and dots and deletes the empty row; dissolve nulls every member's `clusterId`, nulls matching `retroActions.source`, and, when the cluster has dots, deletes them behind the confirmation "Dissolve this group? Its 4 votes are removed."

### 10.4 Touch and mobile

Primary grouping on touch is tap-select-then-group: tap cards to select (selection state is local), then "Group" in the bottom sheet. Real touch drag, pinch-zoom and hulls are manual-checklist items (§21.4). Mobile chrome: full-bleed canvas, one bottom sheet, one stage pill, no minimap, one card-creation button that opens the composer with a prompt picker. The phone's dominant case is async collection in `collect`, which needs no spatial step.

### 10.5 The hand

Nodes are derived by memo from `retro.board` plus `retro.mine` plus `retro.tally`; there is no `useNodesState` buffer and no copy-in. The only local canvas state is the override map `{ clientId → position }`, written from React Flow position changes while `dragging`, read ahead of the query value, and cleared on drop in the same tick the mutation is issued. Nothing is written on pointer-move; every drop is a write.

### 10.6 Writes and coalescing

`moveCards([{ clientId, position }])` is the one move mutation; a single drop is a batch of one, a marquee drag or tidy is one call. `useSingleFlightMutation(mutation, keyOf)` in `src/hooks/` keeps one request in flight per key (row id, or the sorted id set of a batch) with the latest pending args replacing queued ones; no debounce on drop. Text edits: 300 ms idle debounce plus flush on blur, then keyed single-flight. Presence writes (editing indicator, readiness) use the global single-flight, one write per state change.

### 10.7 Optimistic functions

Optimistic: card move, card create, own-card text edit, own-card delete, dot place and remove, group and ungroup, tidy. Not optimistic: advance, prompt and stage edits, action items, coverage marks, raise, nudge. One module `src/components/retro/optimistic.ts` with one synchronous pure function per optimistic mutation, patching every cached instance of the named query through `getAllQueries`: a move patches `retro.board`; a create inserts into `retro.board` (silhouette or full by the current entry) and `retro.mine`; a text edit patches `retro.mine` and, when the current entry is visible, `retro.board`; a dot patches `retro.tally`; group and ungroup patch `clusterId` in `retro.board`.

### 10.8 Rollback

A `ConvexError` (§4.5) drops the optimistic value at once and shows a `sonner` toast with the reason; any other failure retries three times with backoff, value held, then drops. Text never rolls back: the draft stays with an "Unsaved" chip and retries on the next keystroke or blur; an incoming server value replaces the textarea only while it is unfocused. Dots refuse locally when the viewer's own count in `retro.tally` equals the entry's budget or the topic's `maxPerTopic`. Two people moving one card: last write wins, no lock. No soft locks anywhere.

### 10.9 Data attributes (ADR-0025)

Part of the canvas contract: board root `data-zoom-level="detail|headline|shape"` and `data-stage="{kind}"`; each card `data-card-id="{clientId}"`, `data-hidden="true|false"`, `data-cluster-id`, `data-late="true|false"`; the walk panel `data-covered` and `data-remaining`. Tests assert on these, never on transforms.

## 11. Dots (ADR-0016)

`placeDot({ roomId, target })` and `removeDot({ roomId, target })` on the current entry; refused with `budget` when the voter's rows for the entry equal `voteBudget` or the target's count for that voter equals `maxPerTopic`; refused with `stage` outside a `vote` entry only if the entry has no `voteBudget` (an entry of any kind may carry a budget; the seed puts one on `vote`). Dots on a card carry into its cluster's tally after grouping. A second `vote` entry starts a fresh budget. Dots cast during `discuss` on a topic outside the walk change nothing in the order.

## 12. The discussion walk (ADR-0023)

### 12.1 Snapshot

On entering a `discuss` entry with no walk keyed to it, `advance` writes `walk = { stageEntryId, snapshotAt: Date.now(), order, cursor: 0, covered: [] }`. **When a `vote` entry ran** (any earlier entry in the list with dots), `order` is the topics with at least one dot in that entry, votes descending, ties by creation; **when none ran**, every topic in creation order. A topic is a cluster or a loose card. Re-entry to the same entry keeps the walk; a second `discuss` entry gets its own; nothing auto-extends one.

### 12.2 Cursor, coverage, raise

`stageFlow`: `setWalkCursor({ index })`, `markCovered({ topicId, covered })`, `raise({ topicRef })` which inserts at `cursor + 1`, is a no-op for a topic already in the order, and is refused with `stage` outside a `discuss` entry with a walk. Raise is the only writer of the order after the snapshot; votes and grouping never rewrite it. A cluster formed mid-walk is a new topic outside the walk; its members' entries stay. A dissolved cluster leaves a dangling ref the projection omits and coverage excludes. Moving the cursor calls `setCenter` on the topic for the viewer following the walk.

### 12.3 What the board shows

`late` on a card in `retro.board` is `committedAt > walk.snapshotAt` and its topic outside the order; it clears when the topic is raised or the card joins an in-walk cluster. The marker shows at every zoom level. The walk panel lists the order with covered ticks, then "{n} written since the order was set", then "{n} topics without votes" collapsed, each row with Go (pan) and Raise. The readout is "3 of 10 covered · 2 new": denominator is the live entries in the order, never the topics on the board; at shape level coverage is which in-walk cluster labels are un-ticked.

## 13. Action items (ADR-0017)

- **Shape** as in §2. No priority, description, comments, editor trail, cap or count copy.
- **Creation** never refused, invited in two places only: "Add action" on the walk's current topic in `discuss` (fills `source`), and the actions panel in `close`. Nothing during `collect`. Free-floating actions allowed. Creator and owner are named in both attribution modes; a `source` link renders the card's text and never an author.
- **Ownership** zero or one person, any room member including anonymous accounts; assignable by anyone `actionManagement` allows, no accept step; the owner may always edit, complete, drop or reopen their own. "Nobody owns this yet" is a rendered state. A deleted user renders "Former member"; `linkAnonymousToPermanent` re-points `ownerId`, `createdBy`, `authorId` and `voterId`.
- **States** `open → done | dropped → open`, all reversible; `note` invited only on leaving `open`. Overdue is a rendering state (`dueAt` past and `open`). Delete is a separate `actionManagement` act.
- **Carryover** is the `review` stage: a query `retro.reviewActions({ roomId })` over `by_team_status` for `open` actions whose `roomId` differs, oldest first, with done, dropped, edit and reassign in place. Empty for a teamless retro. A retro's own actions are never in its review.
- **Doors to completion**: the team page, the retro's actions panel (reachable at every stage), `review`. The dashboard shows no actions.
- **Cascade**: an action dies with its room; the delete confirmation names the open count (§19).
- **Seam**: `externalRef` exists on the row and `IntegrationProviderHandler` (`convex/integrations/registry.ts`) may gain an optional `pushAction` capability later; neither is written or called in v1.

## 14. Room activity (ADR-0018)

`updateRoomActivity` reads the room; for `roomType === "retro"` it patches `lastActivityAt` only when the stored value is more than one hour old, otherwise it returns without writing; for every other room it patches unconditionally. Every user-initiated retro model mutation calls it: card write, edit, move and delete; cluster form, rename, merge, dissolve; tidy; dot place and remove; advance, cursor, coverage, raise; action create, edit, status change, delete; nudge; join, leave, rename, join policy, ratchet. Completing an action from the team page counts. Reads, presence, cascades, sweeps, the ratchet's batched strip continuation and the email send action never bump. `convex/roomActivity.test.ts` extends to every retro module, asserting a call. Nothing computes a statistic from the clock.

## 15. Retention, deletion, export (ADR-0019)

### 15.1 Retention

`retained` is true iff `teamId` is set; the sweep (§3) leaves retained rooms alone and deletes every non-retained room, poker or retro, after 5 quiet days on the coarse clock. Keeping a teamless retro means adopting it into a Team (§5). The flag is the seam for any future retention limit; nothing of one ships.

### 15.2 Deletion

`delete` (§4.3) hard-deletes through the cascade with the confirmation in §19. Team deletion (admin) cascades every team room, one scheduled cascade each, with a confirmation naming the retro count. Own cards are always deletable, at rest included, edit key permitting. **Account deletion** for permanent accounts is a *Delete account* action in `/dashboard/settings` that calls `deleteUserByAuthUserId` (what sign-out already does for anonymous accounts); `authorId`, `voterId`, `ownerId`, `createdBy` dangle and render "Former member"; content stays. A team retro whose owner deletes their account enters lockdown and is recovered by `claim`.

### 15.3 Export: one retro as Markdown

`retro.exportMarkdown({ roomId })`, `requireRoomReader`, from the board header menu. Content: retro name, team, created date, format name, the stages walked; each topic (cluster name or lone card) with its cards under their prompts and its dot count; the walk as covered / not covered over the order, then topics outside the walk under their own heading; action items with owner, due date, status and note. Runs through `projectCard`, the attribution projection and the reader guard: a retro in `collect` exports silhouettes as "(hidden card)", an anonymous retro has no authors, no export has voters.

### 15.4 Export: a team's history as JSON

`teams.exportHistory({ teamId })`, any team member, from the team page. One file: every retro in creation order in the same shape `retro.board` returns for that reader, plus the team's action items. No share page of any kind.

## 16. Nudges and reminders (ADR-0020)

### 16.1 Channel

`convex/email.ts` grows into `send` with per-kind templates (`magicLink`, `retroOpen`, `nudge`, `ownerAssigned`, `dueToday`), raw `fetch` to Resend, one call per recipient, from "AgileKit". The mutation records intent and schedules `internal.email.send` with `runAfter(0)`; the action resolves recipients at send time through `ctx.runQuery`, skipping anyone opted out, deleted, address-less or no longer a team member. No send log. Bounces are left to Resend; whether Resend suppresses hard bounces automatically is checked by a person against current Resend documentation before the build relies on it. Teamless retros never email anyone. The magic link ignores `emailOptOut`.

### 16.2 Nudge

`nudge({ roomId })`: `stageFlow`, team retro, shared pointer in `collect`, else `forbidden` / `stage`; refused with `budget` when `lastNudge.at` is within 24 hours. Recipients: named retro, every team member with no card in this retro (`by_room_author`) except the sender; anonymous retro, every team member except the sender. Content: retro name, team name, format name, total card count, `collectUntil` if set, who pressed it, link; reply-to the sender. Never card text, never a non-writer's name, never a per-person count. Button copy: "Email {n} people who haven't written" (named) or "Email {n} team members" (anonymous); after a send "Sent {time} ago by {name}", disabled until the day passes; disabled at zero recipients. The "it's open" email from the create form goes to every team member except the creator and sets `lastNudge`.

### 16.3 Reminders

*Owner assigned*: sent once when `ownerId` is set to someone other than the actor who has an email; content: action text, who assigned it, due date, link. *Due today*: scheduled with `ctx.scheduler.runAt` at **08:00 UTC on `dueAt`'s date** (a documented v1 constant; no timezone is stored) when `dueAt` is set, job id in `reminderJobId`; any change to `dueAt`, `ownerId` or `status` cancels the job and reschedules only if still `open`, owned, and the instant is ahead; a past instant schedules nothing. No overdue email.

### 16.4 Opt-out

`users.emailOptOut`, toggled in Settings ("Email me about retros and action items") and by one-click unsubscribe. The token is `{userId}.{base64url(HMAC-SHA256(userId, UNSUBSCRIBE_SECRET))}` with the Convex env secret `UNSUBSCRIBE_SECRET`, no expiry; the unsubscribe mutation re-derives the MAC, compares it in constant time, flips the flag on a match and nothing on a mismatch, and is the one mutation that runs no auth guard because it must work signed out. It is reached two ways: a `List-Unsubscribe` header pointing at `/api/unsubscribe?token=…`, an API route that answers the RFC 8058 POST (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`) by calling the mutation and returning 200, and a footer link to the `/unsubscribe?token=…` page, which calls the same mutation without sign-in and shows "You won't get retro or action emails. Turn them back on in Settings."

### 16.5 In-app

The dashboard Retros section and the team page list retros whose shared stage is `collect` first, with `collectUntil` if set and, in a named retro, "You haven't added a card yet" for the viewer. No bell, no unread count, no inbox.

## 17. Retro facts (ADR-0024)

**History row**, one component reused by the team page history and the dashboard Retros list, from `retros` and `by_team_status` only: name; format name; created date; attribution; resting stage; the coverage readout when a walk exists ("7 of 10 covered · 1 new"); this retro's action counts ("3 open · 2 done · 1 dropped"). No card count (that is on the board), no last-active time, no per-person figure, no colour by value, no comparative copy. Done and dropped counts are facts, not links; done and dropped actions are reachable only through their home retro's board.

**Team page count line**, above the open-actions list: "3 open · 12 done · 2 dropped across 14 retros", a sum over `by_team_status` and a count of `by_team`.

**Standing refusals**, so they are not re-litigated per PR: nothing per person in either attribution mode; nothing that ranks or orders members; nothing across teams or across the instance; nothing time-based from `rooms.lastActivityAt`; no rate, percentage, score, streak, trend line or comparison to a previous retro; nothing derived from card text; nothing derived from a retro that is not retained; no sentiment including non-AI heuristics; no timebox adherence; no format usage counts. Same view for admin and member; an attendee outside the Team sees the retro's own facts on its board and nothing cross-retro.

## 18. Routes, IA and positioning (ADR-0014)

### 18.1 Routes

| Route | Change |
|---|---|
| `/room/new` | unchanged, poker |
| `/retro/new` | new, §6.1 |
| `/room/[roomId]` | serves both types; branches on `rooms.get().roomType`; the retro join flow applies `evaluateJoin` (§4.4) and hides the spectator toggle; the retro board mounts under it |
| `/team/[teamId]` | new, §5 |
| `/team/join/[inviteToken]` | new, §5 |
| `/unsubscribe` | new, §16.4 |
| `/dashboard` | Overview unchanged |
| `/dashboard/sessions` | URL unchanged; sidebar label becomes **Planning poker**; content unchanged |
| `/dashboard/retros` | new: retros the person attended as history rows, grouped by Team with teamless ones under "No team", `collect` retros first; the person's Teams with *New team*; the door to every team page |
| `/dashboard/settings` | gains "Email me about retros and action items" and, for permanent accounts, *Delete account* |
| `/features` | one page, sections anchored `#planning-poker` and `#retro`; title drops "Planning Poker" |

Sidebar: Overview / Planning poker / Retros / Settings. No new primary-nav item. The team page is reachable from Retros, from the board header disclosure, and from the user menu.

### 18.2 Homepage and metadata

Hero: "Estimate and reflect, without the noise." with two CTAs, *Start estimating* → `/room/new` and *Start a retro* → `/retro/new`. A "two ceremonies, one toolkit" section directly under the hero, one card per ceremony with its own CTA. `how-it-works` tabbed per ceremony; `app-preview` shows both boards (retro screenshots captured from the built board, so copy lands first and images with the implementation); use-cases, FAQ and the pricing section gain retro lines; poker copy and screenshots re-scoped under their ceremony, never deleted. Site default title "Free Planning Poker & Retros Online | AgileKit". About page: "the free, open-source way for distributed Scrum teams to estimate and reflect in writing, everyone at once, with nothing forgotten between sprints." No client-side retro demo.

### 18.3 Claims register

*May say*: written and parallel, everyone at once; async collection before the meeting; permanent history, free, for every team; anonymous link-join; open source; no cameras required. *May not say*: any AI; a workspace or org product; that retros improve delivery or outcomes; that anonymity makes retros better; the meta-analytic effect sizes; "X% of action items never get done"; anything about pricing tiers for retro; that any retro number measures the team.

### 18.4 Words

**Retro** in UI, nav and dashboard; "retrospective" in titles, metadata and long-form copy; "ceremony" only in repo docs; "Session" survives only inside Planning poker; "notification" and "insights" never appear in the product.

## 19. Copy register

Wording may be polished; no claim may be strengthened beyond what the storage supports.

| Where | Copy |
|---|---|
| Board header, team retro | "Kept by {team}. Its members can read this later, until the retro or the team is deleted." |
| Board header, teamless | "Not kept by a team. This retro disappears after 5 quiet days." |
| Composer, named | "Posted as {name}. Your name stays with this card." |
| Composer, anonymous | "Anonymous. Your name is not saved with this card, not even for the facilitator. Edit or delete it from this device." |
| Composer, hidden, named (stacks) | "Only you can read this for now. Others can see you've added a card, not what it says. Everyone reads it once cards are revealed." |
| Composer, hidden, anonymous | "Only you can read this for now. Everyone reads it once cards are revealed." |
| Composer, visible | "Everyone in the retro can read this now." |
| Vote UI, anonymous | "Nobody is shown how you voted." |
| Ratchet confirm | "Make this retro anonymous? Every author is removed permanently and this cannot be undone." |
| Delete retro confirm | "Delete this retro? {cards} cards, {open} open action items and its history are removed permanently. This cannot be undone." |
| Delete team confirm | "Delete {team}? Its {n} retros and their action items are removed permanently. This cannot be undone." |
| Dissolve cluster with dots | "Dissolve this group? Its {n} votes are removed." |
| Last admin leave/demote | "Make someone else an admin first, or delete the team." |
| Claim denied | "The owner is still here — ask them to transfer ownership." |
| Join denied, permanent | "This retro is for signed-in accounts. Sign in to join." |
| Join denied, team | "This retro is for members of {team}. Ask an admin for the invite link." |
| Nudge button | "Email {n} people who haven't written" / "Email {n} team members" / "Sent {ago} by {name}" |
| Create form checkbox | "Email the team that it's open" |
| Settings toggle | "Email me about retros and action items" |
| Unsubscribe page | "You won't get retro or action emails. Turn them back on in Settings." |
| Delete account | "Your account is removed. Cards and action items you wrote in team retros stay with those teams, without your name." |
| Close panel facts | "{n} actions, {m} unowned" |
| Unowned action | "Nobody owns this yet" |
| Coverage readout | "{covered} of {total} covered · {late} new" |
| History row counts | "{open} open · {done} done · {dropped} dropped" |
| Team count line | "{open} open · {done} done · {dropped} dropped across {n} retros" |
| Review empty state | "No open actions from earlier retros" |
| Missing user | "Former member" |
| Timebox over | "Timebox over" |
| Collect hint, listing | "You haven't added a card yet" |

## 20. Privacy policy drafts

`src/app/privacy/privacy-content.tsx`, reviewed by a person before shipping. Sections by title, since ADR-0020's numbering differs from the file (§23).

- **§2 Information We Collect**, collaboration data: "…and, in retrospectives, the cards you write, the votes you cast, and the action items you create or own."
- **§4 How We Use Your Information**: "send sign-in emails" becomes "send sign-in emails and, unless you opt out, emails about retros and action items in teams you belong to".
- **§8 Data Retention**, new paragraph: "Retrospectives kept by a team are stored until the team deletes the retrospective or the team. Their members can read them, and we tell you who those readers are before you write. Retrospectives with no team, and planning-poker rooms, are deleted automatically after 5 days without activity. In an anonymous retrospective we do not store who wrote a card; we do store who voted, and we never show it. Deleted data leaves our live database within minutes and our provider's backups within [N] days." The figure `[N]` is checked against Convex's documentation by a person.
- **§10 Your Rights and Choices**: "You can export any retrospective you can read, and your team's full history, from inside the app. You can delete your account from Settings; cards and action items you wrote in team retrospectives remain with those teams, without your name. You can stop retro and action emails from Settings or from the unsubscribe link in any such email. For any other request, email us."

## 21. Tests (ADR-0025)

### 21.1 The layer rule

Every guarantee is proven in the cheapest layer that can prove it; nothing is tested in Playwright that a cheaper layer already proves.

**convex-test** (`convex/*.test.ts`, edge-runtime project): the reveal projection in both attribution modes and every ADR-0015 case; the ratchet stripping `authorId` and never `voterId`; `evaluateJoin` and the retro category table (a participant cannot advance at defaults, can delete own card and form a cluster, cannot delete another's); `requireRoomReader` against `requireRoomMember` (a non-member non-team-member cannot read cards; a team member without attendance can); `claim` in its four cases and `owner-present`; the four `ConvexError` codes on every refusal path; dot budgets per entry; walk snapshot scope, `raise`, late marking, dangling refs, coverage denominator; `retained` and the sweep (team retro survives, teamless does not, adoption flips); the hourly-coarse clock and every retro module in the bump tests; nudge recipients, rate, teamless refusal, body content; reminder scheduling and cancellation; unsubscribe token; the cascade emptying every retro table; both exports through the same projections; format stamping, teamless `review` drop, edit locks, the "badly / wrong / didn't" guard; action item rules (§13); every mutation in an unexpected stage.

**jsdom** (`src/**/*.test.tsx`): the hand (override map clears on drop, derived position equals the optimistic value in the same render); keyed single-flight; rollback by error kind; `clientId` dedupe; optimistic functions patching exactly the named queries; zoom-level derivation; tap-select state; the walk panel; the join page's disabled state and copy.

**node** (`src/**/*.test.ts`): format seeds and prompt copy; the copy register strings; register-bound copy (no "insights", "notification", forbidden claims) in homepage and features content.

**Playwright** (`tests/retro/`): only the twelve cross-browser facts below.

### 21.2 Playwright scenarios

Each names the fact that needs two real browsers on one deployment. State before the transition under test is seeded through the seam; the transition itself is always performed in the UI. Web-first assertions on §10.9 attributes; no transform assertions; no `waitForTimeout`.

1. Silhouette then reveal: guest writes in `collect`, team member sees `data-hidden="true"` and no text, facilitator advances, text appears in both.
2. The shared pointer governs a view navigated ahead: a viewer at `group` still sees silhouettes while the pointer is at `collect`.
3. Join policy admits a team member and refuses a guest on `teamMembers`.
4. A non-member attendee cannot reach the team page or another team retro.
5. Grouping another person's cards keeps their positions and shows the cluster label at shape zoom in the other browser.
6. Vote budget refused locally at the cap; the tally is hidden in the other browser until advance.
7. Seeded `discuss`: readout, late-card marker on a card written in the other browser, raise moves it next.
8. An action item's round trip: created on the walk topic, completed from the team page, count line updates on the board.
9. The ratchet drops author chips in the other browser with no undo.
10. A drag settles for the other browser with nothing moving mid-drag.
11. `@mobile`: a Pixel 5 guest writes a card through the bottom sheet; a desktop context sees a silhouette.
12. Write-time disclosure reads the teamless line on a teamless retro and the team line on a team retro.

### 21.3 The test seam

One module `convex/testSeam.ts` (a single-dot name: the Convex bundler drops any `convex/` basename with more than one dot from its entry points entirely, so a multi-dot file such as `analytics.seeds.ts` never deploys and could not host the seam), every function checking `process.env.TEST_AUTH_SECRET` first and inert without it:

- **Magic-link capture.** The `sendMagicLink` hook in `convex/auth.ts` writes `{ email, url }` to `testMagicLinks` instead of scheduling `internal.email.sendMagicLinkEmail` when the secret is set; `testSeam.latestMagicLink({ secret, email })` returns the newest row; the fixture visits the URL. Test accounts are addressed by a fixed email per fixture role and reused across runs.
- **Seeding.** `seedRetro({ secret, testRun, stage, team?, attribution?, format?, cards?, dots? })` builds a Team, memberships, the room and retro through the model layer's own functions (never raw inserts) and advances to the named stage, stamping `testRun` on the `teams` and `rooms` rows.
- **Teardown.** `deleteTestRun({ secret, testRun })` deletes every team and room carrying the id through the cascades. Each fixture deletes the Team it created; `admin:dangerouslyDeleteAllData` is never called by a test.

Suite shape: `tests/retro/*.spec.ts`, page objects `tests/pages/retro-*.ts`, fixtures extended with `teamMember` and `anonymousGuest` contexts (`tests/fixtures/test-fixtures.ts`), one `@mobile` project on the Pixel 5 device in the same `playwright.config.ts`, same port-3000 pin, same server lifecycle.

### 21.4 Manual checklist

Real touch drag, pinch-zoom, proximity hulls on touch, the bottom sheet on iOS Safari. Kept in `tests/retro/MANUAL.md`, run before a release that touches the canvas.

### 21.5 CI

`ci.yml` gains `npm run test` (all three vitest projects) after `ts:check`. Playwright stays local until a Convex preview deployment exists for CI.

## 22. Not in v1

Ruled out of scope on the map; the spec designs the seam and nothing more.

- Pushing action items to Jira or GitHub (`externalRef` and a future `pushAction` capability are the seam).
- Retrofitting the poker canvas onto the retro drag seam (the hook, retry policy and optimistic-function pattern are shared; the poker room keeps its buffer).
- AI of any kind: auto-grouping, theme naming, summarisation, sentiment.
- A workspace product: seats, billing, SSO, org roles, org settings.
- Team-scoping existing poker rooms (the set-once `teamId` on `rooms` is the seam).
- Renaming AgileKit, pricing-page restructure, blog or SEO strategy.
- Theme recurrence across retros (no seam beyond the stored cluster name).
- Paywalling retro or free-tier retention limits (`retained` is the seam).
- A client-side retro demo; a read-only share page; per-kind notification preferences; an in-app inbox; a "new since your last visit" affordance (its field, `committedAt`, ships).

## 23. Reconciliations

Where two ADRs disagree or leave a seam, this spec takes the reading below. Items 1 to 3 were confirmed on the map on 2026-09-04 and the amended ADRs carry amended-by notes; the rest are engineering readings.

1. **Stage-list edits: `stageFlow` (ADR-0013) or `retroSettings` (ADR-0021).** ADR-0013 put "editing the stage list (skip, reorder, timebox)" under `stageFlow`; ADR-0021 put adding, removing and reordering entries under `retroSettings`. Spec: structural edits (add, remove, reorder entries and prompts) are `retroSettings`; in-the-moment acts on the current entry (reveal toggle, timebox) stay `stageFlow`.
2. **Card count in listings: ADR-0020 versus ADR-0024.** ADR-0020 lists `collect` retros "with the total card count"; ADR-0024 says card count appears only on the board. Spec follows ADR-0024: listings show `collectUntil` and the viewer's own "You haven't added a card yet" hint, no count.
3. **Last active in listings: ADR-0018 versus ADR-0024.** ADR-0018 allows the dashboard and team page to show `lastActivityAt`; ADR-0024's refusals include "nothing time-based from `rooms.lastActivityAt`" and the history row lists created date only. Spec follows ADR-0024: no last-active time anywhere in retro surfaces.
4. **Privacy section numbers in ADR-0020.** It names "section 3" for the sign-in-emails sentence and "section 8 (rights)"; in the file those are §4 How We Use Your Information and §10 Your Rights and Choices. §20 cites by title.
5. **`roomType` migration.** The map ticket asked for widen → backfill → narrow steps for `roomType`; ADR-0016 kept it optional to avoid exactly that. No backfill: `undefined` means poker everywhere.
6. **`committedAt`.** ADR-0016 asks for "a commit-timestamp field per the Convex docs"; Convex exposes no commit timestamp to a mutation beyond `_creationTime`, and the research notes that does not reflect commit order. Spec stores `Date.now()` from inside the create mutation, which is the transaction's timestamp, and keeps the field so a later affordance has it.
7. **`retro.tally` mount rule.** ADR-0016 mounts it only in `vote` and `discuss` while `tallyVisible` is `visible` on every non-vote entry (so at `close` and at rest dots are readable but not subscribed on the board). Spec keeps ADR-0016's rule; export still prints dot counts server-side.
8. **`testRun` placement.** ADR-0025 says every seeded row carries it; the cascade makes the roots sufficient. Spec puts it on `teams` and `rooms` only.
9. **Route and URL names not fixed by any ADR**, chosen here as engineering defaults: `/team/join/[inviteToken]`, `/dashboard/retros`, `/unsubscribe`, `/dashboard/sessions` keeps its URL under the new label, the env secret `UNSUBSCRIBE_SECRET`, and the seam file `convex/testSeam.ts` (an earlier draft named it `convex/retro.seeds.ts`; corrected on 2026-09-04 because multi-dot basenames are not bundler entry points).
