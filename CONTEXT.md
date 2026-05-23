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
The backend adapter (`requireCan`) over the **permission decision**. It does the IO — reads the room, the actor's membership, the target's membership, and whether the owner is absent — assembles the **Action**, calls `evaluate`, and throws a reason-derived message on denial. Identity rules (self-transfer, authoritative `ownerId`) stay in the calling handler, not the guard.
_Avoid_: middleware, interceptor, auth wrapper

**Denial reason**:
Why a **Decision** was `allowed: false` — `insufficient-role`, `owner-absent`, or `target-rank` (acting on a target whose role forbids it). One reason maps to one message via a shared pure function used by both backend throws and frontend tooltips.
_Avoid_: error code, status

### Roles & permissions

**Role**:
A member's standing in one room: **owner** (exactly one; full control; transferable), **facilitator** (trusted helper, promoted by owner or another facilitator), or **participant** (default voter). A role is per-room, not global.
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
The armed timer that reveals automatically once every non-spectator has voted, when the room's auto-complete setting is on. Its two room fields and the scheduled reveal are one unit — clearing the countdown must cancel the scheduled reveal. The scheduled reveal is *bound to the countdown that armed it* by a token: it reveals only while that token is still the room's live countdown, so a stale job (its countdown since cleared or replaced) is inert even if it fires.
_Avoid_: timer (reserve **timer** for the canvas TimerNode), auto-complete (that is the room setting that enables it)

## Flagged ambiguities

- **"Permission"** is overloaded: the **permissions** config (the levels an owner sets) versus a **permission decision** (the runtime verdict). Always qualify which one. The bare table/field name `permissions` always means the config.
- **"Owner absent" vs "owner offline"**: only an explicit *leave* causes **lockdown**. Going offline (disconnect, tab close) is cosmetic presence and changes no permissions.
- **"Phase" vs "status"**: a **voting round** has a derived **phase**; an **issue** has a stored **status** (`pending` / `voting` / `completed`). They correlate but are different axes — a **Quick Vote** round has a phase but no issue status.
- **"Round" vs round number**: each **reset** opens a new timing record (`votingTimestamps.roundNumber`) for the same issue. The module concept **round** is one start-to-settle cycle; the round number counts them within an issue.

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
