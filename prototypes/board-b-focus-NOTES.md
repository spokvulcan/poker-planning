# Board direction B — guided single-focus flow

Throwaway prototype for [#259](https://github.com/spokvulcan/poker-planning/issues/259) on map [#253](https://github.com/spokvulcan/poker-planning/issues/253).
Branch `prototype/board-focus`, never merged. Open `prototypes/board-b-focus.html` in a browser; no build, no network.

Seeded with 40 sprint-retro cards from AgileKit's own recent history, 8 named people (7 in the room, Dan joins
during Discuss in one scenario), 6 pre-filed themes, 27 loose cards, all six stages walkable in both directions.
The "Prototype instruments" panel on the right holds the full state readout, 43 free-play buttons and 6 guided
walkthroughs. Start with **Softness stress test**, then close the panel and judge the board on its own.

---

## The central question: can a single-focus board be soft?

**Yes, but not for the reason the brief assumes, and the qualification is the finding.**

The brief says single-focus "draws its power from taking everything else off the screen". Building it, that turns
out to be two separable things that got welded together by Retrium and never pulled apart since:

1. **Taking everything else out of view.** One large thing in the middle, nothing competing for attention.
2. **Taking everything else out of reach.** You may not write, group, vote or navigate.

Only (1) is where the power is. (2) is what Retrium's own reviewers hate, and every complaint in the teardown is
about (2): "it is hard to host a creative retrospective with Retrium", "I lost the ability to move the cards",
"you can't add notes during grouping and voting". Nobody anywhere complains that the screen showed one thing.
Parabol has already half-conceded this in code: its discuss stages are created `isNavigable: true` for everyone,
so lockstep binds only the phases before Discuss.

So focus is a **layout** property, not a **permission** property, and ADR-0010 only takes away the permission half.
In the prototype every capability stays open in every stage and there is still, at every moment, exactly one big
thing you are looking at. Drive it and that holds up.

**The qualification.** Softness costs single-focus its *guarantee*, and the guarantee was half of what the
direction was selling. "One thing at a time" as a default means "one thing at a time unless somebody doesn't", and
once you build that affordance you must build UI for it being used. Count what the soft version needs on screen
that the enforced version does not:

- a six-chip stage rail (because you can go anywhere)
- a "look elsewhere" control in the dock
- a divergence strip when your view and the pointer disagree
- a "rejoin the team" button
- an always-present card composer in the dock
- named per-person presence and readiness in the app bar

That is six pieces of permanent chrome, all of which exist purely because nothing is enforced. The direction set
out to be the anti-whiteboard, and softness pushes it back toward a dashboard. It is still much quieter than a
canvas, but it is not the austere thing the brief imagines. This is the real trade and it is the thing to weigh.

**What would flip my answer.** If the mental model of single-focus is *"the team is guaranteed to be looking at
the same thing"*, then the answer is no, softness kills it, and #263 would have to reopen. If it is *"the board
shows one thing at a time and gets out of the way"*, the answer is yes and this works. I think the second reading
is the right one and the evidence supports it, so I am not recommending #263 be reopened.

---

## The biggest problem with this direction

**A soft machine does not remove the failure it looks like it removes. It relocates it from "the tool refused you"
to "the tool accepted you and nothing came of it".**

Run the Softness stress test and watch this happen twice:

- Write a card during **Vote**. Accepted instantly, no friction, no warning. It appears on the ballot as a topic of
  one. And it is now structurally guaranteed to lose, because the six people who already voted have spent their
  budget and have no reason to come back. It enters the walk near the bottom on zero votes.
- Write a card during **Discuss**. Accepted again. It is appended after the whole snapshotted order, behind every
  topic nobody has reached yet, in a walk the coverage readout is already telling you will not finish.

Retrium tells you no. This tells you yes and then quietly buries it. Softness is better, but it is not the same as
the card mattering, and it would be easy to mistake one for the other.

The prototype's answer is the strongest one a soft machine has available: it cannot fix the consequence, so it
refuses to hide it. The card is tagged `written during Vote`, the coverage strip draws late arrivals as dashed
cells and counts them separately ("2 arrived after the order was set"), and the walk row is flagged `late`. That
is honest. Whether honest is enough is the product call.

This cuts directly against one line in ADR-0010: *"A late card during Discuss is a feature, not an edge case. It is
frequently the best card in the retro."* Built out, that is aspirational. The soft machine accepts the best card in
the retro and puts it fifteenth. If the map genuinely believes late cards are often the best ones, acceptance is
not enough and something small is missing: a **"raise this now"** that moves the walk cursor to a late card rather
than queueing it. Jump-to-any-topic makes it possible; the default order buries it. That is a new ticket, not a
reason to reopen #263, because the softness is right and the missing piece is an affordance.

