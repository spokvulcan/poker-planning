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
What an actor is attempting. Either a **category action** (one of the room type's configurable categories) or a **relationship action** (`remove` / `promote` / `demote`, which constrain the target's role; `transfer` / `changePerms` / `ratchet`, which do not; `claim`, which constrains the *owner's* standing rather than a target's).
_Avoid_: operation, command, capability

**Permission guard**:
The backend adapter (`requireCan`) over the **permission decision**. It does the IO — reads the room, the actor's membership, the target's membership, and whether the owner is absent — assembles the **Action**, calls `evaluate`, and throws a reason-derived message on denial. Two entry points share the one IO assembly: `requireCan` (identity from `ctx.auth`, for queries/mutations) and `requireCanForUser` (an already-resolved user, for action contexts such as the Jira integration). Identity rules (self-transfer, authoritative `ownerId`) stay in the calling handler, not the guard.
_Avoid_: middleware, interceptor, auth wrapper

**Acting-user guard**:
The backend adapter (`requireActingUser`) for "authenticated ∧ room member ∧ acting as this `userId`" — the one place that triple check lives. Handlers that take a client-supplied `userId` call it instead of re-checking membership and identity inline.
_Avoid_: self-check, impersonation check

**Denial reason**:
Why a **Decision** was `allowed: false` — `insufficient-role`, `owner-absent`, `target-rank` (acting on a target whose role forbids it), or `owner-present` (a **claim** while the owner is still here and still in the **Team**). One reason maps to one message via a shared pure function used by both backend throws and frontend tooltips.
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
One of the four owner-configurable buckets of actions a room type has. A poker room's are **reveal cards**, **game flow**, **issue management**, **room settings**; a retro's are **stage flow**, **card management**, **action management**, **retro settings** ([ADR-0013](docs/adr/0013-retro-permissions-extend-the-one-decision.md)). The set is chosen by `roomType`; the **permission decision** is the same function over either. Each category carries one **permission level**.
_Avoid_: permission group, scope; reusing a poker category name for a retro act

**Lockdown**:
The state after the owner *explicitly leaves* (membership deleted), detected at query time as "`ownerId` set, but no membership for that user". Owner-level and owner-only actions become unavailable. **Invariant:** lockdown is a *reason refinement, not a separate gate* — an absent owner already fails the role check, so lockdown only changes the **denial reason** to `owner-absent` (and thus the message/banner), never the allow/deny outcome (see [ADR-0001](docs/adr/0001-lockdown-is-a-denial-reason-not-a-gate.md)). Network disconnects do not trigger it. A room a **Team** owns has a way out of it — **claim** — because a permanent room, unlike a poker room, does not expire.
_Avoid_: orphaned, locked, frozen

### Ceremonies

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0014](docs/adr/0014-retro-is-the-second-ceremony-of-one-toolkit.md).

**Ceremony**:
One of the Scrum meetings AgileKit hosts — today **Planning poker**, next **Retro**. A room has exactly one, named by its `roomType`. A documentation word only: it never appears in the product, where each ceremony is called by its own name.
_Avoid_: mode, game type, product (there is one product), session type

**Planning poker**:
The estimation ceremony: a **room** running **voting rounds** over **issues**. The user-facing name for `roomType: "canvas"`.
_Avoid_: session (retired as a category word — it was poker rooms wearing a generic hat), game (survives only in legacy copy such as "Create New Game")

**Retro**:
The reflection ceremony: a **room** of `roomType: "retro"` running a **retro board** through its **stages**, optionally kept by a **Team**. "Retro" is the product word everywhere a user reads it; "retrospective" is reserved for long-form copy, titles and metadata.
_Avoid_: retrospective (in UI), retro room (a retro *is* a room), meeting

### Teams

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0008](docs/adr/0008-a-team-is-the-permanent-visibility-boundary.md) and [ADR-0009](docs/adr/0009-room-access-and-room-attendance-are-separate-guards.md).

**Team**:
The permanent boundary that owns retro history and fixes who may read it. Deliberately minimal — it exists to give retros continuity and a knowable set of readers, nothing else (no seats, billing, SSO or org roles). A room names its team through a set-once `teamId`, and the team *is* the series: its history is its rooms in creation order, with no separate series entity.
_Avoid_: workspace, organization, space, squad; team room (a room a **Team** owns is still just a room)

