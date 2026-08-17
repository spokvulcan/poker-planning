# Analytics read from a write-time snapshot

**Status:** accepted

Each of the nine room-analytics queries re-ran `completedIssueHistory` — a multi-table scan of the room's completed issues, timestamps, and votes — on every subscription, and two paths fanned out per-issue (the agreement-trend enrichment and the enhanced export's link lookup). The scans are pure reads of history that only changes when a round completes, so the work was repeated for no new information.

The **analytics snapshot** (`roomAnalyticsSnapshots`, one row per room) stores the completed-issue history in exactly the shape the pure projections consume. It is written inside the reveal mutation, after the target issue's completion and the voter-alignment snapshot, so one room pays the scan once per completed round. The nine queries project purely from the snapshot; a missing or stale row falls back to the original scan with identical results. Freshness is `computedAt >= room.lastActivityAt`, leaning on the room-activity chokepoint ([ADR-0005](0005-room-activity-has-one-model-layer-chokepoint.md)): every history-changing write bumps activity, so a stale snapshot is never served.

## Considered Options

- **Write-time snapshot with read fallback** (chosen). No backfill migration and no frontend change: legacy rooms fall back to the scan until their next completed round heals them. The per-issue N+1s became one `by_room` fetch with a per-issue fallback for rows predating `issueLinks.roomId`.
- **Query-time memoization** (rejected). Convex queries cannot write, so "compute once, then cache" has no home; an internal mutation the client pings would add frontend complexity for the same effect.
- **Scheduler-indirect recompute** (rejected). Rooms complete rounds at human timescale; recomputing inline in the reveal mutation is cheap and keeps freshness synchronous — no window where the snapshot lags the reveal that a subscriber can observe.
- **Backfill migration** (rejected). The fallback is correct, not degraded; a migration would add operational risk to optimize a read that heals itself.

## Consequences

- Correctness is coupled to the activity chokepoint: any new write that changes completed-issue history must bump `lastActivityAt`, or analytics will serve the stale snapshot. This is the same rule ADR-0005 already imposes; the webhook title-sync bumps for exactly this reason.
- The snapshot row is room-owned and part of `ROOM_OWNED_TABLES`, so the room cascade and the orphan sweep handle it with no special casing.
- The history is array-embedded in one document; a pathological room (500 completed issues × large roster) could approach Convex document size limits. Not a practical concern at human voting scale; revisit if rooms grow archival.
- The fallback keeps the old scan tested and warm — the equivalence tests run every projection against both paths.
