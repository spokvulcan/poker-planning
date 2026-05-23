# AgileKit

Online planning poker for Scrum teams. This context covers the domain language teams and code share — rooms, roles, and who is allowed to do what inside a session.

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

## Flagged ambiguities

- **"Permission"** is overloaded: the **permissions** config (the levels an owner sets) versus a **permission decision** (the runtime verdict). Always qualify which one. The bare table/field name `permissions` always means the config.
- **"Owner absent" vs "owner offline"**: only an explicit *leave* causes **lockdown**. Going offline (disconnect, tab close) is cosmetic presence and changes no permissions.

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