**Team membership**:
A person's standing in one **Team** — the durable relationship granting **room access** to that team's retros. Its own table, deliberately not an extension of `roomMemberships`: the two say different things, and a person in a team's retro normally holds both. Requires a permanent account, because an anonymous identity is a browser session and not a knowable reader.
_Avoid_: seat, licence, subscription

**Team role**:
A **Team membership**'s standing: **admin** (invite, remove, rename, delete) or **member**. A separate axis from **Role**, which is per-room — a team admin holds no room powers by virtue of being one, with exactly one exception: **claim**, the recovery of a team room whose owner is gone. A **Team** may never be left without an admin; unlike a room it cannot enter **lockdown**, because a permanent object nobody can administer is a leak rather than a denial reason (see [ADR-0008](docs/adr/0008-a-team-is-the-permanent-visibility-boundary.md)).
_Avoid_: owner (reserve that for the per-room **Role**), permission level (that is the room's configurable threshold)

**Room access**:
May this person *read* this room's contents — true for a room member **or** for a member of the room's **Team**. Enforced by its own guard (`requireRoomReader`), which read-only queries take.
_Avoid_: visibility (that is the property being protected), read permission

**Room attendance**:
Is this person *in* this room — a `roomMemberships` row, which is what puts them on the roster, in the presence list, and in the non-spectator count a **voting round** reads. Enforced by `requireRoomMember`, which every mutation keeps. A team member reading a retro they never joined has **room access** without attendance, and is deliberately never made an attendee (see [ADR-0009](docs/adr/0009-room-access-and-room-attendance-are-separate-guards.md)).
_Avoid_: presence (that is the live connection signal), participation

### Retro stages

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0010](docs/adr/0010-a-retro-stage-projects-and-defaults-but-never-forbids.md).

