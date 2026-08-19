# Board direction A — structured columns: what the prototype actually showed

Throwaway prototype for [#258](https://github.com/spokvulcan/poker-planning/issues/258) on
map [#253](https://github.com/spokvulcan/poker-planning/issues/253).
File: `prototypes/board-a-columns.html`, branch `prototype/board-columns`, never merged.

Everything below was measured in Chrome against the running prototype on 2026-08-19, not
reasoned about. Where I am inferring rather than measuring I say so.

**Verdict up front.** The direction is buildable, familiar, and answers "where do I write this
down" better than either rival will. It fails on the ticket's fourth bullet. On a board where a
**stage** may not hide or lock anything, the three fixed columns are the only strong visual
structure on screen, and they are *the same in all six stages*. So the stage's entire visible
footprint on the board, measured, is one highlighted pill in the **stage list** plus two CSS
class swaps. The board does not change; the side panel does. If we ship direction A we should
say out loud that the stage lives in the rail and the panel, and the board is scenery.

---

## 1. What 40 cards across 3 columns actually looks like

Measured by shrinking the app frame and counting cards whose box is entirely inside the board
viewport. The prototype ships this counter in the top bar so you can reproduce it by resizing.

| viewport | fully visible | partly cut | fully off-screen | "Didn't go well" column visible |
|---|---|---|---|---|
| 1920 × 1080 | 34 / 40 | 2 | 4 | 70 % |
| 1512 × 982 (16" MBP default) | 23 / 40 | 3 | 14 | 52 % |
| 1440 × 900 | 20 / 40 | 3 | 17 | 45 % |
| 1280 × 800 | 17 / 40 | 3 | 20 | 36 % |
| 1024 × 768 | 12 / 40 | 2 | 26 | 26 % |

Board chrome (top bar + stage rail + stage brief) costs a flat **146 px** before a single card
is drawn, and the footer another 35 px. That is fixed cost, and it is already lean: 46 px of top
bar, 43 px of rail, 57 px of brief. I do not think it compresses much further while the rail and
the prompt both have to be visible.

Two things I did not expect:

**You can see more than I assumed, and it helps less than I assumed.** At a typical laptop size
about half the cards are on screen. But 40 cards is **445 words** (the footer counts them). Half
of that is ~220 words of unrelated single-sentence fragments in three parallel stacks. Nobody
reads that; they scan the first four words of each and stop. The failure mode is not "I cannot
find the card", it is "I have stopped reading". Density is a *reading* problem here, not a
*visibility* problem, and adding a bigger monitor does not fix it.

**The columns are unbalanced and that is the normal case.** The seed is 12 / 16 / 12, which is a
realistic sprint (people write more complaints than praise). "Didn't go well" needs 1,400 px of
scroll for 620 px of space at 1440 × 900 while "Went well" fits. So the three columns scroll
independently and immediately fall out of sync, and there is no longer any row-wise relationship
between them — which is fine, because there never was one. The column grid is doing nothing that
three separately-scrolling lists would not.

**Hiding does not reduce density.** With the reveal toggle set to hidden, the 33 cards you did
not write render as hatched blocks *the same size as the real cards* — because a card whose
height depends on its content would leak the content length. So `collect` looks exactly as full
as `discuss` does. Whatever [#262](https://github.com/spokvulcan/poker-planning/issues/262) and
[#270](https://github.com/spokvulcan/poker-planning/issues/270) decide, hiding will not buy the
board any room.

---

## 2. The grouping gesture, and the non-drag path

Both paths are implemented and both work. Drag is native HTML5 DnD; the non-drag path is
select-then-assign with a keyboard route.

**Drag onto card → new topic. Drag onto group → merge in. Drag onto column body → move / ungroup.**
That is the Parabol drop-target set (`REFLECTION_GRID` + `REFLECTION_GROUP`) plus a column move,
and it feels fine with a mouse for a single card. Verified working with a real pointer drag in
Chrome. Two problems appear immediately and neither is a prototype artefact:

- Native HTML5 DnD **does not fire on touch at all**, and has no keyboard path. That is the same
  hole Parabol has had open since 2019 and iceboxed on iPad. Any production build has to replace
  it (see §6).
- Grouping five cards by drag is five separate gestures against a list that reflows under you
  after each one. The teardown's user quote — "it's just like a drag while everyone sits there
  and watches me try to organise things" — is a *throughput* complaint, not a jank complaint, and
  the prototype reproduces the throughput exactly.

**Select-then-assign is better, and it is better by a lot.** Click the small box on a card (or
press `x` on the focused card), select more, press `g`. Measured: **11 keystrokes** to group
three cards spanning two columns, pure keyboard, no mouse. The same job by drag is three
gestures with two reflows in between. Three things fall out of the selection model almost for
free, and each one is a thing an incumbent does not have:

- **Merging two whole groups is one gesture.** Tick both group headers, press `g`. Votes merge
  (capped at 3/person), and the user-named title wins over the auto-generated one. This is the
  request Parabol has had open since 2020-03-03 and it costs nothing once the unit of the
  operation is a selection rather than a drop.
- **Cross-column grouping is not a special case.** The selection just spans columns.
- **One mutation instead of N.** Grouping five cards is one write, not four drops.

Auto titles are Parabol's non-AI rule (`getSimpleGroupTitle`): first three words longer than
three characters, marked `AUTO`, and a manual rename sticks. It produces titles like
"Preview deploys failed" and "release-please wrote changelog" — passable for a placeholder,
never good. It is honest to call it a label, not a name.

Undo is a full snapshot stack on `Cmd+Z` and it covers group, ungroup, merge, vote, advance and
stage-list edits. Parabol's one transferable lesson ("grouping must be reversible in one click")
is cheap to honour.

**What a group looks like once formed:** an inset container in `surface-3` with a rename field, a
`3 cards` chip, the topic's vote control on the header, collapse and break-apart. Cards inside
lose their own vote control (the topic owns the votes) and gain an eject arrow. It reads clearly.

**The one thing that genuinely breaks.** A group lives in exactly one column, so a card grouped
in from another column *physically leaves its own column*. Group "Slack threads are where
decisions go to die" (Didn't go well) with "A decisions channel where the outcome gets pinned"
(Ideas) and the Ideas column drops from 12 cards to 11. The prototype marks the migrant with a
`FROM IDEAS` chip and keeps the column counts honest, but the chip is a confession, not a fix.
And this is not an edge case: pairing a complaint with its proposed fix is one of the most useful
groupings a retro produces, and the format's own columns make it lossy. **The columns are a
write-time affordance that becomes wrong the moment grouping does its job.**

---

## 3. How voting reads on top of it

Fine, and this is the least interesting part of the direction. Per-person budget of 5, max 3 per
topic (Parabol's `RETROSPECTIVE_TOTAL_VOTES_DEFAULT` / `MAX_VOTES_PER_GROUP_DEFAULT`), both
enforced with a toast rather than a disabled control. Budget pips in the panel, remaining count
in the top bar, a `−  n  +` pill on every topic.

- **Tally hiding is a per-stage default, and it is the single most visible thing a stage does.**
  `vote` defaults tallies hidden, `discuss` defaults them visible, and advancing between the two
  flips 38 numbers on the board at once. Anyone would notice that. It is also the stage effect
  the viewer can most obviously override, which is exactly the "defaults, never forbids" shape.
- Vote controls are present in every stage; in `vote` they gain a pill outline and in every other
  stage they are ghosted until hover. That difference is real but small (see §4).
- **Regrouping after voting merges votes rather than dropping them** (capped per person), which
  I think is right and which nobody in the teardown documents doing. Breaking a group apart is
  the asymmetric case: the votes belonged to the topic, the topic no longer exists, and the
  prototype releases them and says so in a toast. That is a genuine open question for the data
  model, not something the prototype settles.

---

## 4. The hardest question: what a stage visibly changes

The stage removes nothing and locks nothing, so I built the experiment into the prototype rather
than arguing about it. Three switches in the stage brief — `PROMPTS`, `DEFAULTS`, `EMPHASIS` —
turn off the three carriers one at a time.

**With all three off, the board's rendered HTML is byte-identical across Group, Vote and
Discuss.** Measured: 33,018 characters, `===` in all three comparisons. What still differs is
exactly two things — the highlighted pill in the **stage list**, and the side panel.

With all three on, here is what each carrier is actually worth:

- **Prompts** (the sentence in the brief, and the column composer placeholders). Carries the most
  meaning per pixel and is the cheapest thing on the board. It is also the thing a participant
  reads once, at the moment of the advance, and never again.
- **Defaults** — only two of them here, hide-others' cards and hide-tallies. When one flips it is
  the loudest event on the board (see §3). Between `group` and `vote` **nothing flips**, because
  both default to tallies hidden. So between those two stages, defaults contribute zero.
- **Emphasis** — measured as the literal CSS delta between Group and Vote: select boxes gain a
  ring in Group, vote pills gain an outline in Vote. I screenshotted both at 2× and the
  difference is visible when you know to look for it and invisible when you do not. On a board
  with 40 cards, an emphasis change applied uniformly to all 40 reads as no change at all,
  because there is nothing unemphasised to compare it against.

**So: does the difference read?** Between `group` and `vote`, no. Honestly no. The board is the
same board and the two stages are distinguished by a rail pill and a side panel. Between `vote`
and `discuss` it reads loudly, but only because Discuss brings the two carriers that are not on
this list — the tally reveal, and the walk cursor.

This is not a bug in the implementation and I do not think it can be designed away inside this
direction. On an always-visible board the only emphasis available is *relative*, and a stage that
applies to every card equally has no relative emphasis to spend. Direction A can distinguish
`discuss` (which has a cursor) from everything else. It cannot distinguish `group` from `vote`,
and I would expect participants to ask "what are we doing now" at exactly that boundary — which
is the Parabol complaint the map already told us to design against.

The one honest mitigation I can see, and I did not build it: make the *panel* the stage, not a
sidebar. If the stage's tool occupied a third of the screen instead of a 330 px rail, the stage
would read. But at that point you are most of the way to direction B, and you have made the
40-card density problem worse by taking away width.

---

## 5. How the discussion walk reads

The walk works: order snapshotted on entry by votes descending, coverage tracked separately from
position, late votes accepted but not reshuffling, free jumping in the list, the board scrolling
to chase the cursor and dimming everything else to 34 %.

It reads badly, for one reason that has nothing to do with the columns.

**The walk is over 38 topics and 28 of them have no votes.** The coverage readout says
"2 / 38 topics discussed · 36 not yet discussed", which is accurate and useless. Nobody is going
to discuss 38 topics, so the walk opens by telling the team it has failed. Two consequences:

- Coverage needs a notion of **scope**. "36 not yet discussed" should probably be "8 of the 10
  topics that got votes are not yet covered" — the prototype shows both numbers side by side and
  the second one is the only one anyone would act on. Lu et al.'s r = .56 is about coverage of
  *relevant information*, not coverage of everything anyone wrote.
- The stage list says `group` is skippable. In practice it is not: skip it and the walk is 40
  entries long. That is a real tension with ADR-0010's "only `collect` and `discuss` are
  irreducible" and it is worth naming, because the machine will happily let a team walk into it.

**And the specific thing this ticket asked about — every other topic still on screen.** Dimming to
34 % is the strongest emphasis available without hiding, and it is not enough. When the cursor
lands on a two-line card in the middle column, that card is maybe 4 % of the board area and the
other 29 visible cards still occupy the rest. Two thirds of the screen is "Went well" and "Ideas",
neither of which has anything to do with the topic under discussion. The dimming reads as "the
board has gone dark" rather than "look here". Auto-scrolling the owning column to centre the topic
helps and introduces its own oddity: one column jumps while the other two sit still, which is
disorienting the first two or three times.

Late cards land correctly and the composer stays open in `discuss` ("A late card here is a
feature"), which is the ADR's requirement and better than TeamRetro's "leave it in Brainstorm".

Committing an action from the current topic is in the walk panel and flows to `close`. That part
is unremarkable in a good way.

---

## 6. Engine note

**What I used, and what it cost.** Native HTML5 drag and drop (`draggable`, `dragover`, `drop`),
about 45 lines, plus a full re-render on every state change. It works with a mouse in Chrome. It
has no touch support whatsoever, no keyboard path, and no drag preview control. It is the cheapest
possible thing and it is not shippable.

**Do not use `@xyflow/react`.** It is an absolutely-positioned node graph. Direction A's cards are
in ordered lists inside scrolling columns, which is the one layout React Flow does not do. The map
already says the retro board is purpose-built rather than the canvas, and nothing here argues
against that. (React Flow is the obvious engine for direction C, not this one.)

**Use `dnd-kit` if we ship drag.** It is pointer-events based so touch works, it ships a
`KeyboardSensor` and live-region announcements rather than requiring us to invent them, and it
does not require the dragged node to be a DOM child of the drop container — which matters here,
because a card must be draggable from a column into a group in a different column. Parabol's
471 hand-rolled lines in `useDraggableReflectionCard.tsx` are the counterfactual, and the bug
list attached to them (`#7297`, > 900 occurrences) is the price.

**But the sequencing matters more than the library.** If the non-drag path is the wedge — and
after building both I think it clearly is — then the thing to build first is the **selection
model**, which is ~150 lines of state and no dependency at all. Drag is then an optional second
input method layered on the same operations, and `dnd-kit` becomes a nice-to-have rather than a
foundation. Building drag first and bolting selection on afterwards is how you end up with two
code paths that disagree, which is roughly where EasyRetro is.

**Convex specifics that constrain this, from `docs/research/convex-realtime-board.md`:**

- There is no delta protocol; every invalidation pushes the **full** query result, and one card
  move re-sends the whole board to every subscriber (`:118-119`, `:385`).
- No optimistic updates exist anywhere in the repo, and the Convex client ships no throttling,
  debouncing or coalescing — a drag-heavy board must single-flight itself (`:30`, `:339-341`).
- The prescription there is already the right one: fractional indexing on a string key, one
  `moveCard` mutation **on drop only** with an optimistic update (`:128`, `:371`).

Given write-on-drop, a single drag and a single select-then-assign cost the same one mutation, so
the network argument between them is a wash for one card. It is *not* a wash for several:
grouping five cards is one mutation via selection and four via drag, each of which re-sends the
whole board to eight subscribers. That is a second, independent reason to build selection first.

**Rendering.** I re-render the whole board on every state change and it is imperceptible at 40
cards. Do not read that as a licence to skip memoisation in React — the prototype has no
reconciler, no subscription fan-out, and no optimistic layer. Treat 40 cards as free and 200 as
unmeasured.

---

## 7. Small things worth keeping regardless of which direction wins

- **Named readiness.** Eight rows with names and a per-person state, absent entirely during
  `collect`. Cost: one panel section. This is the teardown's §6 — Parabol has the feature and
  reviewers still cannot see it, because it is a ring on a button. A list of names is not a
  cleverer answer, it is just the right one.
- **The advisory timebox counting up past zero** (`+2:14`, bar turns amber, nothing happens) makes
  "advisory" legible in a way that a paused timer never would.
- **The `AUTO` badge on a machine-made group title.** One word, and it tells you the title is a
  placeholder rather than a decision.
- **The stage list as editable data.** Dropping `review` and adding it back is two clicks, and
  `collect` / `discuss` simply have no remove control. It makes ADR-0010's "skipping is absence
  from the list" concrete in about 20 lines.
- **The footer state strip.** Not shippable, but every prototype in this set should have one.

## 8. What I did not build

- No persistence, no multi-user, no presence. Readiness for the other seven is faked on toggle.
- Author identity is always shown; anonymity ([#262](https://github.com/spokvulcan/poker-planning/issues/262))
  is not modelled at all beyond the hide-others toggle.
- Mobile. Below 900 px the side panel is hidden and the three columns squeeze; I did not try to
  make that good, and Parabol's answer (one swipeable column below 704 px) is worth knowing about
  before anyone tries.
- Editing card text after creation.
- Reordering stages by drag — only remove and re-add.
