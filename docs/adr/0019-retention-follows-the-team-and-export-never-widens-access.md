# Retention follows the Team, and export never widens access

**Status:** accepted — decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) via [#267](https://github.com/spokvulcan/poker-planning/issues/267). Specified, not yet built.

Permanent retention was locked at charting, and the research puts one condition on it: `docs/research/retrospective-effectiveness.md` §5.3 — retention, visibility and candour are three things, Dingsøyr et al. saw critique "toned down or removed completely" once minutes were public, so retain everything and scope *visibility* to the team that produced it. [ADR-0008](0008-a-team-is-the-permanent-visibility-boundary.md) built the **Team** to be that scope and made the write-time disclosure ("kept by Acme Squad") the thing that makes permanence safe. This ADR finishes the other three sides of the same object: which rows the sweep leaves alone, how data leaves, and what the privacy policy may say.

The charter's phrase "teams/permanent-account-owned data is exempt" contained a contradiction that three later ADRs had already resolved by assumption: a retained room with no Team has no `claim` ([ADR-0013](0013-retro-permissions-extend-the-one-decision.md)), so an absent owner would leave a permanent room nobody can administer — the leak ADR-0008 refuses. **Retention therefore follows the Team and nothing else.** A teamless retro is a throwaway whoever created it, and the way to keep one is to put it in a Team, which the set-once `teamId` already allows.

On the way out, the teardown is the guide: `docs/research/retro-tool-teardown.md` finds data portability used as a lever *against* users (Spreo blocks export on paused accounts, Retrium locks history behind an activated Team Room, Parabol's export strips authorship even from named retros, EasyRetro wipes accounts after a year). Permanent, exportable history is a trust differentiator, so export is a first-class act — under one rule: **export never shows the requester anything the board would not**, because it runs through the same server-side projections.

## Considered Options

- **Retention keyed on `teamId` alone** (chosen). Stored as a `retained` boolean on `rooms`, set from `teamId` at creation and flipped by adoption, so the sweep reads one indexed field and a future retention policy has one field to flip.
- **Retention for permanent-account owners too** (rejected). No `claim`, no administrator, and "who can read this later" is answered by a Team, not by an account type.
- **All retro rooms retained** (rejected). Same leak, plus link-join throwaway retros stored forever with nobody responsible for them.
- **`expiresAt` set at creation** (considered, not chosen). Equivalent for the sweep, but it moves a second clock next to `lastActivityAt` and both would need the chokepoint. One clock, one flag.
- **A longer sweep window for teamless retros** (rejected). Needs `roomType` in the sweep index and a second backfill to serve a use case — a two-week async window — that belongs to a Team, which is free.
- **Team admins deleting single retros directly** (rejected). ADR-0008: an admin holds no room powers. The route is `claim`, then `delete`, as it is for the ratchet.
- **Account deletion stripping or removing that person's cards** (rejected). ADR-0008's rule that removal is an access operation, never a content operation; a dangling reference to a deleted row identifies nobody, and the record the team decided from stays whole. Erasure beyond that is a controller decision made by a person.
- **A shareable read-only page** (rejected). A visibility change, and the failure §5.3 names. Sharing is a download the sharer chooses to send.
- **CSV** (rejected). Cannot hold clusters, prompts and action items honestly.

## Consequences

### Retention

- **`rooms.retained: boolean`**, true iff the room has a `teamId`, written at creation and by the adoption mutation that sets `teamId`. The sweep query becomes `withIndex("by_retention_activity", q => q.eq("retained", false).lt("lastActivityAt", cutoff))`; `by_activity` is dropped once the new index is live. Rolled out as widen (optional field, both indexes) → backfill (`retained: false` on every existing row, self-scheduling `internalMutation` in the `backfillIssueLinksRoomId` pattern) → narrow (required field, old index removed), because a compound index over an unbackfilled field matches nothing and the sweep would silently stop. Widen and narrow ship in separate releases. A cleanup test proves a team retro survives the sweep and a teamless one does not.
- **The window stays five days for every non-retained room**, poker and retro alike, read from the hourly-coarse clock ([ADR-0018](0018-the-activity-chokepoint-owns-the-clocks-precision.md)).
- **Write-time disclosure gains the retention half.** Team retro: *"Kept by Acme Squad. Its members can read this later, until the retro or the team is deleted."* Teamless retro: *"Not kept by a team. This retro disappears after 5 quiet days."* Shown where ADR-0008's disclosure already sits, before the first card is typed, and again in the create flow.
- **The `retained` flag is the seam for any future limit.** A free-tier retention policy, deferred at charting, is a policy that flips old retros to `retained: false`; the sweep needs no change. Nothing of it ships now.

### Deletion

- **`delete` is a new owner-level relationship verb** in `requiresOwnerLevel`, so an absent owner yields `owner-absent` and, in a team room, the route is `claim` then `delete`. Hard delete through the existing room cascade. The confirmation names what goes: *"Delete this retro? 47 cards, 3 open action items and its history are removed permanently. This cannot be undone."*
- **Team deletion** (last admin, ADR-0008) cascades every retro of the team through the same mechanism, one scheduled cascade per room, with a confirmation that names the retro count.
- **Your own card is always yours to delete, at rest included.** In an anonymous retro that needs the device-held edit key, so it is frequently impossible after the fact; that is [ADR-0012](0012-an-anonymous-retro-card-has-no-stored-author.md)'s promise working. A hole in a record is honest and is not filled in.
- **Account deletion unlinks and keeps content.** `authorId`, `voterId`, `ownerId` and `createdBy` dangle and render "Former member"; card text, dots and action items stay. Permanent accounts gain a *Delete account* action in Settings that does what sign-out already does for anonymous accounts (`deleteUserByAuthUserId`), with copy that says what stays: *"Your account is removed. Cards and action items you wrote in team retros stay with those teams, without your name."* A team retro whose owner deletes their account enters lockdown and is recovered by `claim`.
- **"Deleted" promises** removal from the live database within minutes of confirmation. What the hosting provider retains in its own backups is stated on the privacy page as a bounded period; the figure is checked against Convex's documentation by a person before the page ships and is not asserted here.

### Export

- **Two exports, two scopes.** *One retro as Markdown*: retro name, team, date, format name, the stages walked, each topic (cluster name or lone card) with its cards under their prompts and its dot count, then action items with owner, due date, status and note. *A team's history as JSON*: one file, every retro in creation order in the same shape the board reads, plus the team's action items. The Markdown is the "share the outcome with people who weren't there" feature; the JSON is the portability promise.
- **Export is a projection of read access and never more.** Both run through the same server-side projections as the board — reveal ([ADR-0015](0015-a-hidden-retro-card-is-a-silhouette-projected-by-the-shared-stage.md): a retro in `collect` exports silhouettes), attribution (ADR-0012: no author on anonymous cards, no voter in any mode), and access ([ADR-0009](0009-room-access-and-room-attendance-are-separate-guards.md)). Anyone with **room access** may export one retro; any team member may export the team's history. No facilitator or admin export sees more than a member's.
- **No share page.** A link that reads a retro without team membership is a visibility change, not an export.

### Privacy policy

Sections 2, 8 and 10 of `src/app/privacy/privacy-content.tsx` are rewritten; the controller and contact stay. Draft copy, reviewed by a person before it ships:

- *§2 Information We Collect*, collaboration data: "…and, in retrospectives, the cards you write, the votes you cast, and the action items you create or own."
- *§8 Data Retention*, new paragraph: "Retrospectives kept by a team are stored until the team deletes the retrospective or the team. Their members can read them, and we tell you who those readers are before you write. Retrospectives with no team, and planning-poker rooms, are deleted automatically after 5 days without activity. In an anonymous retrospective we do not store who wrote a card; we do store who voted, and we never show it. Deleted data leaves our live database within minutes and our provider's backups within [N] days."
- *§10 Your Rights and Choices*, new sentences: "You can export any retrospective you can read, and your team's full history, from inside the app. You can delete your account from Settings; cards and action items you wrote in team retrospectives remain with those teams, without your name. For any other request, email us."

### Cost

A card with its indexes is on the order of a kilobyte and a retro with sixty cards, dots and action items well under 100 KB. Convex's Free and Starter plans include 0.5 GB and charge $0.22 per additional GB per month (pricing page, read 2026-09-04), so roughly five thousand retained retros fit before the first paid gigabyte, and each further gigabyte holds roughly ten thousand more. The trigger for designing the deferred limit is retained storage passing a fixed share of the plan's included storage; it is recorded on the map and nowhere in the product.

### Tests that enforce this

A team retro older than the window survives the sweep; a teamless retro does not; adopting a room into a team flips `retained` and the next sweep leaves it; a non-owner cannot `delete`; a team admin cannot `delete` while the owner is present, and can after `claim`; deleting a retro empties every retro table for that room; the Markdown export of a retro in `collect` contains no card text for a non-author; the export of an anonymous retro contains no `authorId` and no voter in any mode; a team member without room attendance can export a retro; a non-member cannot; deleting a permanent account leaves cards in place with a dangling author.
