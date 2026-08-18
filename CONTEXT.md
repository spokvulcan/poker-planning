# AgileKit

Online planning poker for Scrum teams. This context covers the domain language teams and code share — rooms, roles, who is allowed to do what, and the **voting round** each session runs.

## Language

### Authorization

**Permission decision**:
The pure verdict for "may this actor take this action in this room, right now". A single function (`evaluate`) of role × permission level × target role × lockdown — no IO, no identity. Distinct from the **permissions** config that feeds it.
_Avoid_: permission check, access check, can-do

**Decision**:
The value a **permission decision** returns: `{ allowed: true }` or `{ allowed: false, reason }`. The reason classifies the denial; user-facing copy is derived from it, never embedded in it.
_Avoid_: result, verdict, outcome

**Action**:
What an actor is attempting. Either a **category action** (one of the four configurable categories) or a **relationship action** (`remove` / `promote` / `demote`, which constrain the target's role; `transfer` / `changePerms`, which do not).
_Avoid_: operation, command, capability

**Permission guard**:
The backend adapter (`requireCan`) over the **permission decision**. It does the IO — reads the room, the actor's membership, the target's membership, and whether the owner is absent — assembles the **Action**, calls `evaluate`, and throws a reason-derived message on denial. Two entry points share the one IO assembly: `requireCan` (identity from `ctx.auth`, for queries/mutations) and `requireCanForUser` (an already-resolved user, for action contexts such as the Jira integration). Identity rules (self-transfer, authoritative `ownerId`) stay in the calling handler, not the guard.
_Avoid_: middleware, interceptor, auth wrapper

**Acting-user guard**:
The backend adapter (`requireActingUser`) for "authenticated ∧ room member ∧ acting as this `userId`" — the one place that triple check lives. Handlers that take a client-supplied `userId` call it instead of re-checking membership and identity inline.
_Avoid_: self-check, impersonation check

**Denial reason**:
Why a **Decision** was `allowed: false` — `insufficient-role`, `owner-absent`, or `target-rank` (acting on a target whose role forbids it). One reason maps to one message via a shared pure function used by both backend throws and frontend tooltips.
_Avoid_: error code, status

**Resolved decision**:
A **Decision** whose **denial reason** has been resolved to its user-facing message: `{ allowed: true }` or `{ allowed: false, message }`. Produced by the pure `resolve(action, ctx)` — the one combiner of `evaluate` and `denialMessage` — so the copy is derived in exactly one place and a caller (a frontend control, a backend throw) reads the message without reconstructing the **Action** or re-deriving the reason. The bare **Decision** carries the reason for classification; the **resolved decision** carries the rendered copy for display. A control disables on `!allowed` and shows `message` as its denial tooltip; it never embeds its own copy.
_Avoid_: gate (an outcome-changing branch, per [ADR-0001](docs/adr/0001-lockdown-is-a-denial-reason-not-a-gate.md)); resolved permission; can-do

### Roles & permissions

**Role**:
A member's standing in one room: **owner** (exactly one; full control; transferable), **facilitator** (trusted helper, promoted by owner or another facilitator), or **participant** (default voter). A role is per-room, not global — a **Team role** is the separate, team-wide axis and grants no room powers.
_Avoid_: rank, level (reserve "level" for permission level), tier

**Permission level**:
The configurable threshold on a **permission category**: `everyone`, `facilitators`, or `owner`. Set by the owner; defaults to `everyone` so new rooms behave as before.
_Avoid_: access level, role requirement

**Permission category**:
One of the four owner-configurable buckets of actions: **reveal cards**, **game flow**, **issue management**, **room settings**. Each carries one **permission level**.
_Avoid_: permission group, scope

**Lockdown**:
The state after the owner *explicitly leaves* (membership deleted), detected at query time as "`ownerId` set, but no membership for that user". Owner-level and owner-only actions become unavailable. **Invariant:** lockdown is a *reason refinement, not a separate gate* — an absent owner already fails the role check, so lockdown only changes the **denial reason** to `owner-absent` (and thus the message/banner), never the allow/deny outcome (see [ADR-0001](docs/adr/0001-lockdown-is-a-denial-reason-not-a-gate.md)). Network disconnects do not trigger it.
_Avoid_: orphaned, locked, frozen

### Teams

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0008](docs/adr/0008-a-team-is-the-permanent-visibility-boundary.md) and [ADR-0009](docs/adr/0009-room-access-and-room-attendance-are-separate-guards.md).