**Stage**:
One step of a retro's guided sequence — `collect`, `review`, `group`, `vote`, `discuss` or `close`. Unlike the voting round's **phase**, a stage is *stored*, is moved by a person, and carries state of its own: an advisory timebox, and the reveal and voting defaults that apply while it is current. What it never does is forbid — a stage projects and defaults, it does not gate ([ADR-0010](docs/adr/0010-a-retro-stage-projects-and-defaults-but-never-forbids.md)).
_Avoid_: phase (that is the **voting round**'s derived lifecycle), step, mode, meeting state

**Stage list**:
The ordered sequence of stage entries stamped onto a retro when it is created, seeded from its format. Skipping a stage means it is absent from the list, reordering means the list is reordered, a different format means a different seed — one mechanism rather than three. Each entry carries its own identity and a kind may repeat, so per-stage state hangs off the **entry**, never off the kind. Copied rather than referenced, so a retro read years later still renders with the sequence it was actually run with. `collect` and `discuss` cannot be removed; everything else can.
_Avoid_: agenda, template, phase config

**Advance**:
Moving a retro's shared stage pointer. Always a human act — there is no auto-advance, because "everyone has finished writing" is not a completing predicate the way "every non-spectator has voted" is (contrast the **auto-reveal countdown**). It moves in both directions, it never destroys or finalises anything, and it never yanks a participant out of what they are typing: views follow by default, and a person may navigate away from the shared pointer freely, forward or back.
_Avoid_: transition (that is the **voting round**'s control action), next, progress

**Collection window**:
The period a retro's stage is `collect` — open from the moment the retro is created, closed by **advancing** out of it. There is no "not started" state before it and no "finished" state after `close`: a retro rests wherever it was left, exactly as a room does.
_Avoid_: draft, pre-meeting, brainstorm phase

**Discussion walk**:
The ordered cursor over topics inside the `discuss` stage, plus the record of which have been visited — coverage is the point, so a walk that has not reached everything says so. Its order is snapshotted when the stage is entered (by votes descending if a `vote` stage ran, creation order otherwise), so votes cast later are still accepted but never reshuffle a walk in progress — the same write-time-snapshot shape as [ADR-0007](docs/adr/0007-analytics-read-from-a-write-time-snapshot.md). Topic-ordered, never person-ordered.
_Avoid_: agenda, round-robin, turn order

**Readiness**:
A person's live "I am done with this stage" signal, held in the presence payload and shown named against each member rather than summed into an aggregate. Ephemeral and advisory: it never gates or triggers an **advance**, and it clears whenever the shared pointer moves. Deliberately absent during `collect` — there the only signal is whether a person has written a card, so no durable record of who declared themselves finished is ever created.
_Avoid_: done, vote to advance, quorum

### Retro board

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0011](docs/adr/0011-the-retro-board-is-one-canvas-with-semantic-zoom.md).

**Retro board**:
The single surface a retro happens on: a spatial canvas with free 2D card placement, pan and zoom, where proximity is how grouping is *performed*. Deliberately **one view** — there is no list, outline or twin rendering of the same retro, and the same canvas serves phone and desktop. Legibility at scale is carried by **zoom level**, not by a second view ([ADR-0011](docs/adr/0011-the-retro-board-is-one-canvas-with-semantic-zoom.md)).
_Avoid_: whiteboard (implies formless; the board carries **stage** state), outline view, list view, mobile view (there is only the one board)

**Zoom level**:
How much of a card the **retro board** draws, as a function of scale — *detail* (full card, votes, meta), *headline* (clamped first line, meta dropped), or *shape* (cards as tinted blocks, with **cluster** labels held at constant screen size). Shape level is where the board is read as a whole and where **discussion walk** coverage shows, so zooming out is a change of resolution rather than a loss of information.
_Avoid_: level of detail (that is the technique, this is the state), overview mode, minimap

**Cluster**:
A named group of cards with its own identity — the thing that can carry a name, a vote total and a slot in the **discussion walk**. A cluster is an *identity, not a location*: its members keep the positions their authors gave them, and a cluster whose members are scattered renders as tinted cards with label chips rather than a drawn shape. Gathering members together is **tidy**, an explicit action someone chooses, because authored position is content and is never rewritten silently.
_Avoid_: group (too near the `group` **stage**), theme, affinity group, hull (that is the transient shape, below)

**Proximity hull**:
The transient shape drawn around cards that happen to sit close together. An affordance for *forming* a **cluster**, never a representation of one — it has no identity, dissolves when a member moves, and is shown only during the `group` **stage**. Naming a hull is what promotes it into a cluster; after that, proximity ignores those cards.
_Avoid_: cluster (a hull has no identity), auto-group, smart group

### Retro data

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0016](docs/adr/0016-a-retro-is-one-room-with-its-ceremony-state-beside-it.md).

**Card**:
One written contribution to a retro: text, the **prompt** it answers, and the position its author gave it on the **retro board**. Its author is recorded or not per **Attribution**; it may belong to at most one **cluster**. Position is layout and the prompt is content — moving a card never changes which prompt it answers.
_Avoid_: note (that is the poker canvas's `note` node), sticky, item, post-it, reflection (Parabol's word)

**Prompt**:
One of the questions a retro's **format** asks — "What went well?", "What should we start?" — carrying a label, an optional hint and a tint. A card answers exactly one prompt, chosen when it is written. On the board a prompt has a soft zone that hints where its cards belong and never constrains them.
_Avoid_: column (there are no columns on a canvas), category, lane, bucket