---

## Answers to the brief's bullets

### The write-in view, and what people see while writing

Collect is a composer with three prompt tabs (Kept us moving / Slowed us down / Worth trying), your own cards
listed beside it, and the team's cards in the third column, rendered according to the visibility switches. Live
typing indicators sit on the avatars in the app bar. Readiness is deliberately absent here and the board says so in
one line, because the only signal in Collect is whether you have written a card.

Prompts are phrased as "Kept us moving / Slowed us down" rather than "what went badly" on purpose. §5.4 says the
classic negative opening is an invitation into the complaining cycle and structuring prompts are the evidenced
counter-measure.

### Visibility as a flippable variable (#262 / #270)

Three switches, reachable from the dock's **Visibility** button and mirrored in the instruments panel:

| switch | default | what it is |
|---|---|---|
| `hideUntilPointerLeavesCollect` | on | #270. Others' cards render as grey skeleton chits with a count. |
| `showAuthors` | on | #262. One global flag today; see the note below. |
| `hideTalliesDuringVote` | on | Not a locked decision. Retrium hides, Parabol reveals implicitly by advancing. |

Two things worth carrying into #270 that only showed up once it was built:

**The reveal moment has to key off the pointer *leaving Collect*, not off arriving anywhere.** I first wired it to
"entering Review" and it broke the moment I skipped Review in the stage-list walkthrough. Leaving Collect is the
only formulation that survives skipping and reordering, and it is also the only one that needs no new state: it is
one boolean latched on the transition.

**How good direction B is depends partly on #270's answer.** With hiding on, Collect is honestly single-focus: you
have nothing to look at except your own writing, which is the whole thesis. Turn hiding off and Collect
immediately becomes a two-column reading screen and the thesis is weakest in exactly the stage where the evidence
is strongest (exposure narrows the categories explored while leaving the count intact, so the damage is invisible
in any metric a tool would track). If #270 lands on "nothing is hidden", direction B loses something the other two
directions never had.

**`showAuthors` is currently one global flag, which is the crude version.** Turning it off hides authorship in
Discuss too. The teardown's gap #1 (anonymous while writing, attributed while discussing) is fully expressible in
ADR-0010's model, because per-stage state hangs off the entry, and it costs almost nothing. I did not build it
because it is #262's call, but it is cheap and it is unclaimed across the whole category.

### The moment other people's cards become visible

Advancing out of Collect. The next stage opens with a one-line green banner: *"40 cards from 7 people became
visible when the team left Collect."* The banner is deliberately unglamorous. Nobody presses reveal, there is no
countdown, no animation. The stage machine hid nothing and revealed nothing; visibility is a read-time projection
and the banner says so.

This dodges both failure modes the teardown names in §1b: global facilitator-gated reveal creates "everyone waits
for one person", self-serve per-author reveal creates "nobody goes first". Tying it to a move a person was going to
make anyway costs zero extra decisions.

### Discussion mode

One theme large, its cards beneath, the walk list beside it, action capture underneath.

- **Cursor and snapshot.** Order is built on entering Discuss: by votes descending if a Vote stage ran before this
  point in the list, creation order otherwise. Skip Vote or move it after Discuss in the stage-list walkthrough and
  you can watch the fallback fire. Votes cast afterwards still count and still display, and the panel says in one
  line that they do not reshuffle.
- **Coverage, not position.** A cell strip, one square per topic, green for covered, outlined for current, dashed
  for arrived-late. The readout reads "3 of 14 covered · 11 not yet discussed · 2 arrived after the order was set".
  There are separate controls for **Covered, next** and **Skip, not covered**, so position and coverage genuinely
  come apart. This is the direct implementation of Lu et al., coverage r = .56 against focus r = .25.
- **Advisory timebox.** Runs, goes amber, and does nothing at all. Blow through it in the coverage walkthrough and
  the only thing that happens is the copy changing to "Over the advisory timebox by 02:40 ... nothing happens
  either way".
- **Pace.** Honest arithmetic, not a prediction: elapsed per covered topic, projected against time left, rendered
  as "at this pace you will reach 6 of 14". See the caveat under "does it feel controlling".
- **Action capture.** Inline on the topic, in the flow, not at the end. Three fields: what we will do, an optional
  *when or if* trigger, and an owner. If-then phrasing beats vague intent (d = .43 vs .29) and a named owner is the
  best-supported accountability mechanism available, so both are invited and neither is required. No count limit is
  enforced anywhere, because three is the worst cell in the only relevant meta-analytic table.

### Grouping, and why it is the best thing here

Not asked for in the bullets, but it is the strongest result and it falls out of single-focus for free.