**Team**:
The permanent boundary that owns retro history and fixes who may read it. Deliberately minimal — it exists to give retros continuity and a knowable set of readers, nothing else (no seats, billing, SSO or org roles). A room names its team through a set-once `teamId`, and the team *is* the series: its history is its rooms in creation order, with no separate series entity.
_Avoid_: workspace, organization, space, squad; team room (a room a **Team** owns is still just a room)

**Team membership**:
A person's standing in one **Team** — the durable relationship granting **room access** to that team's retros. Its own table, deliberately not an extension of `roomMemberships`: the two say different things, and a person in a team's retro normally holds both. Requires a permanent account, because an anonymous identity is a browser session and not a knowable reader.
_Avoid_: seat, licence, subscription

**Team role**:
A **Team membership**'s standing: **admin** (invite, remove, rename, delete) or **member**. A separate axis from **Role**, which is per-room — a team admin holds no room powers by virtue of being one. A **Team** may never be left without an admin; unlike a room it cannot enter **lockdown**, because a permanent object nobody can administer is a leak rather than a denial reason (see [ADR-0008](docs/adr/0008-a-team-is-the-permanent-visibility-boundary.md)).
_Avoid_: owner (reserve that for the per-room **Role**), permission level (that is the room's configurable threshold)

**Room access**:
May this person *read* this room's contents — true for a room member **or** for a member of the room's **Team**. Enforced by its own guard (`requireRoomReader`), which read-only queries take.
_Avoid_: visibility (that is the property being protected), read permission

**Room attendance**:
Is this person *in* this room — a `roomMemberships` row, which is what puts them on the roster, in the presence list, and in the non-spectator count a **voting round** reads. Enforced by `requireRoomMember`, which every mutation keeps. A team member reading a retro they never joined has **room access** without attendance, and is deliberately never made an attendee (see [ADR-0009](docs/adr/0009-room-access-and-room-attendance-are-separate-guards.md)).
_Avoid_: presence (that is the live connection signal), participation

### Voting round

**Voting round** (or **round**):
One start-to-settle voting cycle on the room's current **target**. Owned end-to-end by a single module (`convex/model/votingRound.ts`) that is the sole writer of the round's state.
_Avoid_: game, session, vote cycle

**Target**:
What a round votes on — either an **issue** (issue-backed round) or nothing (a **Quick Vote**). The issue-coupled steps (issue **status**, timing, consensus snapshot) run only when the target is an issue.
_Avoid_: subject, topic

**Quick Vote**:
A round with no target issue: ephemeral, untimed, and not recorded against any issue.
_Avoid_: ad-hoc vote, anonymous round

**Phase**:
A round's derived lifecycle state — `voting`, `countingDown` (auto-reveal armed), or `revealed`. Computed from existing room and issue fields; never stored as its own column. A room is *always* running a round (a **Quick Vote** by default), so there is no idle phase: a target-less, unrevealed room is simply a Quick Vote in `voting`.
_Avoid_: game state, mode, idle; do not conflate with issue **status**

**Transition**:
A control action that moves the **phase**: **start** (begin a round on a target), **reveal** (settle and compute results), **reset** (begin a fresh round on the same target), **abandon** (drop the issue target, falling back to a target-less **Quick Vote**, still `voting`). Gated by the **game flow** / **reveal cards** permission categories. Casting or retracting a vote is a participant action, not a transition, though it may arm or cancel the countdown.
_Avoid_: event, command

**Auto-reveal countdown**:
The armed timer that reveals automatically once every non-spectator has voted, when the room's auto-complete setting is on. Its two room fields and the scheduled reveal are one unit — clearing the countdown must cancel the scheduled reveal. The scheduled reveal is *bound to the countdown that armed it* by a token: it reveals only while that token is still the room's live countdown, so a stale job (its countdown since cleared or replaced) is inert even if it fires. It is reconciled on every vote and on **dropping a voter**; a member who appears mid-countdown — joining, or ceasing to be a spectator — does not cancel it, so the scheduled reveal still fires. A member admitted mid-countdown is always a fresh non-voter — spectators are *voteless* (the round refuses their ballots) — so admission can only fail to complete the round, never silently complete it. The auto-complete setting itself is set through the round module (`setAutoComplete`): disabling cancels the countdown in the same step; enabling re-evaluates, arming immediately if every non-spectator has voted.
_Avoid_: timer (reserve **timer** for the canvas TimerNode), auto-complete (that is the room setting that enables it)

**Dropping a voter** (`dropVoter`):
The **voting round**'s response to a non-spectator ceasing to count toward the current round — they **leave** (including being **removed**/kicked) or switch to **spectator**. The round deletes their votes and re-checks completion in one step. The vote deletion lives here, not in the membership/identity code, because the round is the sole writer of the votes table ([ADR-0002](docs/adr/0002-voting-round-is-an-orchestration-module.md)); the caller flips the spectator flag or deletes the membership first, then hands off. Because the non-spectator roster only *shrinks*, this can complete the round and **arm** the **auto-reveal countdown** (or cancel it if the last voter is gone) — but it is never a **phase** **transition**. The inverse is deliberately not symmetric: a member admitted mid-countdown does not cancel it (see **Auto-reveal countdown** and [ADR-0004](docs/adr/0004-roster-exit-reconciles-the-auto-reveal-countdown.md)).
_Avoid_: kick (the `remove` relationship action is one trigger, not the concept); retract (a voter staying but clearing their card is **retractVote**)

**Demo simulation**:
The looping illustration on `/demo`. It is **not a room and runs no voting round** — there is no `rooms` row, no membership, no persisted vote, and the backend never participates. Bots, issues, and **phase** transitions are computed entirely on the viewer's machine and discarded. It *imitates* a round's **phase** lifecycle and reuses the one pure results computation (`summarize`) so its revealed numbers match a real round's, but it lives deliberately outside the **voting round** module's authority. Paused while its tab is hidden (see [ADR-0003](docs/adr/0003-demo-is-a-client-simulation.md)).
_Avoid_: demo room (there is no room), demo game, bot round

**Voter alignment**:
The per-voter distance-from-consensus picture (spec 04), persisted as `individualVotes` rows at reveal. Computed pure in `convex/model/alignment.ts` (`computeVoterAlignment`); the single card→numeric conversion (`cardNumericValue`) is shared by alignment, the round's cast-vote path, and the `summarize` results computation — no second parse may be introduced.
_Avoid_: agreement score (that is `voteStats.agreement` on the issue), deviation, spread

### Room activity

**Room activity** (`lastActivityAt`):
The room's liveness clock — the field the cleanup cascade reads to delete rooms silent for five days. Written only through the model-layer chokepoint `Rooms.updateRoomActivity`: every user-initiated model mutation calls it (voting, issues, canvas, timer, roles, integration mappings), and endpoint handlers never patch the field directly. Internal effects (relayout, countdown arm/cancel, scheduled cascades) do not bump — their initiating mutation already did. See [ADR-0005](docs/adr/0005-room-activity-has-one-model-layer-chokepoint.md).
_Avoid_: touch point, heartbeat, keep-alive

### Analytics

**Analytics snapshot**:
The per-room materialized completed-issue history (`roomAnalyticsSnapshots`), written in the reveal mutation when a **target** issue completes. The analytics queries project purely from it; a missing or stale row falls back to the on-the-fly scan with identical results. Freshness is keyed on **room activity** (`computedAt >= lastActivityAt`), which is why every history-changing write must go through the activity chokepoint. See [ADR-0007](docs/adr/0007-analytics-read-from-a-write-time-snapshot.md).
_Avoid_: cache (the scan is the fallback, not the steady-state source), materialized view

### Integrations

**Token vault**:
The module (`convex/model/tokenVault.ts`) that owns the token-field contract for integration connections: key validation, encrypt-on-write, decrypt-on-read, and the token-expiry predicate. Plaintext is unrepresentable through its interface — writes accept plaintext and persist ciphertext; readers receive ciphertext rows and decrypt explicitly. Provider-agnostic; Jira is the only adapter today, GitHub (spec 07) is the planned second.
_Avoid_: encryption utils (the pure primitive is `convex/lib/encryption.ts` — the vault is the policy owner, not a second crypto implementation)

**Integration provider registry**:
The seam (`convex/integrations/registry.ts`) that maps a connection's `provider` to its adapter's handler — webhook lifecycle, token refresh, client construction. The generic integrations module (`convex/model/integrations.ts`) routes through it and never names a provider; an unregistered provider throws loudly rather than silently skipping. Adapter functions take their effects (fetch, clock, sleep) as injected dependencies so they are testable without faking globals. Jira is the sole adapter; GitHub (spec 07) is the planned second. See [ADR-0006](docs/adr/0006-integration-providers-sit-behind-a-registry.md).
_Avoid_: service layer, plugin, provider factory

## Flagged ambiguities

- **"Team" vs "the team"**: bare "team" means the people currently in a room ("the team voted") and is fine in copy; capital-T **Team** is the entity that owns retro history and fixes who may read it. The `teams` table and `teamId` always mean the entity.
- **"Permission"** is overloaded: the **permissions** config (the levels an owner sets) versus a **permission decision** (the runtime verdict). Always qualify which one. The bare table/field name `permissions` always means the config.
- **"Owner absent" vs "owner offline"**: only an explicit *leave* causes **lockdown**. Going offline (disconnect, tab close) is cosmetic presence and changes no permissions.
- **"Phase" vs "status"**: a **voting round** has a derived **phase**; an **issue** has a stored **status** (`pending` / `voting` / `completed`). They correlate but are different axes — a **Quick Vote** round has a phase but no issue status.
- **"Round" vs round number**: each **reset** opens a new timing record (`votingTimestamps.roundNumber`) for the same issue. The module concept **round** is one start-to-settle cycle; the round number counts them within an issue.
- **"Demo room" is retired**: the `/demo` page is a **Demo simulation**, not a room. There is no `isDemoRoom` flag, no seeded room, no bot membership — those were removed when the demo moved fully client-side. Any reference to a "demo room" predates that change.

## Example dialogue

> **Dev:** When a facilitator clicks "reveal" and reveal cards is set to `owner`, what comes back?
>
> **Domain expert:** A **Decision** of `{ allowed: false, reason: "insufficient-role" }` — a facilitator doesn't meet the `owner` **permission level**.
>
> **Dev:** And if the owner has left?
>
> **Domain expert:** Same allow/deny — still denied — but the **denial reason** becomes `owner-absent`, because the room is in **lockdown**. The verdict didn't change; the reason did. That's why the **permission decision** takes "owner absent" as an input but never branches the outcome on it.
>
> **Dev:** So where does "a facilitator can't remove another facilitator" live?
>
> **Domain expert:** That's a `remove` **relationship action**. The **permission decision** returns `reason: "target-rank"`. The **permission guard** is what fetched the target's **role** to make that call — the decision itself stayed pure.

> **Dev:** A facilitator switches from an issue to Quick Vote while the **auto-reveal countdown** is running. What happens to the round?
>
> **Domain expert:** That's **abandon** — the round drops its **target** and falls back to a **Quick Vote** (still `voting`); there's no idle state to land in. The **transition** must cancel the countdown in the same step; leaving the scheduled reveal alive is exactly the bug the round module exists to prevent.
>
> **Dev:** And if that scheduled reveal had already fired before we cancelled it?
>
> **Domain expert:** It no-ops. The scheduled reveal is bound to the countdown that armed it by a token; once **abandon** clears that countdown, the old job no longer matches the room's live countdown and reveals nothing. Cancelling it is hygiene — the token is what makes it correct.
>
> **Dev:** And the **issue** it left behind?
>
> **Domain expert:** Its **status** goes back to `pending` — a separate axis from the round's **phase**. A **Quick Vote** round never had an issue status to begin with, so there's nothing to revert; it simply has no target.
