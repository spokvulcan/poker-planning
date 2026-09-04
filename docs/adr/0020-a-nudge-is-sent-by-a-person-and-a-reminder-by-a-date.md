# A nudge is sent by a person, and a reminder by a date

**Status:** accepted — decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) via [#274](https://github.com/spokvulcan/poker-planning/issues/274). Specified, not yet built.

Async collection was locked at charting and [ADR-0010](0010-a-retro-stage-projects-and-defaults-but-never-forbids.md) made the **collection window** a stage that opens at creation and closes only when a person advances. A board that can sit open for days needs a way to ask people for cards, and the teardown (`docs/research/retro-tool-teardown.md`, "What's genuinely unsolved" §4) finds that nothing in the market models this: no deadline, no reminder, no notion of who has contributed. TeamRetro's recipe is "leave the meeting in the Brainstorm step". The other half of the question arrived from [ADR-0017](0017-an-action-item-has-one-home-and-carries-over-by-staying-open.md), which specified action items without reminders and handed the decision here, and the teardown is blunt about that too: Retrium's actions "just sit there", and its one G2 request is for the tool to notify the tagged person.

The constraints were already fixed. Only permanent accounts carry an email (`convex/schema.ts`, `users.email` optional) and team membership requires one ([ADR-0008](0008-a-team-is-the-permanent-visibility-boundary.md)), so the addressable audience is the Team and nobody else. In an anonymous retro a card has no stored author ([ADR-0012](0012-an-anonymous-retro-card-has-no-stored-author.md)), so no per-person signal exists to send. A hidden card is a silhouette ([ADR-0015](0015-a-hidden-retro-card-is-a-silhouette-projected-by-the-shared-stage.md)), so no email may quote one. The existing capability is one `internalAction` in `convex/email.ts` posting to Resend with a raw `fetch`, one hand-rolled template, used for the magic link and nothing else; there is no preference store, no send log, no unsubscribe.

The decision follows ADR-0010's shape. That ADR made **advance** a human act because "everyone has finished writing" is not a completing predicate; the same argument makes the collection email a human act. **A nudge is sent by a person who holds `stageFlow`, at most once a day, to the team members who have not written.** Nothing about the collection window is ever scheduled. Action items are the deliberate exception: after the retro nobody is watching, the owner agreed to a date, and a single email on that date is the feedback the research says a commitment needs (`docs/research/retrospective-effectiveness.md` §1.6, goals need feedback). **A reminder is sent by a date the owner accepted, once, and cancelled the moment the commitment changes.**

## Considered Options

- **Human-triggered nudge only** (chosen). One button, one rate limit, no cron, no dedup key, no story for an extended window. The facilitator is present during collection and is the one who will close it.
- **One scheduled reminder hung off the cards-due date** (rejected). Cheap in mechanism (`ctx.scheduler.runAt`) and expensive in policy: what fires if the date moves, who is the sender, what if the facilitator already pressed the button that morning. The date stays advisory, like the timebox.
- **A scheduled cadence** (rejected). That is the nagging machine.
- **"You haven't contributed yet" as its own automatic send** (rejected). It is the most useful nudge and the most dangerous one. It survives only as the audience filter behind a human press, and only in a named retro, where the roster already shows the same fact.
- **A "discussion is starting" email on advance** (rejected). Meeting logistics belong to the calendar. Digests, summaries, Slack and Teams are non-goals of the ticket.
- **Action reminders: none** (rejected). The category's known failure. **Assigned and due, no overdue drip** (chosen). Miro ships assigned / upcoming / overdue; the third is the nag.
- **Per-kind notification preferences** (rejected). Three kinds of email do not justify a preferences table or a settings page. **One boolean on `users`** (chosen), toggled in Settings and by a one-click unsubscribe link.
- **In-app notification centre** (rejected). The in-app side is a listing in the places people already look, not an inbox.
- **Emailing teamless retros' attendees** (rejected). No Team means no knowable audience; share the link.

## Consequences

### Vocabulary

- A **nudge** is the human-sent email about an open collection window. A **reminder** is an email about an action item. "Notification" is not a category word in the product and no in-app object carries either name.

### The cards-due date

- **`retros.collectUntil: v.optional(v.number())`**, a date, set at creation or from retro settings under `retroSettings`. Advisory exactly like `timeboxMinutes`: it never advances the stage and never sends anything. Shown on the board during `collect`, in the dashboard and team-page listings, and in nudge copy.

### The nudge

- **Who**: any holder of `stageFlow` (facilitators by default, [ADR-0013](0013-retro-permissions-extend-the-one-decision.md)), on a team retro, while the shared stage is `collect`. A teamless retro has no nudge.
- **To whom**: in a **named** retro, every team member who has no card in this retro, excluding the sender; in an **anonymous** retro, every team member excluding the sender, because the server cannot tell who has written. Team members who never joined the room are included; that is the point. Removed members are excluded by construction (no `teamMemberships` row).
- **Content**: retro name, team name, format name, total card count, the due date if set, who pressed it, and a link. Never card text, never the name of anyone who has not written, never a per-person count. From "AgileKit", reply-to the sender's address so a reply reaches a human.
- **Rate**: at most once per retro per 24 hours, server-enforced, stored as **`retros.lastNudge: v.optional(v.object({ at: v.number(), by: v.id("users") }))`**. The button reads "Email 4 people who haven't written" (named) or "Email 6 team members" (anonymous), one click, no confirm; after a send it reads "Sent 3h ago by Sam" and is disabled until the day passes. Zero recipients disables it too.
- **The "it's open" email**: a checkbox on the create form, on by default for a team retro, hidden for a teamless one, remembered nowhere. Sent once to every team member except the creator. It is a nudge for rate purposes: it sets `lastNudge`.

### The reminders

- **Owner assigned**: sent once per assignment when `ownerId` is set to someone other than the actor and that person has an email. Content: action text, who assigned it, due date, link to the retro. Anonymous-account owners get nothing, silently.
- **Due today**: sent once at **08:00 UTC on the due date**, a documented v1 constant because no timezone is stored anywhere. Scheduled with `ctx.scheduler.runAt` when `dueAt` is set and the job id stored as **`retroActions.reminderJobId: v.optional(v.id("_scheduled_functions"))`**; any change to `dueAt`, `ownerId` or `status` cancels the stored job and reschedules only if the action is still `open`, owned, and the instant is still ahead. If setting a date makes the instant already past, no reminder is scheduled. No overdue email, ever. The `review` stage remains the ask ([ADR-0017](0017-an-action-item-has-one-home-and-carries-over-by-staying-open.md)).

### Opt-out

- **`users.emailOptOut: v.optional(v.boolean())`**, one flag covering nudges and reminders. Toggled in Settings ("Email me about retros and action items") and by a **one-click unsubscribe**: an HMAC over the user id with a Convex env secret, no expiry, carried in a `List-Unsubscribe` header (RFC 8058 one-click) and a footer link, landing on `/unsubscribe?token=…`, which flips the flag without sign-in and shows a one-line confirmation with a link to Settings to turn it back on. The magic link is transactional and never subject to the flag.

### Send shape

- **The mutation records intent and schedules; the action sends.** A nudge or reminder mutation writes its state (`lastNudge`, `reminderJobId`) and calls `ctx.scheduler.runAfter(0, internal.email.send, …)`. The action resolves recipients at send time through `ctx.runQuery`, skipping anyone opted out, deleted, address-less or no longer a team member, so a person who leaves between click and delivery is never emailed and no reference to a deleted account is ever followed. One Resend call per recipient. `convex/email.ts` grows into a small `send` with per-kind templates; no SDK, no send log table.
- **Bounces** are left to Resend's suppression handling. *Unverified this session*: that Resend suppresses hard-bounced addresses automatically is a claim a person checks against the current Resend documentation before the build relies on it.
- Every send lands through the model layer, so [ADR-0018](0018-the-activity-chokepoint-owns-the-clocks-precision.md) applies unchanged: the nudge mutation bumps activity as any retro write does, and the internal send action never does.

### In-app

- The dashboard's Retros entry and the team page list retros whose shared stage is `collect`, with the total card count, the due date if set, and in a named retro the hint "You haven't added a card yet". No bell, no unread count, no inbox.

### Privacy policy

Draft copy for human review, alongside the ADR-0019 draft: in section 3, "send sign-in emails" becomes "send sign-in emails and, unless you opt out, emails about retros and action items in teams you belong to". Section 8 (rights) gains: "You can stop retro and action emails from Settings or from the unsubscribe link in any such email."

### Tests that enforce this

- A nudge in a named retro reaches exactly the team members with no card, never the sender, never a room attendee outside the team; in an anonymous retro it reaches every team member except the sender.
- A second nudge within 24 hours is refused and the first `lastNudge` stands; the "it's open" email counts as the first.
- A nudge on a teamless retro, or outside `collect`, or by a non-`stageFlow` holder, is refused.
- An email body never contains card text or the name of a non-writer, in either attribution mode.
- An opted-out, deleted, address-less or removed user resolved at send time receives nothing even when they were in the set at click time.
- The unsubscribe token flips exactly the addressed user's flag and a tampered token flips nothing.
- Setting `dueAt` schedules one job at 08:00 UTC on that date; changing date, owner or status cancels it; a past instant schedules nothing; marking `done` sends nothing.
- Assigning an owner emails that owner once, not the actor, and not an anonymous account.
- The internal send action never touches `rooms.lastActivityAt`.