**One card at a time, dealt not queued, filed with a number key.** No drag anywhere in the prototype. Each person
present is dealt a *different* unfiled card, so grouping becomes parallel written work instead of one person
dragging while seven watch. That is Parabol's loudest user complaint ("It's just like a drag while everyone sits
there and watches me try to organize things" / "It's really not a group effort to group things") answered
structurally, and it puts grouping on the side of the medium §5.2 says wins.

It also hits the teardown's gap #7 with no AI: every path is a button or a key, filing is reversible, and the whole
thing is keyboard-reachable, which is more than Parabol's 471 hand-rolled lines of pointer handling manage.

Neither of the other two directions can do this. Columns and canvases both want you to see the whole field, which
is precisely what makes them a spectator sport.

**What it costs**, honestly: you cannot see the emerging shape. You file "npm fought us over legacy-peer-deps"
under "Dependency upgrades ambush us" without knowing that three cards later someone else will open "Lockfile
churn". Merge-two-themes therefore stops being a nice-to-have and becomes mandatory, and I did not build it. A
canvas is genuinely better at answering "what shape is this data".

### The ballot, and the one place the anchoring evidence is actionable

**Ballot order is shuffled per person**, deterministically, and the panel says so. §5.4 is blunt that anchoring is
essentially immune to warnings, incentives and expertise, so a "don't be swayed by the top item" note would do
nothing; sequence is the only lever there is. Shuffling is only possible because the ballot is one screen rendered
per person. On a shared canvas everyone looks at the same spatial arrangement, so per-person sequence is
impossible by construction. This is a real, free, unclaimed advantage of direction B and it is worth weighing.

Budget follows teardown gap #10: suggest √topics (Retrium's number) and then *let you change it*, which nobody
does. Max 3 per topic.

### What a person sees when they navigate away from the shared stage

Click any rail chip, or use "Look elsewhere" in the dock. Your view moves, the team's does not. Then:

- The rail shows two markers: a filled indigo chip for the shared pointer, a dashed outline for where you are.
- An amber strip appears: *"You are looking at Collect. The team is in Vote. [Rejoin the team]"*.
- The accent rule above the focus panel drains from indigo to grey. The indigo accent is reserved, everywhere in
  the prototype, for "this is where the team's shared attention is", so its absence means you are alone.
- Your avatar dims in the roster and gains a grey pip. Everyone else can see you have wandered.
- The stage kicker changes from "the team is here" to "you are here on your own".

**Honest assessment of that:** the amber strip does all the work. The accent drain is too subtle to notice on its
own, and I would not claim otherwise even though it is the design idea I like best. Keep both; do not rely on the
colour.

If the pointer moves while you are away, or while you are **typing**, you are not moved. Run the "Typing when the
team advances" walkthrough: your draft survives intact, your view stays put, and the strip tells you where everyone
went. That is Parabol's `isInterruptingChickenPhase` bug fixed properly, by making the rule "never interrupt"
rather than maintaining a hand-curated set of phases where interruption is rude.

### Can a latecomer catch up?

**On state, yes, better than any incumbent. On content, no, and single-focus is the reason.**

Run "The latecomer". Dan joins during Discuss with three topics already covered. He lands on the shared stage and
gets, immediately: a coverage strip showing exactly what has and has not been discussed, the full walk list with
vote counts, and free navigation back to Collect to read all 40 cards without stopping anybody. He writes the card
he had in his head and it is accepted. All of that is available *because* of the softness. Under enforcement, none
of it is: Retrium force-follows him to the facilitator's screen, and Parabol lets him go backward but gives him no
view of what the walk has covered.

What he cannot get is **what was said**. The board records coverage, not conversation, and most of a retro's value
is in the conversation. Single-focus makes this worse than the alternatives would: on a canvas he could at least
read the shape of what happened from the artefacts on the board. Here he sees one topic and a row of green squares.

That is a real, direction-specific cost and it is not fixable with more UI. It is fixable with a habit (capture
actions as you go, which the board does push) or with something out of scope (notes per topic).

### Does it feel controlling, even though nothing is enforced?

**Yes, mildly, and not because of the enforcement.** Three sources, in descending order:

1. **The pace projection.** "At this pace you will reach 6 of 14" is the only element that felt like it was grading
   me. It is also the most evidence-backed thing on the screen. If one thing gets cut for feel, cut this, or hide
   it behind the coverage panel rather than putting it in the running readout.
2. **The rail is a progress bar.** Six numbered chips with a "you are here" marker reads as a track you are on,
   whether or not you can step off. That is the legibility cost of making the stage list visible data, and it is
   mostly unavoidable if you want people to know where the team is. Numbering is legitimate here (the sequence is
   the subject) but it does carry the schoolroom feeling.
