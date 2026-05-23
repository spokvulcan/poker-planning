# Lockdown is a denial reason, not a separate gate

**Status:** accepted

The **permission decision** (`evaluate`) does not short-circuit on **lockdown** before checking the actor's **role**. An absent owner already fails any owner-level **permission level** — by invariant, an `owner`-role membership exists iff the owner is present — so owner-level and owner-only actions are denied by the role check alone whether or not the owner is there. We therefore treat `ownerAbsent` as input that *refines the denial reason* (`owner-absent` instead of `insufficient-role`), never as a gate that changes the allow/deny outcome. This keeps the decision a single linear rule with one source of truth, and lets lockdown drive the distinct banner/message without duplicating control flow.

## Considered Options

- **Lockdown as an explicit pre-check** (the original shape: `if level === "owner" && ownerAbsent → throw`). Rejected because it is redundant with the role check for outcome, existed in two drifting copies (backend `requirePermission` and frontend `canDoAction`), and invited readers to believe lockdown gates actions that the role check already gates.
- **Lockdown as reason refinement** (chosen). One rule, one place; the `owner-absent` reason carries the user-facing distinction.

## Consequences

- A reader scanning `evaluate` will see no lockdown branch guarding the outcome. That is deliberate — do not "fix" it by adding one. The behaviour in `docs/room-permissions-ba.md` (owner-level actions unavailable in lockdown, with a distinct banner) is fully preserved via the `owner-absent` reason.
- The decision depends on the invariant that `role === "owner"` membership ⟺ the owner is present. If that invariant is ever broken (e.g. multiple owner-role memberships, or an owner-role membership for a non-owner), this reasoning no longer holds and lockdown would need revisiting.
