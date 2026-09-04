# The canvas's only local state is the hand

**Status:** accepted — decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) via [#276](https://github.com/spokvulcan/poker-planning/issues/276). Specified, not yet built.

[ADR-0011](0011-the-retro-board-is-one-canvas-with-semantic-zoom.md) chose the most write-heavy of the three board directions, ruled that every drag is a write and that writes are settle-only, and refused to inherit `useNodeDragBuffer`, whose copy-in effect replaces the whole local buffer on every subscription tick with no exemption for the node under the cursor. It left "how does this feel instant" to its own ticket, and the facts to design against come from `docs/research/convex-realtime-board.md`.

Three of them decide the shape. First, the repo has never used `withOptimisticUpdate` (§4.1) and Convex's version of it is better than the hand-rolled buffer for a specific reason: the optimistic value is parked until the server pushes a query result that already contains the write, so on success there is never a stale flash, and on failure it is dropped at once (§4.2). Second, Convex ships no client-side coalescing at all, and mutations from one client run in one ordered queue, so five drops of the same card send five writes (§3.1, §4.2). Third, there is no delta protocol: every invalidation re-sends the whole result to every subscriber and forces a re-render (§5.1), which is why [ADR-0016](0016-a-retro-is-one-room-with-its-ceremony-state-beside-it.md) split the board into three queries by churn and why one gesture must be one write.

So: **the optimistic update is the drag buffer.** Nodes are derived from the query result, which already carries every optimistic value, and the only local state the canvas holds is an override map saying where the viewer's hand is during a gesture. Writes are single-flighted per row, never debounced on a terminal event, and rollback is split by failure kind so a card snaps back only when the server has actually refused.

## Considered Options

- **A React Flow node buffer with copy-in and a dragged-node exemption set** (rejected). Keeps two sources of truth and the jump ADR-0011 named; the exemption is a patch over a seam that does not need to exist once the optimistic value lives in the query cache.
- **Global single-flight** (rejected). Card B's drop would wait behind card A's. The presence package's hook is the right shape but the wrong key.
- **Keeping the 100 ms debounce on drop** (rejected). Debouncing a terminal event only adds latency; single-flight already collapses a flurry.
- **Never snapping back** (rejected). A card the server refused to move is lying if it stays. **Snap back only on refusal, after retrying transient failures** (chosen).
- **A presence soft lock on card text** (considered, the research's v1 recommendation; rejected). Since it was written the model made every card single-author and editing another person's card a `cardManagement` act ([ADR-0013](0013-retro-permissions-extend-the-one-decision.md)), so a collision needs a facilitator editing a card while its author types. A live-value guard plus an "editing" indicator is honest; a lock is a rule nobody asked for.
- **A soft lock on position** (rejected). A stage forbidding by another name; last write wins, and a canvas nudge is ten pixels.
- **Temporary ids for optimistic create** (rejected). Swapping the id remounts the React Flow node. **A client-generated `clientId` on the row** (chosen) is the node key forever and makes create idempotent.
- **Migrating the poker canvas onto the new seam in this effort** (rejected). Primitives are shared; adoption is retro-only and the retrofit is out of scope on the map.

## Consequences

### Which writes are optimistic

A write is optimistic when its result is derivable on the client from what it already holds and the gesture is frequent: **card move, card create, own-card text edit, own-card delete, dot place and remove, group and ungroup**, and **tidy**, because tidy is the client computing target positions and calling the move batch. Not optimistic: advance (revealing needs text the client does not have, [ADR-0015](0015-a-hidden-retro-card-is-a-silhouette-projected-by-the-shared-stage.md)), prompt and stage edits, action items, coverage marks. Each of those is a click that can wait a round trip.

### The seam

- **Nodes are derived**, by memo, from `retro.board` plus `retro.mine`, and the derivation already sees optimistic values because they live in the query cache. There is no `useNodesState` buffer and no copy-in.
- **The override map** `{ clientId → position }` is the only local state: written from React Flow position changes while `dragging` is true, read by the derivation ahead of the query value, and cleared on drop in the same tick the mutation is issued, which is safe because `withOptimisticUpdate` runs synchronously before the request leaves.
- **One move mutation, a batch**: `moveCards([{ clientId, position }])`. A single-card drop is a batch of one; a marquee or tap-selected drag is one transaction and one invalidation; tidy is the same call. Nothing is ever written on pointer-move.
- **`retroCards.clientId: v.string()`**, a UUID minted on the client at create time, is the React Flow node key and the create mutation's dedupe key, so a retried create cannot insert twice. Added to the ADR-0016 shape with an index `by_room_client`.

### Coalescing

- **`useSingleFlightMutation(mutation, keyOf)`** in shared `src/hooks/`: one request in flight per key, the latest pending args replacing any queued ones for that key. The key is the row id, or the sorted id set for a batch. The presence package's global single-flight is the reference implementation, generalised by key.
- Moves: no debounce, keyed single-flight. Text edits: 300 ms idle debounce plus flush on blur, then keyed single-flight. Presence writes (editing indicator, readiness): the global single-flight, one write per state change, never per keystroke.

### Optimistic functions

- One module beside the retro board, one synchronous pure function per optimistic mutation, patching every cached instance of the relevant query by name through `getAllQueries`, so argument variance never matters and the functions are unit-testable against a fake local store.
- A move patches `retro.board`. A create inserts into `retro.board` (silhouette or full card by the current entry's reveal) and into `retro.mine`. A text edit patches `retro.mine`, and `retro.board` when the current entry is `visible`. A dot patches `retro.tally`. Group and ungroup patch `clusterId` on the card in `retro.board`.

### Rollback

- **Deterministic refusals are `ConvexError`.** The retro model layer throws `ConvexError({ code })` with a fixed set — `forbidden`, `budget`, `missing`, `stage` — for every rule-based refusal. The repo has no `ConvexError` today; this is its first use and the contract the client relies on.
- **Transient failures retry, refusals do not.** A failure that is not a `ConvexError` is retried up to three times with backoff, the optimistic value held throughout, before the value is dropped. A `ConvexError` drops the value at once with its reason. Moves and creates are idempotent, so retrying is safe.
- **Text never rolls back.** A failed text edit keeps the draft in the editor with an "Unsaved" chip and retries on the next keystroke or blur; the live-value guard accepts an incoming server value only while the editor is unfocused.
- **Dots refuse locally first.** When the viewer's own dot count in `retro.tally` is at the entry's budget, no write is sent; the server's `budget` refusal is only ever a race.
- **Two people moving one card**: last write wins; the loser's card settles where the other person put it when the server result arrives. No lock.
- **Surface**: a `sonner` toast with the reason after the last retry or on refusal. No modal, no banner.

### Sharing

The single-flight hook, the retry policy and the optimistic-function pattern live in shared code. The poker canvas keeps its buffer; moving it is a separate effort.

### Tests that enforce this

- Keyed single-flight: two drops of card A while one is in flight send two writes with the last position; a drop of card B during A's flight is not delayed.
- Optimistic functions: each patches exactly the queries named above and leaves every other cached query untouched; a create in `collect` inserts a silhouette into `retro.board` and full text into `retro.mine`; a text edit in `collect` never touches `retro.board`.
- The override map clears on drop and the derived node position equals the optimistic value in the same render.
- A retried create with the same `clientId` inserts one row.
- A `ConvexError` failure drops the optimistic value without retry and surfaces its code; a plain error retries three times before dropping.
- A failed text edit keeps the local draft; an incoming server value replaces the textarea only when it is unfocused.
- A dot at budget sends no mutation.
- The model layer throws `ConvexError` with one of the four codes for every refusal path, and never a plain `Error`.