**Format**:
The template a retro is created from: its named set of **prompts** and the seed for its **stage list**, including each stage's reveal policy, tally visibility and vote budget. Copied whole onto the retro at creation and never referenced afterwards, so a retro renders forever with the prompts and stages it was actually run with. A Team keeps no default format; the picker offers what the team used last.
_Avoid_: template (in UI), activity (TeamRetro's word), phase config

**Topic**:
The unit a retro votes on and walks through in `discuss`: a named **cluster**, or a **card** that belongs to none. The **discussion walk** is an ordered list of topics.
_Avoid_: theme, group, item

**Dot**:
One retro vote, placed by a named voter on a **topic** during a given `vote` **stage** entry. A person's budget for that entry is a count of their dots; two vote stages are two independent budgets. Dots on a card follow it into a cluster; dots on a cluster are re-pointed when clusters merge and deleted when a cluster is dissolved. Always stores the voter, even in an anonymous retro (see **Ratchet**), and is hidden at the read boundary instead.
_Avoid_: vote (that is the poker **voting round**'s ballot, a different table and a different meaning), like, upvote, point

### Retro attribution

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0012](docs/adr/0012-an-anonymous-retro-card-has-no-stored-author.md).

**Attribution**:
Whether a retro's cards carry their author — a per-retro property, `named` or `anonymous`, stamped at creation from the **Team**'s default by copy (a teamless retro is `named`). It is constant across every **stage** — whatever the composer promised at write time stays true for the life of the card — and it moves one way only: a named retro may be made anonymous, even long after it was left at rest, and an anonymous retro can never be made named. It names what is *recorded*, not what is hidden: an **anonymous card** has no author to hide.
_Avoid_: anonymity (the setting is about what is recorded), anonymous mode, privacy mode, incognito; do not confuse `anonymous` attribution with the `anonymous` *account type*, which is a separate axis and changes nothing about the promise

**Anonymous card**:
A card in an `anonymous` retro. No author is stored on it — not projected away at read time, absent from the row — so no reader, facilitator or owner included, can attribute it. Its author still sees it as theirs through an **edit key**. Anonymity is *content* anonymity only: who is present and who is ready stay visible, and during `collect` the per-person "has written a card" signal collapses to a total count. It never reaches an **action item**, whose creator and owner are always named.
_Avoid_: hidden author, masked card, private card (that is the **Reveal policy**'s axis, not this one)

**Edit key**:
The browser-held capability that makes an **anonymous card** editable and deletable by the person who wrote it. Minted by the server once per card, kept only by the client, and stored server-side only as a hash — so it proves "mine" without recording who "me" is. Device-bound by design: an anonymous card is edited from the device it was written on. A card written while the retro was `named` and later anonymised has no key.
_Avoid_: author token, pseudonym (a pseudonym is a stored link and was rejected), ownership record

**Ratchet**:
The one-way move of a retro's **Attribution** from `named` to `anonymous`. Strips the author from every existing card in the retro in one act, which is why it cannot be undone; leaves the voter on retro votes in place, because the per-person vote budget depends on it, and hides those at the read boundary instead. Applies to a retro at rest as much as a live one.
_Avoid_: anonymise (as a verb it hides the irreversibility), toggle, switch

### Retro reveal

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0015](docs/adr/0015-a-hidden-retro-card-is-a-silhouette-projected-by-the-shared-stage.md).

**Reveal policy**:
Whether other people can read a retro's cards while a given **stage** is current — `hidden` or `visible`, carried on each **stage list** entry and seeded from the format (`collect` hidden, everything else visible). It governs *reading*, never writing: a stage still never forbids. The entry that applies is always the shared pointer's, so navigating your own view ahead reveals nothing. It is a separate axis from **Attribution** — one says who may read a card, the other whether the card records who wrote it.
_Avoid_: private mode, blur, privacy setting, anonymity (that is **Attribution**)

**Silhouette**:
What a reader who is not the author sees of a card under a `hidden` **reveal policy**: its position and a tint, and nothing else — no text, no author, in either attribution mode. Produced by the server's read projection, so the content never reaches that reader's browser. The board still shows its shape — how many cards sit under each prompt — without showing a word of them.
_Avoid_: blurred card, masked card, placeholder, hidden card (say what is *shown*, not what is not)

**Reveal**:
The moment cards stop being **silhouettes** for everyone at once. In the default flow it *is* **advancing** out of `collect`; a facilitator may also flip the current entry's **reveal policy** in place, in either direction (a **stage flow** act). Always global — there is no per-author or one-card-at-a-time reveal, and nobody at any role reads a hidden card that is not their own before it.
_Avoid_: reveal cards (that is the poker **permission category**), unblur, show mine, force reveal

### Retro permissions

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0013](docs/adr/0013-retro-permissions-extend-the-one-decision.md).

**Join policy**:
A room's admission rule — `anyone`, `permanentAccounts`, or `teamMembers` (offered only when the room has a **Team**). Decides who may *become* an attendee; it says nothing about **room access**, and a **Team membership** satisfies every value because reading the archive is the stronger claim. Stamped at creation by copy from the Team's **retro defaults**; a teamless room is `anyone`. Edited through the **retro settings** category.
_Avoid_: privacy setting, lock room (that is closing the door to everyone), access level

