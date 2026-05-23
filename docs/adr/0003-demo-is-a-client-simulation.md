# The /demo page is a client-side simulation, not a server-backed room

**Status:** accepted

The `/demo` page no longer renders a real **room** running a real **voting round**. It is a **Demo simulation**: bots, issues, canvas node positions, and the **phase** lifecycle (`voting` → `countingDown` → `revealed` → reset) are computed on the viewer's machine by a client-side reducer ticking on an interval, and nothing is persisted. The backend does not participate at all — there is no `rooms` row, no membership, no `votes`, no scheduled reveal.

This replaces a server-driven demo: a single `isDemoRoom` row whose bots were driven *through the real voting round* by a cron (`internal.demo.runDemoCycle`) firing **every 8 seconds, 24/7, regardless of whether anyone was watching** — ~10,800 mutation invocations/day at zero viewers, plus reactive reads per visitor. On Convex's free tier that was the dominant, ever-present cost.

## Considered Options

- **Fully client-side simulation** (chosen). Delete the cron, the demo Convex functions, the seeded room/bots/issues, the `isDemoRoom` schema field, and its exemptions. The simulation runs only while a viewer has the tab open, and is **paused while the tab is hidden**. Demo Convex cost drops to exactly zero, including reads.
- **Viewer-gated cron** (rejected). Keep the server simulation but only tick when a viewer is connected. Stops the idle drain but keeps the demo server-authoritative, still costs reads/writes per viewer, and adds presence-tracking complexity.
- **Seed once, animate locally** (rejected). Keep the room/bots seeded in Convex, read once on load, then animate client-side. Kills the cron drain but keeps a per-visitor read cost and leaves dead seed data and the `isDemoRoom` field in place.

## Consequences

- **Deliberate exception to [ADR-0002](0002-voting-round-is-an-orchestration-module.md).** That ADR makes `convex/model/votingRound.ts` the *sole writer* of round state. The demo now reimplements the **phase** lifecycle client-side, outside that module. This is accepted because the demo is an illustration, not a real round — but it means the phase machine exists in two places.
- **Drift is contained to two pure functions.** The simulation reuses `summarize` (the one pure results computation, already consumed by the live client results panel) and mirrors `phaseOf`, so revealed numbers and phase semantics match a real round. Only bot selection and reset *timing* are demo-specific. If the round's phase transitions change, the demo reducer must be updated to match — there is no compiler link between them.
- **`isDemoRoom` and its exemptions are gone.** `shouldRecordTiming` collapses to `!!issueId`; the `completeIssueVoting` timing guard always runs. Both are correct for real rooms, which are the only rooms left.
- **The `roomMemberships.isBot` schema column is removed**, but the `RoomUserData.isBot` *type marker* is retained — the simulation sets it locally so bot players still render as bots on the canvas.
- **The read-only demo presentation (`isDemoMode`) is unchanged.** Only the data source swaps: a `DemoSimulationProvider` supplies state via context, and *every* Convex subscription reachable from the demo canvas is bypassed in demo mode and read from context instead — not only `useCanvasNodes` and `useIssues` (`api.canvas.getCanvasNodes`, `api.issues.getCurrent`, the issues list), but also `useRoomPresence` (skip `usePresence(api.presence, …)`; derive all-bots-online locally) and `useTimerSync` (skip `api.timer.getTimerState`; render a stopped/local timer). "Zero reads" is broader than the demo data query: presence and the timer node each open a subscription today and would otherwise keep costing reads even after the cron is gone.
- **Reversal cost is real.** Restoring a server-backed demo means re-adding the schema field, the seed, the cron, and the exemptions — hence this record.