3. **Named per-person readiness.** Legible, per teardown gap #6, and evidently what works (TeamRetro's literal
   version beats Parabol's progress ring). It is also social pressure: six green ticks and your name blank is a
   nudge. Correctly absent in Collect, which is the stage where that pressure would do actual damage.

Net: nothing is enforced and it still feels guided, because guidance is what it is. Whether that is a problem
depends entirely on whether the team wanted guidance, which is exactly the question the three directions exist to
separate.

---

## Engine note: what production would need, and why

The pure module at the top of the file (`RetroStages`) is about 730 lines and is written to lift into
`convex/model/retroStages.ts` roughly as-is: `createInitialState` + `reduce(state, action)` + selectors, no DOM, no
timers, no globals reaching in.

**What lifts cleanly.** The stage list as stamped ordered data with per-entry ids and timeboxes; `advance`,
`rewind`, `movePointerTo`; the reveal latch; the topic derivation (a topic is a theme, or a card with no theme,
which is what makes Group skippable without a special case); the vote budget and `suggestedBudget`; the per-person
deterministic ballot shuffle; the walk snapshot and coverage; readiness clearing on every pointer move.

**Why this direction is unusually kind to Convex.** `docs/research/convex-realtime-board.md` found the room
document is the bottleneck: ADR-0005's activity chokepoint means every write patches a doc all twelve members
subscribe to, and Convex has no delta protocol, so each invalidation resends the whole result. Direction B moves
the shared pointer maybe six times in an entire retro. All the heavy write traffic (cards, filing, votes, actions)
is per-row on separate tables. **There is no drag stream at all**, which is the single biggest realtime cost the
canvas direction has to pay. If write amplification matters to the decision, this direction is the cheap one.

**Two things that do not lift cleanly.**

1. **The walk is hot mutable state and must not live on the retro doc.** Order array plus covered array plus
   cursor, written once on entry and then mutated on every "covered" and every cursor move: roughly 30 patches
   during a 14-topic discussion, each one re-sending the retro doc to everybody. Give the walk its own row.
2. **Deal-out is racy.** In the prototype `deckCardFor` derives each person's card from their roster index over the
   unfiled list. Pure, zero storage, and fine single-player. In reality two people can be dealt the same card the
   moment the roster or the unfiled list shifts between reads, and then one of them files it and the other's screen
   changes under them. Production needs a soft claim, and the realtime research already found presence has a free
   payload slot for exactly this. Use presence, not a table: the claim should die with the session.

**Other production notes.**

- Timeboxes should reuse the pure math in `convex/timerState.ts`, not the `TimerNode` canvas row, per ADR-0010.
- There is no stage guard to write, which means every retro mutation must behave sanely in every stage. This
  prototype doubles as a test list: write a card in each of the six stages, vote after the walk snapshot, file a
  card after the walk started, rewind out of Close, and skip the stage the pointer is currently on.
- **`skipStage` when the pointer is on the stage being removed needs a decided rule, not an accident.** The
  prototype moves the pointer to the following entry, falling back to the previous one. Something has to be
  specified here and it is easy to miss until someone does it live.
- The reveal latch (`pointerHasLeftCollect`) is one boolean and is the only piece of the machine that is not
  reversible by rewinding. That is deliberate: rewinding to Collect must not un-show cards people have already
  read. Worth stating explicitly in the spec, because it is the one place "advancing hides nothing" needs a partner
  rule, "rewinding does not hide anything either".

---

## Scorecard

Good:

- Grouping. Non-drag, dealt in parallel, keyboard-native. Unclaimed in the category and only possible in this
  direction.
- Per-person shuffled ballot. The only actionable response to the anchoring evidence, and structurally impossible
  on a shared canvas.
- The discussion walk, with coverage separated from position.
- Latecomer catch-up on state.
- Very low realtime write amplification.
- Free navigation with no yanking. Straightforwardly better than both Retrium and Parabol.

Bad:

- Softness converts hard refusals into soft acceptances with the same outcome. Honest labelling is the best it can
  do, and ADR-0010's "a late card is frequently the best card" is not yet true in this build.
- Six pieces of permanent chrome exist only because nothing is enforced. The anti-whiteboard is less austere than
  it wanted to be.
- No peripheral awareness. You cannot read the emerging shape while grouping, or the room's energy while writing.
- A latecomer catches up on state but never on the conversation, and one-topic-at-a-time is why.
- Merge-two-themes is mandatory in this model and is not built.

Open, and worth deciding before anyone builds:

- #270's answer partly determines how good this direction is. Hiding on makes Collect coherently single-focus;
  hiding off weakens the thesis in its strongest stage.
- Per-stage-entry reveal and anonymity (anonymous while writing, attributed while discussing) are cheap here and
  unclaimed anywhere.
- Whether the pace projection stays. It is the most evidenced element and the one that feels most like grading.