**Join decision**:
The pure verdict for "may this person become an attendee of this room" — a small sibling of the **permission decision**, not a branch of it, because a joiner has no membership and no **Role** for `evaluate` to look at. One function feeds both the backend refusal in the join flow and the join page's disabled state and copy, so admission is decided in exactly one place.
_Avoid_: join check, gate

**Claim**:
The one room power a **Team role** confers: a team admin taking ownership of a team room whose owner is *gone* — absent from the room (**lockdown**) or no longer in the Team. A recovery verb, not a rank: while the owner is present and in the Team it is denied with `owner-present`, and the route is an ordinary transfer. Requires **room attendance** like every other mutation. The room-level form of the rule that a permanent object may never be left with nobody who can administer it.
_Avoid_: takeover, hijack, override, admin mode

**Retro defaults**:
The bundle a **Team** carries — default **Attribution**, **join policy** and retro **permission levels** — copied by value onto every retro created in it. Edited by a team admin on the team page; changing it never rewrites a retro already running, exactly as a room's stored `permissions` are authoritative over any default.
_Avoid_: team settings (broader), template (that is a format), policy

### Retro actions

Decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) and not yet built. See [ADR-0017](docs/adr/0017-an-action-item-has-one-home-and-carries-over-by-staying-open.md).

**Action item**:
A commitment a retro produces: a short text, at most one **owner**, an optional due date, and the **source topic** it answers. Always named, in both **Attribution** modes — anonymity stops at the card ([ADR-0012](docs/adr/0012-an-anonymous-retro-card-has-no-stored-author.md)). It lives in exactly one retro for its whole life, has three states (`open`, `done`, `dropped`, all reversible), and carries no priority, description, comments or count limit. Creating one is never refused by a **stage**; the board invites it only during `discuss` and `close`. Never bare "action" — that word is the **permission decision**'s subject.
_Avoid_: action (see above), task, ticket, todo, commitment (the act, not the object)

**Owner**:
The one named person accountable for an **action item** — zero or one, never several and never "the team". Any room attendee may be one, anonymous accounts included; a missing user renders as "Former member" by reference. May always edit, complete, drop or reopen their own item; anyone the **action management** category allows may assign them, with no accept step. Unowned is a visible state the `close` and `review` stages surface, not a validation error.
_Avoid_: assignee (fine in code, not in copy), ambassador, champion, DRI

**Source topic**:
The **topic** — a card or **cluster** — an **action item** was written against, kept as a link so the history shows what a commitment answered. Optional; a free-floating action item has none, and the link is cleared if its cluster is dissolved. In an anonymous retro the link shows the card's text, never an author.
_Avoid_: origin, parent, linked card

**Carryover**:
The fact that an **action item** still `open` from an earlier retro appears in the next one's `review` **stage** and on the team page. A query over the **Team**'s open action items, never a copy and never a pointer between retros — an action item has one home, and "carried over" means "still open". A teamless retro has nothing to carry to or from.
_Avoid_: import, roll over, transfer, parking lot

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
_Avoid_: game state, mode, idle; do not conflate with issue **status**, nor with a retro **stage** (stored, human-advanced, and the retro's word for this idea)

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
- **"Anonymous" is two axes**: `anonymous` **Attribution** is a retro's promise about what its cards record; an `anonymous` *account* is a browser-session identity. An anonymous-account user in a `named` retro is attributed by the name they typed; a permanent-account user in an `anonymous` retro leaves no author at all. Neither axis alters the other.
- **"The facilitator" vs the facilitator Role**: in copy and research, "the facilitator" is the person running the retro, who is usually the room **owner**. The **facilitator** *Role* is the promoted-helper rank. A retro category defaulting to `facilitators` includes the owner; nothing requires the person running the retro to hold the facilitator Role.
- **"Session"** is not a category word any more. In old copy and in the dashboard's `Sessions` route it means a poker **room**; a **Retro** is never a session, and a **Ceremony** is the level above both.
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
