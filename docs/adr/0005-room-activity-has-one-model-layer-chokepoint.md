# Room activity has one model-layer chokepoint

**Status:** accepted

`rooms.lastActivityAt` is the liveness clock the cleanup cascade reads to delete rooms silent for five days. It was previously bumped by convention at 14+ call sites across six modules — inline `db.patch`es next to the real write, a helper used only sometimes, and whole areas (timer ops, canvas node mutations, role changes, integration mapping changes) that never bumped at all. The failure mode was silent: a room used only via timer or canvas looked abandoned and was deletable mid-use.

**Room activity** is now owned by the model layer: every user-initiated model mutation calls `Rooms.updateRoomActivity` (`convex/model/rooms.ts`) itself, and endpoint handlers never patch the field. Internal effects (canvas relayout, countdown arm/cancel, scheduled cascade steps) deliberately do not bump — the mutation that initiated them already did.

## Considered Options

- **Route-through chokepoint** (chosen). One helper, called from inside the model functions that constitute activity. No schema change; the rule is enforceable by inspection (`grep lastActivityAt` shows the helper, the cleanup read, and nothing else) and is covered by per-module bump tests plus cleanup tests proving timer-only / canvas-only rooms survive.
- **Derive, don't store** (rejected). Compute liveness as the max `updatedAt` across room-owned tables at cleanup time. Removes the write-side convention entirely, but turns the daily sweep into a multi-table fan-out per candidate room and still needs a rule for tables without timestamps. Stored-and-choked is cheaper and keeps the cleanup query trivial.

## Consequences

- Any new user-initiated model mutation must call the chokepoint; the per-module bump tests (`convex/roomActivity.test.ts`) are the enforcement net, and the cleanup tests guard the deletion semantics.
- The **analytics snapshot** freshness rule (`computedAt >= lastActivityAt`) depends on this chokepoint — a history-changing write that skipped the bump would serve stale analytics (see [ADR-0007](0007-analytics-read-from-a-write-time-snapshot.md)).
- Server-originated writes that change room state (e.g. the Jira webhook title sync) also bump, because their effect is indistinguishable from user activity downstream.
- Mirrors [ADR-0002](0002-voting-round-is-an-orchestration-module.md): prefer one writer over a convention scattered across call sites.
