# Room access and room attendance are separate guards

**Status:** accepted — decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) via [#257](https://github.com/spokvulcan/poker-planning/issues/257). Specified, not yet built.

Once a **Team** owns retro history ([ADR-0008](0008-a-team-is-the-permanent-visibility-boundary.md)), a team member can legitimately need to read a retro that happened before they joined and that they never attended. They have no `roomMemberships` row, so `requireRoomMember` throws. The tempting fixes both break something: the guard is the base of `requireActingUser` and `requireCan`, and its return type promises a `Doc<"roomMemberships">` that a pure reader does not have.

We split the question in two rather than widening one guard. **Room attendance** — are you *in* this room — stays `requireRoomMember`, unchanged, and every mutation keeps it. **Room access** — may you *read* this room's contents — becomes one new sibling, `requireRoomReader`, which is true for a room member **or** a member of the room's team, and which read-only queries take. Two names for two genuinely different questions, and still exactly one place each is decided.

## Considered Options

- **Two sibling guards** (chosen). Keeps `requireRoomMember` honest about what it means, gives readers a return type that does not lie, and leaves one enforcement point per question. Costs a decision at each read site about which guard applies — a decision that was previously implicit and mostly unexamined.
- **Materialising a `roomMemberships` row on read** (rejected). A membership row is what makes someone *present*: it feeds `getRoomUsers`, the canvas player node, and the non-spectator roster the **voting round** counts for the **auto-reveal countdown**. Minting one for a reader inserts a phantom attendee into a past retro's attendance record, and into a live retro's participation count. That is a data-integrity bug wearing a convenience costume.
- **Widening `requireRoomMember` itself** (rejected). Its callers rely on the returned membership; making it optional pushes a discriminated union into `requireActingUser` and `requireCan`, which have no business knowing about teams.
- **A separate team-guarded read path for history** (rejected). Two authorization paths to the same rows means the boundary holds only until someone adds a query and forgets. `docs/research/retro-tool-teardown.md` records exactly this failure at EasyRetro, where anonymity leaked five separate times because one flag consulted by many surfaces fails at whichever surface forgets.

## Consequences

- **Existing member-gated reads should move to the reader guard as retro lands.** `canvas.getCanvasNodes` and the two issue-export queries already call `requireRoomMember` with the reasoning written in their comments ("note contents are private to the room"). That reasoning is about *access*, not attendance — they were only ever using the membership guard because it was the only one there.
- **Access survives team removal for retros you actually attended.** The guard is a disjunction, so a removed member keeps the room memberships they earned and loses only the retros they never joined. This is deliberate: those are their own contributions, and hiding them retroactively would be punitive.
- **`rooms.get` stays unguarded.** The room shell — name, roster, owning team's name — remains readable by anyone with the link, which is what makes anonymous link-join work and what discloses the retention boundary at write time ([ADR-0008](0008-a-team-is-the-permanent-visibility-boundary.md)). Only room *contents* take the reader guard.
- **Every new read-only query on room-owned data must pick a guard deliberately.** The failure mode is a query that takes neither, which is what `rooms.get` does today and what makes this ADR necessary in the first place. A test that a non-member, non-team-member cannot read retro cards is the enforcement net, in the spirit of the cleanup tests named in [ADR-0005](0005-room-activity-has-one-model-layer-chokepoint.md).
