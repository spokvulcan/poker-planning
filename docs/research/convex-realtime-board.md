# Realtime board mechanics on Convex

Research for [#256](https://github.com/spokvulcan/poker-planning/issues/256), under the
[Team Retrospective map (#253)](https://github.com/spokvulcan/poker-planning/issues/253).

**Question:** what are the realtime mechanics of a multiplayer retro card board on Convex,
and which of them are actually hard *in this codebase*?

**Scope note.** #253 locked "purpose-built board, not the React Flow canvas". This document
treats `canvasNodes` / `room-canvas.tsx` as **precedent to learn from**, not as the substrate
to extend.

**How to read the claims.** §9 splits everything into *verified* (read from this repo's
source, from `node_modules` at the installed version, or quoted from docs.convex.dev this
session) and *inferred*. Nothing in §1-8 is load-bearing unless it appears in the verified
list.

Versions on disk: `convex@1.42.3`, `@convex-dev/presence@0.4.0`, `@convex-dev/better-auth@0.12.5`
(`package.json:20,21,31`). Not installed: `@convex-dev/rate-limiter`, `migrations`,
`aggregate`, `workpool`, `sharded-counter`.

---

## 0. TL;DR — what is actually hard here

| Mechanic | Hard here? | Why |
|---|---|---|
| Ordering under concurrent inserts | **No**, but the existing pattern is wrong at 200 cards | `reorderIssues` rewrites *every* row per reorder — `convex/model/issues.ts:239-265` |
| Concurrent edits to one card | **Yes** | `NoteNode` clobbers the local textarea from the server on every prop change — `src/components/room/nodes/NoteNode.tsx:27-30` |
| Optimistic updates | **Yes — none exist** | Zero `withOptimisticUpdate` in the repo; and Convex ships **no** client-side throttling or coalescing, so a drag-heavy board must single-flight itself |
| Read amplification | **Yes, structurally** | Every invalidation pushes the **full** query result (no delta protocol), and the activity chokepoint makes the room doc dirty on every board write |
| Presence | **Mostly solved** | The component is already correctly stabilised; typing/editing indicators are cheap, cursors are not |
| Two-week open board | **Yes** | The 5-day cron has no `roomType` escape hatch; presence rows are never cleaned up; `_creationTime` is not a safe "what changed" cursor |

Single highest-leverage finding: **`Rooms.updateRoomActivity` makes the room document a
write-amplifier and an invalidation-amplifier at once.** Every card move, every note keystroke
batch and every vote patches `rooms/<id>`, and `api.rooms.get` — which every member subscribes
to — reads that document. §3.2 and §5.

---

## 1. Where realtime lives today

### 1.1 The two subscriptions a room holds

`src/app/room/[roomId]/room-content.tsx:37` → `api.rooms.get`.
`src/components/room/hooks/useCanvasNodes.ts:83` → `api.canvas.getCanvasNodes`.
Plus `api.issues.getCurrent` (`useCanvasNodes.ts:89`), and the issues panel's pair
(`useIssues.ts:35-39`) which mount only while the panel is open — the hook documents that
discipline itself at `useIssues.ts:22-24`.

**`api.rooms.get` read set** (`convex/rooms.ts:32-49` → `convex/model/rooms.ts:111-138`):

- `users` via `by_auth_user` for the caller — `convex/rooms.ts:41-45`
- the `rooms/<id>` document — `model/rooms.ts:116`
- `roomMemberships` `by_room` range, `.collect()` — `model/users.ts` `getRoomUsers`
- one `ctx.db.get` per member on `users`
- `votes` `by_room` range, `.collect()` — `model/rooms.ts:122-125`
- `roomMemberships` `by_room_user` point read for the owner — `model/permissions.ts:19-25`

A write to *any* of: the room doc, any membership, any member's user doc, or any vote re-runs
this query for every member.

**`api.canvas.getCanvasNodes` read set** (`convex/canvas.ts:8-14` → `convex/model/canvas.ts:156-166`):

- the auth guard's `users` + `roomMemberships` reads — `requireRoomMember`, `model/auth.ts:75-93`
- `canvasNodes` `by_room` range, **unbounded `.collect()`** — `model/canvas.ts:160-165`

Note bodies live *inside* those rows: `canvasNodes.data` is `v.any()` (`convex/schema.ts:150`)
carrying `{issueId, issueTitle, content, lastUpdatedBy, lastUpdatedAt}`
(`model/canvas.ts:26-35`), content capped at 10 000 chars (`MAX_NOTE_CONTENT_LENGTH`,
`model/canvas.ts:51`).

### 1.2 The write paths, and the chokepoint they all pass through

| Write | Entry | Model | Bumps `lastActivityAt`? |
|---|---|---|---|
| Node position | `convex/canvas.ts:17-28` | `model/canvas.ts:171-202` | yes — `:201` |
| Note content | `convex/canvas.ts:44-55` | `model/canvas.ts:358-402` | yes — `:401` |
| Create note | `convex/canvas.ts:31-41` | `model/canvas.ts:305-353` | yes — `:351` |
| Delete note | `convex/canvas.ts:58-67` | `model/canvas.ts:407-429` | yes — `:428` |
| Cast vote | `convex/votes.ts` | `model/votingRound.ts:493-548` | yes — `:523` |
| Timer action | `convex/timer.ts` | `model/timer.ts:21-97` | yes — `:96` |
| Reorder issues | `convex/issues.ts:127-136` | `model/issues.ts:239-265` | yes — `:264` |

This is architecture, not accident:
[ADR-0005](../adr/0005-room-activity-has-one-model-layer-chokepoint.md) makes
`Rooms.updateRoomActivity` (`model/rooms.ts:169-176`) the sole writer, and
`convex/roomActivity.test.ts` enforces it per module. 26 call sites route through it.

---

## 2. Ordering: fractional indexing vs integer reindexing

### 2.1 What the repo does today

`convex/model/issues.ts:239-265`:

```ts
await Promise.all(
  args.issueIds.map((issueId, index) =>
    ctx.db.patch(issueId, { order: index + 1 })
  )
);
```

The client sends the **entire ordered array**; the server validates every id belongs to the
room, then rewrites `order` on **every row**. Append is separate and does a full `.collect()`
then `Math.max(...)` (`model/issues.ts:96-119`). Schema: `order: v.number()` with
`by_room_order` (`convex/schema.ts:91,94`). No drag UI is wired to it yet — the mutation is
reachable only through the actions seam (`src/components/room/hooks/useIssueActions.ts:74-77`).

At 20 issues, fine. At 200 retro cards, four separate problems:

- **Transaction cost.** 200 patches per drag against a 16 000-documents-written budget. It
  fits, but it is 200 index-entry rewrites for a one-card move, and it eats into the
  4 MiB/write-throughput floor of the S16 deployment class.
- **Invalidation cost.** All 200 rows are in the board query's read set, so one drag re-sends
  the **entire** board result to all 12 members (§5.1 — Convex has no delta protocol).
- **Contention.** Convex's docs state the rule directly: *"if any document in the result
  changes, the query will re-run or the mutation will hit a conflict"* (best-practices,
  `.collect()` section). Two people dragging *different* cards write overlapping row sets;
  one loses, retries, and rewrites all 200 rows again.
- **Lost intent.** A full-array reorder is last-writer-wins over the *whole ordering*. If A
  moves card 3 to the top and B simultaneously moves card 50 to the top, whoever commits
  second silently discards the other's move — not just loses a race on one card.

### 2.2 Recommendation: fractional indexing on a string key

Store the order as a **string key** per card; a move writes exactly one document.

```ts
retroCards: defineTable({
  boardId: v.id("retroBoards"),
  columnId: v.id("retroColumns"),
  orderKey: v.string(),          // "a0", "a0V", "a1", …
  // …
}).index("by_column_order", ["columnId", "orderKey"]),
```

Why this fits Convex specifically:

1. **Convex has no ordering primitive of its own.** "fractional" appears **nowhere** in the
   published Convex docs corpus (2.4 MB of `llms-full.txt`, grepped). Reorderable lists are
   entirely an application-level concern; there is no framework opinion to fight.
2. **An index sorts by its fields in declared order, so `by_column_order` returns cards
   already sorted** — no in-memory sort, exactly as `by_room_order` does for issues today
   (`convex/schema.ts:94`, consumed at `model/issues.ts:62-66`).
3. **A move is a one-row read/write set,** so two people moving different cards do not
   conflict at all. Contrast §2.1.
4. **Insert-between needs no neighbour cooperation.** `generateKeyBetween(prev, next)` is pure
   client-side arithmetic; the mutation validates and writes one row.

Honest costs:

- **Key growth.** Repeated inserts between the same pair lengthen keys (`"a0"` → `"a0V"` →
  `"a0V8"`). Bounded in practice at retro scale; a rebalance can be a maintenance mutation,
  never a hot path.
- **Interleaving.** Two simultaneous inserts between the same pair can sort in an order
  neither intended. For retro cards that is a cosmetic tie, not corruption.
- **The `_creationTime` tiebreak is real but do not lean on it.** Convex appends
  `_creationTime` to *every* index as the final tiebreaker
  (`node_modules/convex/dist/esm-types/server/system_fields.d.ts:38-47`), so equal `orderKey`s
  sort deterministically. **But** `_creationTime` does **not** reflect commit order — the
  commit-timestamp docs say so explicitly: *"Mutations execute concurrently before committing,
  so `_creationTime` does not necessarily reflect the order in which the mutations committed…
  This can lead to missing documents when iterating over a table."* It is a stable sort key,
  not a causal one, and its uniqueness is not documented. If a monotonic ordering is ever
  needed (see §7.3), the documented answer is a `v.commitTs()` field indexed on
  `db.vars.commitTs`.
- **No library installed.** Neither `fractional-indexing` nor a LexoRank package is in
  `package.json`. `fractional-indexing` is ~1 KB and dependency-free — a smaller addition than
  the reindexing machinery it replaces. **LexoRank is the wrong pick**: it is Jira's bucketed
  variant designed around a rebalancing daemon, and the bucket machinery buys nothing without
  one.

### 2.3 Moving a card between columns

Store `columnId` on the card; change `columnId` + `orderKey` in **one** patch. Do **not** model
column membership as an array on the column document — `convex/_generated/ai/guidelines.md`
(Schema guidelines) forbids unbounded lists in a document field, arrays cap at 8192 elements
and documents at 1 MiB, and every update rewrites the whole document. An array-of-cards column
is also the maximal contention point: every card move by anyone rewrites the same row.

Column ordering itself is 5-8 rows. Integer `order` is fine there. Do not spend design budget
on it.

---

## 3. Concurrent editing and OCC

### 3.1 What Convex's OCC actually does (verified against docs)

- **Read-set granularity is the record version, tracked per index range scanned.** The OCC
  page: *"treating the transaction as a declarative proposal to write records on the basis of
  any read record versions (the 'read set'). At the end of the transaction, the writes all
  commit if every version in the read set is still the latest version of that record."* The
  tracked unit is the index range each `db.get`/`db.query` scanned — the limits page caps
  **index ranges read at 4 096** and defines it as *"the number of calls to `db.get` and
  `db.query`"*.
- **Serializable, no locking.** *"The implementation of optimistic concurrency control in
  Convex instead provides true serializability"* — the page explicitly rejects pessimistic
  locking.
- **A whole-range `.collect()` conflicts with any write into that range.** This is the docs'
  own Example B: a mutation doing `ctx.db.query("tasks").collect()` vs concurrent `addTask`
  inserts — *"any change to the `"tasks"` table will conflict"*, and *"either of the mutations
  can fail"*. The conflict is not biased toward the big reader.
- **Retries: "several", count and backoff undocumented.** *"We can run several retries if
  necessary"* / *"Convex internally does several retries to mitigate this concern, but if the
  mutation is called more rapidly than Convex can execute it, some of the invocations will
  eventually throw this error."* Grepping the full docs corpus for a retry count or backoff
  policy returns nothing. The client package contains **no** OCC retry logic — retries are
  server-side only.
- **On final failure the client gets a plain system `Error`** (not a `ConvexError`), redacted
  to "Server Error" in production. Conflicts surface in log streams as an `occ_info` field.
- **Mutations from the React client are queued per-client, in order.** *"When mutations are
  called from the React or Rust clients, they are executed one at a time in a single, ordered
  queue."* So a drag storm from **one** user serialises; contention comes from **different**
  clients.
- **Escape hatch, undocumented on the website:** `ctx.runQuery(..., { useStaleSnapshot: true })`
  opts a nested read out of the read set
  (`node_modules/convex/dist/esm-types/server/registration.d.ts:891-904`), explicitly for
  *"specific use-cases where database read conflicts are expected"*. Advanced; introduces race
  conditions; almost certainly not needed here.

### 3.2 Where contention realistically bites in *this* repo

**The room document, because the activity chokepoint put it there.**

Every board-ish write ends with `ctx.db.patch(roomId, { lastActivityAt: Date.now() })`
(`model/rooms.ts:173-175`):

- 12 people voting in the same second → 12 mutations writing `rooms/<id>`. `castVote`
  (`model/votingRound.ts:493-548`) *reads* the room doc at `:513`, patches it at `:523`, and
  then `evaluate` (`:356-367`) reads it again — read-then-write on the hottest document in the
  room. This is precisely the docs' Remediation item 3: *"Design your data model such that it
  doesn't require making many writes to the same document."*
- 12 people dragging cards → `updateNodePosition` (`model/canvas.ts:171-202`) patches the node,
  then patches the room.
- Someone typing in a note → one room patch every 500 ms (`NoteNode.tsx:13`).

The room doc is simultaneously the audit skill's "hot document" (`occ-conflicts.md`) and its
"frequently-updated field on a widely-read document" (`subscription-cost.md` §4). One fix
addresses both.

**Note content is the second contention point, and it is a correctness bug.** Two people
editing the same note:

- Both write the full `content` string through `updateNoteContent` (`model/canvas.ts:358-402`),
  which patches `data: { ...node.data, content }`. Last writer wins on the *entire body*,
  silently.
- On the client, `NoteNode` does:

  ```tsx
  // src/components/room/nodes/NoteNode.tsx:27-30
  useEffect(() => {
    setLocalContent(content);
  }, [content]);
  ```

  Any incoming server value overwrites the local textarea, **including mid-typing**. A second
  editor's save yanks the first editor's caret and text. The 500 ms debounce
  (`NoteNode.tsx:56-75`) narrows the window; it does not close it.

### 3.3 `relayoutNodes` — the mutation that touches everything

`model/canvas.ts:57-98` `.collect()`s **every** node in the room and patches every unlocked
player node. It runs on every join (`:241`) and leave (`:299`). On a 200-card board that is a
200-row read set to reposition ~12 avatars — a guaranteed conflict against any concurrent card
write, in both directions, per the Example B rule above.

A retro board must not inherit this. Card positions derive from `(columnId, orderKey)`, so
there is no server-side relayout at all.

### 3.4 Recommendations

1. **Do not route retro card writes through `Rooms.updateRoomActivity`.** Retro boards are
   permanently retained per #253, so the activity clock has no consumer for them — its only
   readers are the 5-day sweep (`model/cleanup.ts:31-34`) and the analytics-snapshot freshness
   rule ([ADR-0007](../adr/0007-analytics-read-from-a-write-time-snapshot.md)), neither of
   which applies. **This is ADR-sized**, because ADR-0005 states the rule universally ("every
   user-initiated model mutation calls it"). The retro ADR should scope it: *activity is the
   ephemeral-room liveness clock; retained rooms do not participate.*
2. **If a liveness signal is still wanted, isolate it.** Put it on a row no broad query reads —
   `subscription-cost.md` §4 applied literally, and the same rule
   `convex/_generated/ai/guidelines.md` states in its Schema guidelines ("separate high-churn
   operational data … create a dedicated table").
3. **One card = one row.** Then two people editing different cards never share a read or write
   set.
4. **For same-card editing, pick a policy explicitly.** Ranked by cost:
   - **Soft lock (recommended for v1).** One editor at a time, advertised through the presence
     `data` slot (§6.3). Cheap, honest, and matches how retro cards are used — short,
     single-author statements, not shared documents. #253 keeps v1 minimal; collaborative text
     editing is the same class of scope creep as the AI it already excludes.
   - **LWW plus a live-value guard.** Keep server-side LWW, fix the client: accept the incoming
     `content` only when the textarea is unfocused, or when `lastUpdatedBy` is not the local
     user. `NoteNode.tsx:27-30` is the exact line.
   - **CRDT/OT text.** Out of proportion for a retro card.

---

## 4. Optimistic updates

### 4.1 What the repo does today: none

`grep -rn "withOptimisticUpdate\|OptimisticLocalStore" src convex` → **zero matches**. The repo
has never used Convex's optimistic-update API. Three hand-rolled substitutes exist:

1. **Drag buffer.** `useNodeDragBuffer` (`src/components/room/hooks/useNodeDragBuffer.ts`)
   keeps React Flow's own node state authoritative during a gesture (`useNodesState`, `:43`),
   copies the derived layout in on change (`:50-52`), and writes back only on a *settled* drag
   — `change.type === "position" && !change.dragging` (`:76-79`) — through a 100 ms lodash
   debounce (`:57-63`).
2. **Manual rollback on the vote.** `useCanvasActions.selectCard`
   (`src/components/room/hooks/useCanvasActions.ts:101-122`): set local highlight, await, restore
   in `catch`.
3. **Local text buffer.** `NoteNode.localContent` (§3.2).

### 4.2 What Convex actually gives you (verified from the installed package)

- **API.** `useMutation(...).withOptimisticUpdate(fn)` —
  `node_modules/convex/dist/esm-types/react/client.d.ts:45`. The handler **must be
  synchronous**; that is enforced in the type *and* warned at runtime
  (`dist/esm/browser/sync/client.js:576-583`). Calling it twice throws.
- **`OptimisticLocalStore` has exactly three methods** —
  `dist/esm-types/browser/sync/optimistic_updates.d.ts:9-57`: `getQuery`, `getAllQueries`,
  `setQuery`. Results are immutable — *"Always make new copies of structures within query
  results to avoid corrupting data within the client."* `setQuery(..., undefined)` removes a
  query, producing a loading state.
- **Rollback is timestamp-gated, not response-gated.** A `MutationResponse` does *not* drop the
  update; it parks it as `Completed` with its commit `ts`
  (`dist/esm/browser/sync/request_manager.js:87-93`). The update is discarded only once a
  `Transition` advances the client watermark past that `ts` (`:96-116`, driven from
  `client.js:220-223`). Net effect: the optimistic value stays on screen until the server has
  pushed query results *that already contain the write* — so there is no flash of stale data.
- **Multiple in-flight updates replay in call order on top of every fresh server snapshot** —
  `dist/esm/browser/sync/optimistic_updates_impl.js:91-118`. Combined with the per-client
  ordered mutation queue (§3.1), optimistic order and server order agree.
- **There is no client-side throttling, debouncing, or coalescing.** Grepping the shipped
  client for `throttl|debounc|coalesc|single.flight` across `dist/esm/browser/**` and
  `dist/esm/react/**` returns **zero matches**. `enqueueMutation` sends each call straight down
  the socket (`client.js:568-620`). The docs have **no** drag/high-frequency section at all.

### 4.3 What a drag-heavy board needs beyond it

**Use `withOptimisticUpdate` for card move / create / edit** — it would be the repo's first
use. It is strictly better than the current hand-rolled buffer for three codebase-specific
reasons:

1. It removes the copy-in jump: today, after a write lands the server round-trip re-derives
   `layoutNodes` and the copy-in effect (`useNodeDragBuffer.ts:50-52`) **replaces** the whole
   buffer. If the server value differs (snapped position, or someone else moved the node) the
   card visibly jumps. With an optimistic update, local and server values flow through one
   store and reconcile at the transition watermark.
2. The derived-node pipeline (`buildCanvasNodes.ts` and its retro equivalent) works unchanged,
   because the optimistic value is *inside* the query result every derivation already reads.
3. It composes with the frozen-identity discipline the canvas enforces (`useStableActions`,
   `useCanvasActions.ts:168`).

**Then add the single-flighting Convex does not ship.** Because there is no coalescing in the
client, a high-frequency write path must implement it. Convex's own canonical reference for
this is the Stack post on throttling by single-flighting (linked from the Agent component's
`throttleMs` docs) — and **a working implementation is already on disk**:
`node_modules/@convex-dev/presence/src/react/useSingleFlight.ts:27-68`, used by the presence
hook at `src/react/index.ts:96`. It keeps one request in flight and replaces pending args with
the latest. That is the exact shape a "drag ghost" or a "typing" write needs.

Concretely for the retro board:

- **during** the gesture: local state only, zero mutations (as today)
- **on drop**: one `moveCard({cardId, columnId, orderKey})` with an optimistic update patching
  the card inside the cached board query
- **delete the 100 ms debounce** — with fractional keys a drop is a single write; debouncing a
  terminal event only adds latency
- **never** put a mutation on pointer-move. Mutations are transactions; 60 Hz of them is
  contention plus an invalidation storm. Live drag ghosts, if ever wanted, belong on the
  presence channel (§6.4), not the database.

---

## 5. Read amplification: 200 cards, 12 members, live votes and typing

### 5.1 The two facts that make this section matter

**Fact 1: every invalidation pushes the full query result. There is no delta protocol.** The
wire type is settled — `node_modules/convex/dist/esm-types/browser/sync/protocol.d.ts:118-142`
defines `StateModification` as `QueryUpdated { queryId, value: JSONValue, … } | QueryFailed |
QueryRemoved`. `value` is the entire result. The client wholesale replaces the stored value
(`dist/esm/browser/sync/remote_query_set.js:28-42`). Docs agree in prose: *"Convex then reruns
the query to get an updated result. And pushes the result to the web app via the WebSocket."*

**Fact 2: the client does not deduplicate by value.** `ingestQueryResultsFromServer` compares by
**reference** (`optimistic_updates_impl.js:104`), and `remote_query_set.js:36` allocates a fresh
object for every `QueryUpdated`; `QueriesObserver` then notifies listeners unconditionally
(`dist/esm/react/queries_observer.js:108`). So every `QueryUpdated` the server sends becomes a
React re-render regardless of whether the value changed. (Whether the *server* suppresses
identical results is **not documented anywhere** in the corpus — do not assume it does.)

Together: a broad reactive query is a broad, repeated, full-payload push **and** a re-render,
for every member, on every write that touches its read set.

### 5.2 The shape to avoid — which is the shape today

`getCanvasNodes` is one unbounded `.collect()` returning every node with its full payload
(`model/canvas.ts:160-165`). Modelling a retro board the same way:

- 200 cards × up to 10 000 chars (`MAX_NOTE_CONTENT_LENGTH`, `model/canvas.ts:51`) is a
  multi-megabyte result — inside the 16 MiB return limit, absurd to re-send.
- Every 500 ms keystroke batch from any of 12 members re-runs and re-pushes it to all 12.
- Every card move does the same.
- Every vote re-runs `rooms.get` for all 12 (votes are in its read set,
  `model/rooms.ts:122-125`).

O(members × writes) full-board pushes. With 12 people typing and dotting, that is the dominant
cost of the feature.

### 5.3 The subscription shape that does not re-send the world

**Split by churn rate, not by entity.** Three queries, each with a read set only the writes it
cares about can dirty:

| Query | Reads | Invalidated by |
|---|---|---|
| `board.structure` | board row + columns | phase changes, column edits (rare) |
| `board.cards` | card rows, **projected** | card create / move / edit |
| `board.votes` | vote rows, **pre-aggregated** | dot voting only |

Then, in order of value:

1. **Project the return value.** `function-budget.md` §5 / `hot-path-rules.md` §3: return the
   smallest shape the UI needs. During *collection*, cards are hidden from other members
   anyway — so send `{_id, columnId, orderKey, authorId}` and omit `text` entirely for cards
   the viewer may not read. This is a product-level read reduction **and** it closes a privacy
   hole that copying `getCanvasNodes` would open (today it returns every note's full body to
   every member).
2. **Keep high-churn fields off widely-read rows.** No vote count, no "being edited by", no
   `lastActivityAt` on the card row — each of those turns a card write into a board-wide
   invalidation.
3. **Exploit query-cache sharing by keeping args and reads identity-independent.** Convex
   dedupes subscriptions by (path, args) with refcounting on the client
   (`dist/esm/browser/sync/local_state.js:43`), and the presence component is built around the
   server-side equivalent — its `roomToken` exists precisely so that *"all members share the
   same cached query"* (`@convex-dev/presence/src/component/schema.ts:33-34`) and *"Avoid
   adding per-user reads so all subscriptions can share same cache"*
   (`src/react/index.ts:23-24`). `api.rooms.get` does the opposite: same args `{roomId}`, but
   the result is sanitised per viewer (`model/rooms.ts:130,145-161`) off a server-derived
   identity (`convex/rooms.ts:38-46`), so it cannot be shared. **Recommendation:** make the
   retro board's shared skeleton identity-free, and put anything per-viewer ("my cards", "my
   votes") in a second, small query.
4. **Bound the read.** `.collect()` over cards is unbounded by construction. Either `.take(N)`
   with a cap enforced at write time, or paginate — noting that `usePaginatedQuery` is **one
   subscription per page** (`dist/esm/react/use_paginated_query.js:131`), page sizes change
   reactively as items are added/removed, and pages can *split* (`splitQuery`, `:10-43`). Also
   note only **one** paginated query per function execution — a constraint this repo already
   hit and documented (`model/cleanup.ts:104-111`).
5. **No `Date.now()` in a board query.** `subscription-cost.md` §7 — it defeats the query cache.
   `NoteNode.formatLastEdited` correctly does this on the client (`NoteNode.tsx:37-53`); keep it
   there.
6. **Mount subscriptions only while their surface is open**, exactly as `useIssues` already does
   (`src/components/room/hooks/useIssues.ts:22-24`).

### 5.4 Live votes specifically

Dot voting is high-frequency and low-value-per-write:

- **Per-vote rows + client aggregation** (today's `votes` shape, `convex/schema.ts:126-135`) is
  simple, but 12 members × 200 cards × 3 dots = 7 200 rows is far too many to `.collect()`
  reactively.
- **A denormalised counter on the card row** makes the card row high-churn — see §5.3.2. Put
  the counter in a *separate* row keyed by cardId instead.
- Convex's own documented answer to high-throughput counting is the **Sharded Counter**
  component (*"High-throughput counter enables denormalized counts without write conflicts by
  spreading writes over multiple documents"*, linked from the write-conflict error page), or
  `@convex-dev/aggregate` (`subscription-cost.md` §5). **Neither is installed**, and adding a
  component is real cost. At 12 voters, sharding is almost certainly premature.

**Recommended v1:** per-vote rows, subscribed **only during the voting phase**, returned
pre-aggregated as a `Record<cardId, count>` so the payload is ~200 numbers rather than 7 200
documents.

---

## 6. Presence: what exists, and whether cursors/typing are affordable

### 6.1 What `@convex-dev/presence@0.4.0` provides

Read from `node_modules/@convex-dev/presence/src/`:

- **Tables** (`src/component/schema.ts:6-48`): `presence` (`roomId, userId, online,
  lastDisconnected, data?`; indexes `user_online_room`, `room_order`), `sessions` (`roomId,
  userId, sessionId, deadline?`), `roomTokens`, `sessionTokens`. These are the component's own
  tables — not in this app's schema, not in `ROOM_OWNED_TABLES`.
- **Heartbeat does not invalidate `list`.** `heartbeat` (`src/component/public.ts:26-111`)
  patches only `sessions.deadline` in steady state (`:53`); the `presence` row is written only
  on insert (`:70-75`) or on an offline→online transition (`:76-81`). `list` (`:183-234`) reads
  `roomTokens` + the `presence.room_order` index and **never reads `sessions`**. Heartbeats
  therefore do not intersect `list`'s read set — subscribers are notified on join/leave, not
  every tick. Given §5.1 (full-result pushes, no value dedup), this design choice is doing a
  lot of work.
- **Bounded reads:** `list` takes at most 104 rows (`public.ts:196`).
- **Defaults:** interval 10 000 ms; disconnect deadline = interval × 2.5 = 25 s
  (`public.ts:37,39`).
- **A per-user payload slot exists:** `data: v.optional(v.any())` on the `presence` row
  (`schema.ts:11`), written by `updateRoomUser` (`public.ts:348-364`, client wrapper
  `src/client/index.ts:83-94`), returned by `list` (`public.ts:222-232`), typed
  `PresenceState.data?: unknown` (`src/react/index.ts:57`). **`heartbeat` cannot set it** — its
  args are only `{roomId, userId, sessionId, interval}` (`public.ts:27-32`), so a payload
  update is a separate mutation.

### 6.2 What this repo wires up

`convex/presence.ts` exposes exactly three functions: `heartbeat` (`:10-30`), `list` (`:32-37`),
`disconnect` (`:39-44`). `updateRoomUser` / `removeRoomUser` / `removeRoom` / `listRoom` /
`listUser` are **never called anywhere in the repo**.

Client side there is exactly one subscription per viewer, deliberately: `useRoomPresence`
(`src/hooks/useRoomPresence.ts:82`) is the only `usePresence` call site and takes no `interval`
(so 10 s / 25 s defaults apply); `RoomPresenceProvider`
(`src/components/room/room-presence.tsx:52-68`) hoists it above `RoomCanvasInner` so a presence
tick does not re-render the React Flow subtree (rationale documented at `room-presence.tsx:3-27`).
Consumers: nav avatars (`src/components/room/user-presence-avatars.tsx:49`) and the settings
roster (`room-settings-panel.tsx:122`).

This repo's `heartbeat` adds an auth guard upstream does not have: `requireActingUser`
(`convex/presence.ts:22-27`) → `requireRoomMember` (`convex/model/auth.ts:75-93`) → a `users`
`by_auth_user` read plus a `roomMemberships` `by_room_user` read **on every 10-second tick, per
viewer**. At 12 members that is 72 guarded mutations/minute/room. It is correct (it prevents
presence spoofing) and cheap per call, but it is not free — worth knowing before adding presence
traffic.

### 6.3 Typing / editing indicators: **affordable, ship them**

Write "is editing card X" into the presence `data` slot via a thin mutation over
`Presence.updateRoomUser`:

- One `presence` row patch per state *change* (start/stop editing), not per keystroke — the
  value is *which card*, not *what text*.
- It does invalidate every subscriber's `list` (the payload lives on the row `list` reads,
  `public.ts:210-232`), but the payload is ≤104 small entries and the change rate is
  human-scale.
- **Zero additional subscriptions:** the roster subscription already exists and is already
  isolated from the canvas render tree.
- Wrap the write in `useSingleFlight` (§4.3) so a fast toggle cannot queue up.

This is also the substrate for the **soft lock** in §3.4.

### 6.4 Live cursors: **no, not through this component**

Cursor position changes at pointer rate. Each `updateRoomUser` patches the same `presence` row
`list` reads, so every subscriber's roster query re-runs and re-pushes its full result (§5.1).
Twelve cursors at even 10 Hz is ~120 mutations/second per room, each fanning out to 12
subscribers. That is categorically outside what this component is designed for — its entire
design point (§6.1) is keeping the *hot* path (`sessions.deadline`) out of the *read* path
(`presence`), and cursors put it right back in.

Cursors would need an ephemeral non-database transport. Nothing like that exists in this stack,
and #253 does not ask for it. **Recommendation: no cursors in v1.**

### 6.5 Two presence defects worth recording

1. **Presence rows are never deleted by this app.** `disconnect` only patches `online: false` +
   `lastDisconnected` (`public.ts:477-480`); the deleting APIs are never called. `leaveRoom`
   (`convex/model/users.ts:213-239`) cleans memberships, canvas nodes and votes but never
   presence — despite the comment at `convex/model/users.ts:388` claiming it "cleans up …
   presence". Rows accumulate one per `(roomId, userId)` forever and consume `list`'s 104-row
   budget.
2. **`ROOM_OWNED_TABLES`' comment is wrong about presence.** `convex/model/roomAggregate.ts:16`
   states *"There is no per-room presence/timer table — presence is connection-local."* Presence
   **is** persisted, in the component's tables. The room cascade (`roomAggregate.ts:64+`)
   therefore leaves presence rows behind for every deleted room, and the orphan sweep
   (`model/cleanup.ts:53-102`) cannot see component tables either. **The retro cascade should
   call `presence.removeRoom(ctx, roomId)`** — and so should the existing poker cascade, as a
   separate bug.

---

## 7. A board that stays open for two weeks

#253 locks *async collection + sync discussion* and *permanent retention*. Four things in this
repo are incompatible with that as written.

### 7.1 The 5-day cron will delete retro boards

`model/cleanup.ts:25-47`:

```ts
const inactiveRooms = await ctx.db
  .query("rooms")
  .withIndex("by_activity", (q) => q.lt("lastActivityAt", cutoffTime))
  .take(INACTIVE_ROOMS_PER_TICK);
```

`by_activity` is `["lastActivityAt"]` (`convex/schema.ts:65`) — **no `roomType` in the index**,
so the sweep cannot tell a retro board from a poker room. A board left open across a two-week
collection window with a quiet stretch >5 days is deleted, cascade and all
(`internal.maintenance.deleteRoomAggregateChunk`, scheduled at `cleanup.ts:39-43`).

| Option | Cost | Verdict |
|---|---|---|
| JS-filter `roomType !== "retro"` after the index read | Convex `.filter()` does **not** push to storage (`hot-path-rules.md` §1; docs: filtered-out documents still count as scanned), so it costs the same as JS filtering — and it breaks `INACTIVE_ROOMS_PER_TICK` budgeting, since a tick could return 100 retro rooms and delete nothing | No |
| Compound index `["retained", "lastActivityAt"]` | Correct and cheap at read time. **But** `undefined !== false` in Convex indexes (`hot-path-rules.md`, "Migration rule for indexes"), so a compound index over an unbackfilled boolean silently matches **nothing** and the sweep stops deleting anything at all | Yes, with a staged migration |
| `expiresAt: v.optional(v.number())` + `by_expires`, set at creation | Moves the policy to write time; retained rooms simply have no `expiresAt`. Same backfill hazard | Also fine |

Recommended: **compound index + widen → backfill → narrow**, per `convex-migration-helper`.
`@convex-dev/migrations` is **not installed**; the repo's existing pattern is a hand-rolled
self-scheduling `internalMutation` (`backfillIssueLinksRoomId`, referenced at
`convex/schema.ts:279`).

Whichever is chosen, **add a cleanup test that a retro room survives the sweep** — ADR-0005's
Consequences section names the timer-only / canvas-only cleanup tests as exactly this kind of
enforcement net.

### 7.2 The activity chokepoint becomes meaningless *and* expensive

For a retained board `lastActivityAt` has no reader, yet every card write pays for a patch on
the most widely read document in the room (§3.2). Same fix as §3.4.1: retro card writes skip
the chokepoint, and a retro ADR scopes ADR-0005 rather than quietly violating it. If a "last
touched" display is wanted, derive it from the newest card, or store it where nothing broadly
subscribes.

### 7.3 `_creationTime` is not a safe "what changed while I was away" cursor

An async board wants "12 new cards since your last visit". Do **not** compute that from
`_creationTime`. The commit-timestamp docs are explicit: *"Mutations execute concurrently before
committing, so `_creationTime` does not necessarily reflect the order in which the mutations
committed. This mean you can be reading the last committed document in a table, ordered by
`_creationTime`, and then later a new document could be inserted with an earlier
`_creationTime`. This can lead to missing documents when iterating over a table."* The documented
fix is a `v.commitTs()` field indexed on `db.vars.commitTs`, which is strictly increasing. If
the retro board ships an unread-cards affordance, it needs that field from day one — retrofitting
it means a backfill that cannot reconstruct true commit order.

### 7.4 Subscription and sweep implications

- **A board nobody has open costs nothing.** Subscriptions are per connected client. Async
  collection implies long-lived *data*, not long-lived subscriptions. (Deployment-level ceiling
  for reference: "Concurrent sessions" is 1 000 on S16, 10 000 on S256.)
- **Tab-hide flaps presence.** The presence React hook disconnects immediately on
  `document.hidden` and re-heartbeats on visible (`src/react/index.ts:165-181`). A board parked
  in a background tab for days produces a stream of online→offline→online transitions, each of
  which *does* patch the `presence` row and *does* invalidate every subscriber's roster.
  Mitigation: treat offline as soft (grey, not removed) — which
  `user-presence-avatars.tsx:64` already does.
- **Wake-up is a full re-send.** Reconnecting after days re-runs subscriptions and pushes whole
  results (§5.1). Another argument for the projected, phase-scoped query shape in §5.3.
- **The orphan sweep full-scans every room-owned table daily.** `cleanupOrphanedData`
  (`model/cleanup.ts:53-102`) does `ctx.db.query(table).collect()` per table, run by
  `convex/crons.ts:37-41`. Adding retro card tables to `ROOM_OWNED_TABLES` puts *permanently
  retained* rows into a daily full-table scan against a 32 000-documents-scanned transaction
  budget. With retention as a product promise that table only grows. Needs a bounded strategy
  (paginated self-scheduling sweep, or exclude retro tables and rely on the cascade). Slow-burn
  scaling bug, not a launch blocker — but record it now.

---

## 8. Recommendations, ordered

1. **Model retro cards as their own table, one row per card**, with `columnId` + string
   `orderKey`, indexed `by_column_order`. Never an array of cards on a column document.
2. **Adopt fractional indexing** (`fractional-indexing`, ~1 KB) instead of porting
   `reorderIssues`' full-array reindexing. A move is one patch.
3. **Keep retro writes off `Rooms.updateRoomActivity`**, and write the retro ADR that scopes
   ADR-0005 to ephemeral rooms. Biggest single contention *and* invalidation win.
4. **Use `withOptimisticUpdate` for card create / move / edit** — the repo's first use — and add
   single-flighting for any high-frequency write, cribbing
   `@convex-dev/presence/src/react/useSingleFlight.ts`. Convex ships no coalescing of its own.
5. **Split the board into structure / cards / votes queries**, project the card shape, keep the
   shared skeleton identity-independent so all 12 viewers share one cached query, and omit card
   text the viewer is not entitled to see during collection.
6. **Soft-lock same-card editing via the presence `data` slot.** Ship editing/typing indicators;
   ship no cursors.
7. **Give the cleanup cron a retention discriminator** via a compound index plus a staged
   backfill, and add a "retro board survives the sweep" test.
8. **Add `v.commitTs()` to retro cards** if an unread/"new since last visit" affordance is
   planned — `_creationTime` cannot do it.
9. **Fix the presence leak**: call `presence.removeRoom` from the room cascade and correct the
   `roomAggregate.ts:16` comment. Applies to poker rooms today, not just retro.
10. **Run `npx convex insights --details` on prod before building** and record the current
    OCC-conflict and bytes-read baseline for a poker room, so the retro board's numbers have a
    comparison point.

---

## 9. Verified vs inferred

### 9.1 Verified — read from this repo this session

- No optimistic updates anywhere: `grep -rn "withOptimisticUpdate\|OptimisticLocalStore" src convex` → 0 matches.
- `reorderIssues` rewrites `order` on every issue in the room from a client-supplied array — `convex/model/issues.ts:239-265`.
- `issues.order` is `v.number()`, indexed `by_room_order` — `convex/schema.ts:91,94`. No drag UI is wired to it — `src/components/room/hooks/useIssueActions.ts:74-77`.
- `getCanvasNodes` is an unbounded `.collect()` over `by_room` — `convex/model/canvas.ts:160-165`.
- Note content (≤10 000 chars) lives inside `canvasNodes.data` (`v.any()`) — `convex/schema.ts:150`; `convex/model/canvas.ts:26-35,51`.
- `Rooms.updateRoomActivity` patches `rooms/<id>` and is called by 26 sites including all four canvas mutations — `convex/model/rooms.ts:169-176`; `convex/model/canvas.ts:201,351,401,428`.
- `api.rooms.get`'s read set includes the room doc, all memberships, all member user docs, and all votes; the result is sanitised per viewer from a server-derived identity — `convex/rooms.ts:32-49`; `convex/model/rooms.ts:111-138,145-161`; `convex/model/permissions.ts:13-27`.
- `castVote` reads the room doc, patches it via the chokepoint, then `evaluate` reads it again — `convex/model/votingRound.ts:493-548`, `:356-367`.
- `relayoutNodes` collects every node in the room and runs on every join/leave — `convex/model/canvas.ts:57-98,241,299`.
- `NoteNode` overwrites local textarea state from the server on every `content` change — `src/components/room/nodes/NoteNode.tsx:27-30`; 500 ms debounce at `:13,56-75`.
- Drag write-back is a local buffer + 100 ms debounce on settled drags only — `src/components/room/hooks/useNodeDragBuffer.ts:43,50-52,57-63,76-79`.
- `selectCard` does hand-rolled optimistic highlight with catch-rollback — `src/components/room/hooks/useCanvasActions.ts:101-122`.
- The cleanup cron uses `by_activity` (`["lastActivityAt"]`) with no `roomType` discriminator; `rooms` has only `by_activity`, `by_created`, `by_owner` — `convex/model/cleanup.ts:25-47`; `convex/schema.ts:65-67`.
- `cleanupOrphanedData` full-scans every room-owned table daily — `convex/model/cleanup.ts:53-130`; `convex/crons.ts:37-41`.
- Only one paginated query per function execution — documented in-repo at `convex/model/cleanup.ts:104-111`.
- `ROOM_OWNED_TABLES` excludes presence and its comment denies presence has a table — `convex/model/roomAggregate.ts:16-27`.
- `useIssues` mounts its subscriptions only while the panel is open — `src/components/room/hooks/useIssues.ts:22-24`.
- Installed components: only `betterAuth` and `presence` — `convex/convex.config.ts`; versions at `package.json:20,21,31`.

### 9.2 Verified — read from `node_modules` at the installed version

**`convex@1.42.3`:**

- Subscription updates carry the **full** result; the protocol has no delta message — `dist/esm-types/browser/sync/protocol.d.ts:118-142`; `dist/esm/browser/sync/remote_query_set.js:28-42`.
- The client compares query results by **reference**, not value, and notifies listeners unconditionally — `dist/esm/browser/sync/optimistic_updates_impl.js:104`; `dist/esm/react/queries_observer.js:108`.
- Identical (path, args) subscriptions are deduped and refcounted client-side — `dist/esm/browser/sync/local_state.js:43`.
- `withOptimisticUpdate` signature, synchronous-only enforcement, double-call throw — `dist/esm-types/react/client.d.ts:45`; `dist/esm/browser/sync/client.js:576-583`; `dist/esm/react/client.js:33-41`.
- `OptimisticLocalStore` = `getQuery` / `getAllQueries` / `setQuery`, results immutable — `dist/esm-types/browser/sync/optimistic_updates.d.ts:9-57`.
- Rollback is timestamp-gated (the update survives the mutation response and is dropped only when a `Transition` passes its commit `ts`) — `dist/esm/browser/sync/request_manager.js:87-116`; `dist/esm/browser/sync/client.js:220-223`.
- In-flight optimistic updates replay in call order on each fresh server snapshot — `dist/esm/browser/sync/optimistic_updates_impl.js:91-118`.
- **No** throttling / debouncing / coalescing in the shipped client — grep of `dist/esm/browser/**` and `dist/esm/react/**` for `throttl|debounc|coalesc|single.flight` → 0 matches; `enqueueMutation` sends immediately — `dist/esm/browser/sync/client.js:568-620`.
- `usePaginatedQuery` is one subscription per page; pages can split — `dist/esm/react/use_paginated_query.js:131`, `:10-43`; gaplessness via the query journal — `dist/esm-types/browser/sync/protocol.d.ts:21-34`.
- `_creationTime` is appended to every index as the final tiebreaker — `dist/esm-types/server/system_fields.d.ts:38-47`.
- `ctx.runQuery(..., { useStaleSnapshot })` opts a nested read out of the read set — `dist/esm-types/server/registration.d.ts:891-904`.
- `ctx.meta.getTransactionMetrics()` exposes live headroom (`bytesRead`, `documentsRead`, `documentsWritten`, …) — `dist/esm-types/server/meta.d.ts:5-47`.

**`@convex-dev/presence@0.4.0`:**

- Tables, indexes, and the `data: v.optional(v.any())` payload slot — `src/component/schema.ts:6-48`.
- Steady-state `heartbeat` patches only `sessions.deadline`; `presence` is written only on insert or offline→online — `src/component/public.ts:26-111` (`:39,53,70-81`).
- `list` reads `roomTokens` + `presence.room_order` only, capped at 104 — `src/component/public.ts:183-234` (`:196,200-220`).
- Defaults: interval 10 000 ms, deadline = interval × 2.5 — `src/component/public.ts:37,39`.
- `data` is settable only via `updateRoomUser`, not `heartbeat` — `src/component/public.ts:27-32,348-364`.
- `disconnect` never deletes; only `removeRoomUser` / `removeRoom` do, and neither is called by this repo — `src/component/public.ts:477-480`.
- The React hook disconnects on `document.hidden` — `src/react/index.ts:165-181`.
- Room tokens exist so all members share one cached query — `src/component/schema.ts:33-34`; `src/react/index.ts:23-24`. They are `crypto.randomUUID()` and never rotated (`// TODO: rotate the room tokens`, `public.ts:485`).
- A working single-flight implementation ships here — `src/react/useSingleFlight.ts:27-68`, used at `src/react/index.ts:96`.
- This repo's `heartbeat` adds `requireActingUser` → two extra indexed reads per 10 s tick per viewer — `convex/presence.ts:22-27`; `convex/model/auth.ts:75-119`.

### 9.3 Verified — quoted from docs.convex.dev this session

- **OCC model.** Read set = record versions; commit succeeds iff every read version is still latest — `/database/advanced/occ`. True serializability, explicitly not pessimistic locking — same page.
- **Read-set unit and cap.** "The number of calls to `db.get` and `db.query` has a limit to prevent a single query from subscribing to too many index ranges, or a mutation from reading from too many ranges that could cause conflicts" — `/functions/error-handling/`; **index ranges read: 4 096** — `/production/state/limits`.
- **Whole-range `.collect()` conflicts with any write in range**, and either side can lose — `/error` (Example B). "If any document in the result changes, the query will re-run or the mutation will hit a conflict" — `/understanding/best-practices`.
- **Retries: "several"; count and backoff undocumented** — `/database/advanced/occ`, `/error`. Grep of the full docs corpus for a retry count or backoff policy: 0 hits.
- **Final failure is a system `Error`**, redacted to "Server Error" in production — `/functions/error-handling`; conflicts appear as `occ_info` in log streams.
- **OCC remediation guidance**: narrow reads via selective index ranges; avoid calling a mutation an unexpected number of times; "design your data model such that it doesn't require making many writes to the same document" — `/error`.
- **Per-client mutation ordering.** "When mutations are called from the React or Rust clients, they are executed one at a time in a single, ordered queue" — `/functions/mutation-functions`.
- **Invalidation pushes results, not deltas** — `/understanding/overview`; all subscribers advance to the same snapshot — `/realtime`, `/client/react`.
- **Paginated queries are fully reactive; page sizes shrink and grow** — `/database/pagination`.
- **Transaction limits.** 16 MiB read / 16 MiB written; 32 000 documents scanned (filtered-out documents count); 4 096 index ranges; 16 000 documents written; 16 MiB return value; 16 MiB function arguments; **1 s** query/mutation *user-code* time (excludes DB ops) — `/production/state/limits`.
- **Document limits.** 1 MiB per document; 1 024 fields; 16 levels of nesting; **8 192 array elements** — `/production/state/limits`, `/database/types`.
- **Deployment class ceilings** (S16 / S256 / D1024 / D2048): concurrent mutations 16/256/512/1024; **mutation write throughput 4/8/32/64 MiB**; concurrent sessions 1 000/10 000/100 000/200 000 — `/production/state/limits`.
- **Billing shape.** "Explicit client calls, scheduled executions, **subscription updates**, and file accesses count as function calls" — `/production/state/limits`.
- **`_creationTime` does not reflect commit order** and iterating by it can miss documents; the fix is `v.commitTs()` on `db.vars.commitTs`, which is strictly increasing — `/database/advanced/commit-timestamp`.
- **Default order is `_creationTime` ascending**; `_creationTime` is the automatic final tiebreaker in every index — `/database/reading-data`, `/database/reading-data/indexes`.
- **Sort in JS for small result sets** (hundreds, not thousands) — `/database/reading-data`.
- **Sharded Counter** is the documented remedy for high-throughput counters — linked from `/error`.
- **Changing an environment variable invalidates all subscriptions** — deployment API docs.
- **Fractional indexing is absent from the entire docs corpus** (0 occurrences in `llms-full.txt`).

### 9.4 Verified — from `convex/_generated/ai/guidelines.md` and the `convex-performance-audit` skill

(`.agents/skills/convex-performance-audit/references/`)

- Do not store unbounded lists as a document array field; separate high-churn operational data (heartbeats, online status, typing indicators) into its own table — guidelines, Schema guidelines.
- Prefer `.take()`/pagination over `.collect()`; do not use `.filter`; batch large mutations with `.take(n)` + `ctx.scheduler.runAfter(0, …)` — guidelines, Query guidelines.
- Convex `.filter()` does not push predicates to storage; only `withIndex`/`withSearchIndex` reduce documents scanned — `hot-path-rules.md` §1.
- `undefined !== false` in indexes; a compound index over an unbackfilled field misses old rows — `hot-path-rules.md`, "Migration rule for indexes".
- Hot documents and broad read sets are the two named OCC causes; split hot documents, move non-critical work to `ctx.scheduler` — `occ-conflicts.md`.
- Frequently-updated fields on widely-read documents invalidate every subscription that reads the document — `subscription-cost.md` §4.
- `Date.now()` inside a query defeats the query cache — `subscription-cost.md` §7.
- Convex no-ops writes that do not change the document — `hot-path-rules.md` §4. (Note: this is about *writes*, and is **not** a claim that unchanged *query results* are suppressed — see §9.5.)

### 9.5 Inferred — reasoning on top of the above, not directly verified

- **No measured conflict data.** `npx convex insights --details` was **not** run (no deployment access this session). Every contention claim in §3.2 is derived from read/write sets in source, not from observed OCC counts. Run it before treating any of this as a measured problem.
- **Whether the server suppresses an unchanged query result.** Explicitly **not documented** anywhere in the corpus, and not observable from the client package. §5.1's worst case assumes it does not; if it does, the amplification is smaller than stated but the payload size argument is unchanged.
- **Whether identity is part of the query cache key.** The recommendation in §5.3.3 rests on the presence component's own comments ("all members share the same cached query", "avoid adding per-user reads so all subscriptions can share same cache") rather than on a documented cache-key definition. The *advice* (keep the shared skeleton identity-free) is safe either way; the *mechanism* is inferred.
- **Whether `ctx.db.patch` adds the patched document to the read set.** Assumed yes (patch is read-modify-write), which is part of why the room doc is both a read and write hotspot. Not confirmed against primary docs. Note `castVote` explicitly `ctx.db.get`s the room anyway (`votingRound.ts:513`), so that path's read-set membership is certain regardless.
- **Fractional-index key growth being acceptable at retro scale**, and **interleaving being cosmetic** — product judgements about retro boards, not technical guarantees.
- **The payload estimates in §5.2** are arithmetic on schema caps, not measured payloads.
- **"A closed tab holds no subscriptions"** (§7.4) is standard client behaviour but was not verified against the `convex` client source this session.
- **Sharding being premature at 12 voters** — a judgement; the Sharded Counter component's existence and purpose are verified, the threshold is not.
