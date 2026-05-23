# The voting round is an orchestration module over existing state, not a materialized entity

**Status:** accepted

The **voting round** — one start-to-settle voting cycle on a room's current **target** (an issue, or nothing for a Quick Vote) — is owned by a single module (`convex/model/votingRound.ts`) that is the *sole writer* of the round's state. That state stays where it already lives: the `rooms` fields (`isGameOver`, `currentIssueId`, `autoRevealCountdownStartedAt`, `autoRevealScheduledId`), `issues.status`, the `votes` table, and `votingTimestamps`. The round's **phase** (`voting` / `counting down` / `revealed`) is *derived* on read from those fields, never stored as its own column — and because a room is always running a round (a Quick Vote when no issue is targeted), there is no separate idle phase to store or derive. The module owns the **transitions** (start, reveal, reset, abandon) and the **auto-reveal countdown**; it delegates pure result computation (consensus and vote stats) and treats the Jira push and canvas results node as reveal *effects*.

## Considered Options

- **Orchestration module over existing state** (chosen). No schema change, no migration or backfill — the deepening is a pure consolidation of who-writes-what behind one interface. Phase is derived by a `phaseOf` helper.
- **Materialize the round** (rejected for now). Promote `votingTimestamps` — which already carries `roundNumber` plus start/end — into a round record with a stored `phase`, or add a dedicated `votingRounds` table. It would make illegal states unrepresentable and enable durable per-round history, but it requires a migration and backfill of live rooms for a benefit we do not yet need. A future architecture review will likely re-suggest it (it was surfaced as "name the round's phase"); we record the trade-off here so it is not re-litigated without new evidence.

## Consequences

- Illegal field combinations remain *representable* — the four state fields are independent — so the round module is responsible for never producing them. Routing every write through the one module is what contains that risk; making the states unrepresentable is precisely what materializing would have bought.
- Every **phase** the module exposes must be derivable from the existing fields. An `idle` phase was considered and dropped: a fresh, target-less, unrevealed room is indistinguishable from an active **Quick Vote** in `voting` without adding state, so the round is modelled as *always running* (Quick Vote by default) rather than introducing an idle state that would need a new column.
- `phaseOf` is the seam to swap later. If we come to need durable per-round history, or phase that genuinely cannot be derived, revisit this decision and materialize behind that helper.
- Mirrors [ADR-0001](0001-lockdown-is-a-denial-reason-not-a-gate.md): prefer one source of truth with the rest derived over adding parallel stored state.
