# Board direction C — spatial affinity canvas: what the prototype actually showed

Throwaway prototype for [#260](https://github.com/spokvulcan/poker-planning/issues/260) on map
[#253](https://github.com/spokvulcan/poker-planning/issues/253). File:
`prototypes/board-c-canvas.html` — one self-contained page, no build, no network. Open it.

Everything below that says "measured" was measured in Chrome on this machine during the session
that built it. Everything that says "read" has a `file:line`. Everything else is marked as
judgement.

---

## Verdict in one paragraph

Free 2D placement genuinely earns something no column board can express: *"these five cards are
the same complaint"* is a spatial fact you read in half a second, and my seeded CI-flake clump
does read that way. But the direction has one structural defect that produces most of its other
problems — **the board has no legible whole**. At the zoom where a card is readable you can see
four to six cards; at the zoom where the whole board fits (measured: **27%** with 40 cards) you
can read nothing at all. Proximity grouping turns out to be a *gesture for creating* clusters
rather than a *representation of* them, so you end up building explicit cluster objects anyway
and paying for the canvas on top. The discussion walk survives, but only by becoming a viewport
teleport machine. On a phone it is not a serious proposition. `@xyflow/react` could carry this,
and if C wins it should — but the saving is much smaller than the ticket assumes, because the
existing room canvas uses almost none of the surface a retro board would need.

If the decision comes down to visual continuity with planning poker alone, C wins that on a
walkover — it is the same library, the same dotted background, the same drag feel, and users
would not perceive a mode change. That is a real product argument and it should be weighed. It
is just not, on this evidence, an argument about whether the retro works.

---

## Answering the ticket's bullets

### Does proximity-as-grouping actually read, or does it need explicit cluster objects anyway?

**It reads, narrowly, and then it needs explicit objects anyway.**

The prototype implements proximity honestly: single-linkage union-find over rectangle *gaps*
(not centre distance), recomputed continuously, drawn as an offset convex hull. No cheating, no
snapping, no pre-baked groups.

What I saw:

- **2 to 5 cards at a stable distance read as a group immediately.** The hull is unambiguous and
  needs no explanation. This is the direction's real asset.
- **It is unstable in the way that matters.** Drag one member 40px and the hull dissolves; drag
  an unrelated card past it and the hull swallows it. There is no hysteresis available that
  isn't arbitrary.
- **The threshold has no correct value.** The prototype exposes it as a slider precisely so you
  can watch this: at 20px you get almost no groups, at 130px most of the board is one blob. I
  left it at 58px because that is what made my seed look deliberate — which is itself the
  finding. The seed needs a **deterministic relax pass** (`relaxSeed()` in the file) to guarantee
  the intended clumps read, because otherwise whether two cards "look grouped" depends on how
  long their sentences happen to be. That is not a demo hack I am hiding; it is the honest shape
  of the problem, moved to load time.
- **With 8 people churning and 200 cards, proximity produced 10–12 sprawling hulls** that
  swallowed the three named clusters entirely. Screenshot-equivalent: turn on both toggles and
  look. The signal does not survive the mess.

The decisive point is not aesthetic. **The moment a group needs a name, a vote total, or a place
in the discussion walk, it needs an identity — and a shape computed from distance has no
identity.** So the prototype does what any real implementation would have to do: `Name it`
promotes a transient proximity shape into a real `cluster` object with an id, a colour and a
name. After that it is a first-class thing you drag as a unit, and proximity detection ignores
its members.

So the answer is: proximity is a **good affordance for forming groups** and a **bad
representation of them**. You get the canvas *and* the cluster objects, not the canvas *instead
of* them. That is more machinery than a column board, not less.

Two smaller findings inside this:

- **A pair reads worse than a trio.** The two on-call cards form a hull, but a two-card hull
  looks like an accident. Somewhere around three the shape starts asserting itself.
- **Membership has a silent edge.** Drag a card far enough out of a named cluster and it has to
  leave, or the hull stretches into nonsense. The prototype does this at 170px and toasts about
  it. Every threshold here is arbitrary and every one of them will surprise somebody.

### Non-drag grouping (the teardown's unclaimed wedge) — does it survive here?

Implemented: Shift-click or Shift-drag a marquee, then `G`. It works, it is keyboard-reachable,
and it is genuinely better than Parabol's 471 lines of pointer handling.

**But on a spatial canvas it has to answer a question a column board never asks: where do the
cards go?** A cluster has to be visible, and a cluster whose members are scattered across the
board is not. So `G` relocates them — the prototype packs them near their centroid and toasts
*"Grouped 4 cards — and moved 3 of them to do it"*.

That is a real cost. On a canvas, position is authored content: somebody deliberately put that
card next to that other card. A keyboard group overwrites that. Direction C is therefore
**structurally hostile to the one grouping model the teardown says is unclaimed** (`§What's
genuinely unsolved`, item 7). A column board has an obvious home for a keyboard-formed group;
this one does not.

### Pan/zoom with 40 cards and 8 people moving things

The engine is not the problem. Measured per-frame work, hand-rolled, Chrome, this machine:

| | 40 cards | 200 cards |
|---|---|---|
| `detectProximity()` (O(n²) gap test) | 0.08 ms | 1.46 ms |
| `renderCards()` (all transforms) | 0.79 ms | 3.27 ms |
| `renderUnder()` (zones + hulls + walk) | 0.55 ms | 3.92 ms |
| `renderMinimap()` | 1.18 ms | 2.04 ms |
| `stepBots()` (8 simulated draggers) | ~0.00 ms | 0.02 ms |

At 40 cards the steady-state frame is around **2.5 ms** — nowhere near a budget problem. At 200
it is around **9 ms** if everything runs in one frame, which is why the prototype throttles hull
re-derivation to ~6 Hz. (I could not sample live FPS: the tab kept getting backgrounded by
parallel work in the same browser and `requestAnimationFrame` is suspended there. The per-frame
work numbers above are the honest substitute, and they are the number that matters.)

What *is* a problem is human, not computational:

- **Other people's cards move under your cursor.** With the simulation on, cards you were
  reading slide away mid-sentence. The soft lock (a coloured ring plus a name tag, modelled on
  the presence payload's free slot — `convex-realtime-board.md` §6.3) makes it legible but does
  not make it less annoying. This is the Parabol complaint *"participants moving cards during
  others' reflection"* reproduced exactly, and a canvas makes it worse than a column board
  because there is no cell for a card to be safely inside.
- **The board grows.** 40 cards already spans ~3500 × 2600 world units in the seed. Nobody
  prunes; the second retro on the same board is worse.
- **The minimap is not optional.** I built one because Spreo's 2026 roadmap adding a minimap and
  Ctrl+F is the vendor conceding that lost-on-canvas is real. It helps. It does not fix
  illegibility, it just tells you where you are inside it.

### Laptop trackpad

Good, and this is the direction's best interaction moment. Two-finger scroll pans, pinch zooms
(browsers deliver trackpad pinch as `ctrl`+wheel, which the prototype handles as the real pinch
path), drag on empty space pans, `Space`+drag pans, `+`/`−`/`0` work. It feels like Figma
because it is the Figma model, and everyone already knows it.

One caveat worth noting against the existing room: `room-canvas.tsx:264` sets
`panOnDrag={[1, 2]}` — **middle and right mouse button only**, with left-drag bound to
`selectionOnDrag`. That is a mouse-first choice, and it is not what a trackpad user expects. If
C is chosen, that binding should not be inherited.

### Mobile

**Bad, and not fixable within the direction.** Rendered at 390 × 780 in a real iframe: the rail
correctly collapses behind a `Panel` toggle, the stage bar scrolls horizontally, the minimap
hides. And then you can see **roughly two cards**. Zoom out to see structure and you can read
nothing.

There is no version of "free 2D placement" that shows a useful amount of a 40-card board on a
phone. Spreo, the most retro-native canvas in the market, ships **no mobile or tablet support at
all** (`retro-tool-teardown.md`, Spreo section) — that is not laziness, it is the same wall.
Any mobile story for direction C is a *different, non-spatial view* of the same data, which
means building a second board anyway.

### Does the freedom produce insight or mess?

**Both, and the ratio depends entirely on how much the board is used.**

Insight: the seeded state is genuinely more informative than four columns would be. "CI is not
trustworthy" as a tight five-card blob *next to* a separate four-card blob about review latency,
with a deliberately homeless card floating between the zones, says something about the sprint
that a column list flattens.

Mess: turn on the simulation for sixty seconds and the arrangement is gone. Nobody vandalised
it; eight people each made a locally reasonable move. Soft zones do not resist this at all — by
design, since they never forbid — so the only thing holding an arrangement together is social
convention, which is precisely the "every safeguard is a human asking people not to scroll over
there" finding from the teardown.

The honest summary: **a canvas rewards a single curator and punishes a crowd.** Retros are a
crowd.

### How does the discussion walk survive in 2D?

Better than I expected, and the mechanism is the most interesting thing in the prototype — but
it survives by *replacing* spatial navigation rather than using it.

What is implemented, faithful to ADR-0010:

- Order **snapshotted on entering `discuss`**, by votes descending because a `vote` stage ran
  (creation order otherwise). Votes cast afterwards are still accepted and do not reshuffle.
- Tracks **coverage, not position**: `visited` and `covered` are separate sets, so the readout
  says *"13 of 13 topics not yet covered · 1 visited but not marked"*. You can visit without
  covering and cover without visiting.
- Topics are named clusters plus any loose card that got a vote.
- `N`/`P` walk, `C` marks covered, and the viewport tweens (480 ms, ease-out cubic — "lift,
  don't bounce" per `DESIGN.md`) to fit the topic, capped at 105% zoom.
- A **walk line**: the route drawn as a numbered traverse across the board, dashed for the part
  not yet walked, solid for the part behind you. The numbered stops are HTML, deliberately held
  at constant *screen* size, because a navigational marker that shrinks with zoom is useless
  exactly when you need it.

Three findings:

1. **The walk line makes the problem visible rather than solving it.** With 13 topics ordered by
   votes, the route is spaghetti — 1 top-left, 2 mid-board, 3 top-centre, 8 in a cluster on the
   right, 13 far right. Vote order and spatial position are uncorrelated by construction, so the
   traverse crosses itself repeatedly. Look at the minimap during `discuss`: it is a tangle. I
   think drawing it is still right (you can see coverage as unfilled circles at a glance) but it
   is honest evidence *against* the direction, not for it.
2. **Flight vs cut is a real choice and neither is good.** The panel exposes both. Animated
   flight (~500 ms) preserves the sense that you moved somewhere, and after four or five hops it
   is tiring. Instant cut is faster and you lose all sense of where you are. Try both; that
   toggle is the disorientation test.
3. **The viewport move is the walk.** On a canvas, "next topic" means "everyone's screen
   teleports". That is Retrium's force-follow behaviour arriving through the back door — the
   thing ADR-0010 explicitly rejected as the failure mode of archetype 1. The prototype only
   moves *your* viewport, which is correct per the settled constraint, and the consequence is
   that eight people are now looking at eight different parts of the board while discussing one
   topic. Neither branch is comfortable.

A fourth, smaller: **a card written after the snapshot is not a stop, and on a canvas it is also
somewhere you may never pan to.** ADR-0010 calls the late card "frequently the best card in the
retro". The prototype adds a `Written after the snapshot` panel with a `Go` button, because
without it the card is effectively invisible. A column board at least puts a late card at the
bottom of a column somebody is looking at.

---

## Realtime cost — and why the research's headline recommendation does not apply here

Measured board payloads (rough JSON of the card rows, as an unprojected `.collect()` would
return them): **7.0 KB at 40 cards, 32.5 KB at 200**.

`convex-realtime-board.md` §5.1 is the load-bearing fact and it is verified in that document
against the installed package: Convex has **no delta protocol**. `StateModification` is
`QueryUpdated { queryId, value }` where `value` is the *entire* result
(`protocol.d.ts:118-142`), the client replaces it wholesale (`remote_query_set.js:28-42`), and
compares by *reference* (`optimistic_updates_impl.js:104`) so every push is also a re-render
(`queries_observer.js:108`) whether or not anything changed.

So one card move on a 40-card board = 8 members × 7 KB = **56 KB on the wire and 8 re-renders**.
The prototype's telemetry panel computes this live from the real seed, and the write-mode
selector (settle / 100 ms / every frame) exists so you can watch the number move. Settle-only is
obviously right; every-frame is there to show what happens if anyone is tempted.

**Three things specific to this direction:**

1. **§2's fractional-indexing recommendation buys direction C nothing.** That finding is about
   ordering a list, and free 2D placement has no list — it has `{x: float, y: float}`. The good
   news falls out anyway: a card move is a one-row read/write set, so two people moving different
   cards do not conflict at all, which is exactly the property §2.2 was chasing. Direction C gets
   that for free. It just does not get it *from* fractional indexing, and the research's headline
   ordering recommendation should not be cited in its favour.

2. **The asymmetry against a column board is the write *rate*, not the write *cost*.** Both
   designs write one row per move. The difference: on a column board, a drag that ends in the
   same (column, position) is a **no-op with no write**, and there are only so many meaningfully
   different positions. On a canvas every drag ends at new float coordinates, so **every drag is
   always a write** — and worse, proximity grouping makes *fine positional nudging* the primary
   interaction. "Move it 20px closer so it joins the hull" is the core gesture of this direction,
   and it is a write that a column board cannot even express. That is a genuine, structural
   multiplier on write volume, and it is the one realtime argument against C I would actually
   defend.

3. **The activity chokepoint compounds it.** `model/canvas.ts:201` — every
   `updateNodePosition` calls `Rooms.updateRoomActivity`, which patches the shared `rooms`
   document. Eight people dragging means eight writers contending on one row, and `rooms.get` is
   in every member's subscription (ADR-0005 makes this deliberate for poker). For a
   nudge-heavy board this needs an explicit exemption, which §7.2 of the research already
   flagged.

Mitigations that would be mandatory, not optional: split the subscription by churn rate (§5.3),
project the return value, keep vote counts off the card row, and add optimistic updates — of
which the repo currently has **none** (`convex-realtime-board.md` §4.1; no `withOptimisticUpdate`
anywhere).

---

## Could `@xyflow/react` carry this instead of a new engine?

**Yes — and it should, if C is chosen. But the reuse argument is much weaker than the ticket
assumes, and one piece of the existing machinery is a liability rather than an asset.**

I hand-rolled pan, zoom, drag, marquee, pinch and viewport tweening in roughly 250 lines and it
performs fine, so "can we do it without the library" is answered: yes, easily. The real question
is whether adopting React Flow is cheaper, and what "reuse" actually means here. I had the
existing room canvas torn down with `file:line` evidence before writing this.

**What the room canvas actually uses today** (`src/components/room/room-canvas.tsx:3-13`):
`ReactFlow`, `Background`, `ReactFlowProvider`, `useReactFlow`, `useEdgesState`,
`ConnectionMode`, `Handle`, `Position`. That is all. Confirmed unused anywhere in the repo:
`Controls`, `MiniMap`, `Panel`, `NodeResizer`, `NodeToolbar`, `applyNodeChanges`,
`getViewportForBounds`, `fitBounds`, `setCenter`, `setViewport`, `useStore`, `useViewport`,
`onSelectionChange`, `onNodeDragStart/Drag/DragStop`, `onMove`, `onlyRenderVisibleElements`,
`nodeOrigin`, `nodeDragThreshold`.

So the room uses React Flow as a **static diagram renderer**:

- **Bounded node set.** ~25–26 nodes for an 8-person room: 1 timer + 1 session + 8 players +
  1 results + ≤1 note + 14 voting cards. There is no user-creatable free node anywhere; the only
  creation affordance hides itself once a note exists (`node-picker-toolbar.tsx:29-32`). Forty
  free-placed stickies is a shape this code has never carried.
- **Edges are system-owned and inert.** `nodesConnectable={false}` (`:256`), `onConnect` is an
  explicit no-op (`:201-204`), every edge removal is filtered out (`:191-198`), and every handle
  is `aria-hidden` with no `isConnectable`. A retro canvas has no edges at all, so the edge store
  and renderer are pure overhead.
- **No selection handling.** `selectionOnDrag` and `elementsSelectable` are on, but
  `onSelectionChange` is never used; `selected` is consumed only as a render flag — and abused at
  `buildCanvasNodes.ts:143` to mean "this is my vote".
- **No grouping.** `parentId`, `parentNode`, `extent: 'parent'` — zero hits across `src` and
  `convex`. React Flow's built-in mechanism for nesting nodes inside a container, which is
  exactly what an explicit cluster wants, has never been touched and has no schema behind it.
- **No viewport API.** Only `fitView`, `zoomIn`, `zoomOut` (`room-canvas.tsx:76`,
  `canvas-navigation.tsx:80`). The "fly to the next topic" animation has **zero prior art** here.
  React Flow supports it (`setCenter(x, y, { zoom, duration })`), but it would be a from-scratch
  integration.
- **A hard pan cage.** `translateExtent={[[-2000,-2000],[2000,2000]]}` (`:265-268`) is 4000×4000.
  My 40-card seed already spans ~3500×2600. This would have to be widened or removed on day one.
- **No touch code at all.** No `touch-action`, no `PointerEvent`, no `zoomOnPinch`, no media
  query near the canvas. `useIsMobile` exists and is never used by the canvas. Mobile handling
  stops at the chrome (`canvas-navigation.tsx:147, 185-311`).

**The one genuinely shared piece is also the one to be most careful with.**
`hooks/useNodeDragBuffer.ts` does the right thing for writes — settle-only
(`:76`, `!change.dragging`) with a 100 ms lodash debounce (`:57-63`) into
`api.canvas.updateNodePosition`. Good. But:

- `:50-52` runs `setNodes(layoutNodes)` **unconditionally** whenever the derived array changes,
  and that array rebuilds on every `canvasNodes` subscription tick
  (`useCanvasNodes.ts:117-174`). With eight people dragging, every remote settle wholesale
  replaces the local buffer *including the node the local user is mid-drag on*. Today this is
  invisible because the ~26 nodes are mostly locked furniture. Forty free cards and eight
  draggers is exactly the load that unmasks it.
- The same seam carries the [#212](https://github.com/spokvulcan/poker-planning/issues/212)
  infinite-loop hazard: any prop into `useCanvasNodes` that is not referentially stable →
  new `nodes` array → that effect → `setNodes` → re-render → loop. It is defended by convention
  plus a regression test (`useCanvasNodes.test.tsx:107-137`) and an explicit reviewer warning at
  `useCanvasNodes.ts:51-57` that the lint cannot catch the mistake. It fires at **mount**, as a
  hard crash, not as slow degradation.

**So, concretely:**

- **Use React Flow.** It is already at `12.11.2` (`package.json:27`), it gives you pan/zoom,
  drag, marquee selection, `setCenter`/`fitBounds` for the walk flight, `onlyRenderVisibleElements`
  for the 200-card case, and `parentId` + `extent: 'parent'` for explicit clusters — all of which
  I hand-rolled worse. There is no case for a second engine.
- **But budget it as a new integration, not a reuse.** Almost none of the surface a retro board
  needs is exercised by the room today, so the team's familiarity is thinner than the ticket
  implies. Write a fresh drag/persistence seam rather than inheriting `useNodeDragBuffer`, and
  treat `translateExtent`, `panOnDrag`, and touch as unsolved.
- **The visual-continuity claim is real and cheap.** Same `Background` dots, same drag feel, same
  library. That part costs nothing and is worth something.

---

## Where the prototype is faithful to the settled constraints, and where it cheats

Faithful:

- Six stages, `Collect → Review → Group → Vote → Discuss → Close`, walkable both ways, jumpable
  to any stage.
- **Nothing forbids.** Writing (`Enter` / `＋ Card`), editing, grouping and voting work in every
  stage. During `vote`, a click casts a dot and a *drag* still moves the card. `Discuss` with no
  topics renders an empty state with an explanation, not a locked door.
- Nothing auto-advances; the timebox counts past zero into `+MM:SS` and does nothing.
- Two-tier navigation with the yank fixed: `Someone else advances` shows the follow bar rather
  than moving you, and **never** moves you at all while you are typing.
- Readiness is named per person, clears on advance, and is **absent during `collect`** with the
  reason stated.
- Card visibility is a viewer-flippable control in two places, labelled as still open
  (#262 / #270), not a baked-in assumption.
- Walk order snapshotted on entry; coverage tracked separately from position.

Cheating, or at least worth knowing:

- `prompt()` for cluster names. Fine for a prototype, obviously not a design.
- The seed runs a deterministic relax pass at boot so the three intended clumps read. Without it
  the demo's grouping depends on sentence length. I consider this honest — it is the problem
  moved to load time — but it is a thumb on the scale for how good proximity looks on first open.
- Simulated peers move cards toward word-overlapping neighbours, so the churn looks like grouping
  work rather than noise. Real churn would look worse, not better.
- The realtime numbers are *modelled* from `convex-realtime-board.md` §5.1 against real payload
  sizes. No Convex was harmed.
- I could not sample live FPS (background tab, `rAF` suspended). Per-frame work is measured
  instead.
- The `200 cards` toggle adds filler text. The 40 seeded cards are real-sounding; the extra 160
  are not.

---

## The single biggest problem with this direction

**The board never has a legible whole.** Fit-to-board on 40 cards is 27% zoom, where no card is
readable; readable zoom shows four to six cards out of forty. Everything else follows from that:
the discussion walk has to teleport because you cannot see where you are going, mobile is this
problem at 390px, the minimap and a future Ctrl+F exist to paper over it, and "did we cover
everything" becomes a readout in a side panel rather than something you can see on the board.

A retro is a forty-minute meeting for twelve people who need shared attention. A surface where
no two people are reliably looking at the same thing, and where nobody can see the shape of what
they collectively wrote, is working against the ceremony. That is not a polish problem and no
amount of interaction design inside direction C removes it.

---

## If C wins anyway

The cheapest things that would materially help, in order:

1. **A structured overview that is not the canvas** — a list/outline view of clusters and loose
   cards, reachable in one keystroke, that is the *same data* and where the walk, coverage and
   voting all also work. This is admitting the canvas needs a non-spatial twin, which is most of
   the argument for a different direction, so decide it consciously.
2. **Level of detail on cards.** Below ~50% zoom, drop the meta row and show a clamped headline
   at a larger relative size. Miro and FigJam both do this; the prototype does not, which is why
   its zoomed-out state looks as bad as it does.
3. **Make named clusters visually dominant over proximity hulls**, and consider hiding proximity
   hulls entirely outside the `group` stage — the prototype has the toggle; leaving them on
   during `discuss` is noise.
4. **Do not inherit `useNodeDragBuffer`'s copy-in.** Guard the locally-dragged node against
   remote replacement, and add optimistic updates before anyone tests with eight people.
5. **Widen or remove `translateExtent`**, and rebind `panOnDrag` for trackpads.
