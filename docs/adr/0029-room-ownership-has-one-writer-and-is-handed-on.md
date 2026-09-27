# Room ownership has one writer, and a deleted owner's rooms are handed on

**Status:** accepted, 2026-09-26. Amends [ADR-0026](0026-the-retro-is-a-whiteboard-like-the-poker-room.md): the hand-off now covers planning poker too.

Who owns a room is three stored facts that must agree: the room's `ownerId`, the owner role on that person's membership, and whether the room is retained. [ADR-0001](0001-lockdown-is-a-denial-reason-not-a-gate.md) relies on them agreeing: an owner-role membership exists exactly when the owner is present. They were written in five places (creating a room, joining it, a transfer, a guest signing in and an account being deleted), each keeping them in step by hand, and the sign-in path let them drift: an owner in their own room without the owner role, refused every owner action with no banner saying why.

So `convex/model/ownership.ts` is the only writer of the three. Creating a room seats its creator in it as owner in the same write, so the room opens on its canvas instead of joining its creator first. When an account is deleted (a guest's sign-out included), each room it owns goes to the member who joined it first, with the owner role, in both ceremonies. Before, a poker room was left owned by an account that could never come back, a lockdown nothing could end. With nobody else in the room, a retro is deleted with the account, as ADR-0026 decided, and a poker room stays, and whoever joins it next becomes its owner.

## Considered Options

- **Leave a poker room in lockdown when its owner's account goes** (rejected). The owner can never rejoin, so the room can never again change its settings, permissions or owner.
- **Delete a poker room nobody else joined, as a retro is** (rejected). Signing out is one click for a guest, and the link they shared a minute earlier would stop working. A poker room is never retained, so the sweep still deletes it five days after its last activity.
- **A claim action for an ownerless room** (rejected). ADR-0026 removed `claim` from the retro. Taking over on join does the same without a verb to explain or guard.

## Consequences

- A room's owner role, owner and retention change only through ownership's functions, so a test of ownership covers every path. `migrations.backfillOwnerRoles` repairs rooms from before this, once.
- A poker room nobody else joined outlives its owner's account until someone joins it or the sweep deletes it. Its first joiner owns it, whoever they are.
- A returning owner (one who left and comes back) is still seated as owner on joining, which ends the lockdown as ADR-0001 describes.
