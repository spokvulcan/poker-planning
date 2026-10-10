# Guard denials and wrong-ceremony refusals carry their message

**Status:** accepted, 2026-10-10. Amends [ADR-0026](0026-the-retro-is-a-whiteboard-like-the-poker-room.md): the shared guards and the wrong-ceremony checks refuse with the model's `ConvexError` too, in both ceremonies.

[ADR-0026](0026-the-retro-is-a-whiteboard-like-the-poker-room.md) has the retro model refuse by rule with a `ConvexError` carrying one of `forbidden`, `budget`, `missing` or `stage`, whose message the board shows, and [ADR-0022](0022-the-canvass-only-local-state-is-the-hand.md) before it said a refusal is never a plain `Error`. But a retro write reaches the model only through the guards every room shares, and those threw plain Errors: room attendance, the permission guard, and the checks that turn away an act of the other ceremony. Convex redacts a plain Error's message in production, so the browser was sent "Server Error" where the resolved decision's message, written for people ("Only facilitators and the owner can do this."), should have been. Planning poker, which ADR-0022 left out of its scope, meets the same guards.

So they refuse with the same coded refusal (`refusal()` in `convex/model/refusal.ts`), in both ceremonies. A denied permission decision is `forbidden` with the resolved decision's message; a caller who isn't in the room is `forbidden`, "Not a member of this room", whichever guard meets them; an act that belongs to the other ceremony is `missing`, as the retro's own "This is not a retro." already is, since what it addresses isn't in this room. That last one covers a category with no level in the room's ceremony, a poker vote or discussion note in a retro, the other ceremony's permissions, and sitting out as a spectator in a retro. Nothing retries: ADR-0026 removed retries, and a refusal was never retried.

## Considered Options

- **Keep plain Errors and rely on the controls** (rejected). A control is already disabled with the resolved decision's message as its tooltip, so a denial reaches the server mostly in a race: the owner changed a permission level or left, or a facilitator was demoted. Those are the cases where the person has no other way to learn why.
- **A code of its own for the other ceremony** (rejected). The browser shows the message whatever the code, and nothing branches on it. The four codes stay the contract, and `missing` already serves the retro's check.
- **Every plain Error on the server at once** (rejected). That is a sweep through every model file. Planning poker's own rules (the length of a name, an issue title or a note, and a room's issue limit) still throw plain Errors; they become refusals with the work on those rules.

## Consequences

- A `ConvexError`'s message is its data stringified, so a test matching a substring of a guard's message still passes. A test of what the browser receives reads `error.data` (`convex/refusal.test.ts`).
- The browser shows the message wherever a write goes through `runAct` (`src/lib/run-act.ts`): every retro write, planning poker's board, timer and panels, and Delete account. A failure that carries no refusal shows the caller's own copy there, never the redacted "Server Error".
- Still plain Errors, because they are caller errors and not refusals by rule: not signed in, no user row, a room or a target that isn't there, and the acting-user guard's mismatch.
