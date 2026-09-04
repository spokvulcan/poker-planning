# The walk covers what was voted for, and a person raises the rest

**Status:** accepted — decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) via [#277](https://github.com/spokvulcan/poker-planning/issues/277). Amends [ADR-0010](0010-a-retro-stage-projects-and-defaults-but-never-forbids.md). Specified, not yet built.

[ADR-0010](0010-a-retro-stage-projects-and-defaults-but-never-forbids.md) made the **discussion walk** an ordered cursor over topics, snapshotted on entering `discuss` so later votes never reshuffle it, tracking coverage rather than position on Lu et al.'s finding that information coverage predicts decision quality at r = .56 against discussion focus at r = .25. It also said that a late card during `discuss` "is a feature, not an edge case" and "frequently the best card in the retro". All three board prototypes ([#258](https://github.com/spokvulcan/poker-planning/issues/258), [#259](https://github.com/spokvulcan/poker-planning/issues/259), [#260](https://github.com/spokvulcan/poker-planning/issues/260)) then showed the two places where that decision, built out, defeats itself.

First, **coverage with no scope reads as failure.** Prototype A's walk opened at "2 / 38 topics discussed · 36 not yet discussed" because 28 topics had no votes; accurate and useless, since nobody will discuss 38 topics. Lu et al.'s correlation is coverage of *relevant* information, not of everything anyone wrote. Second, **the late card is accepted and then buried.** Prototype B found a card written during `vote` is guaranteed to lose because every budget is spent, and one written during `discuss` lands behind every unreached topic; prototype C found that on a canvas it is also somewhere nobody may ever pan to, and had to add a "written after the snapshot" panel to make it findable. The soft machine accepts the best card in the retro and puts it fifteenth.

Nothing here reopens the stage machine. A stage still never forbids, and votes still never reshuffle. What was missing is the complement: **the walk's order holds the topics the team voted for, and a person, not a sort, puts anything else into it.**

## Considered Options

- **Every topic in the walk** (rejected). The prototype A failure. It also makes `group` effectively mandatory, since skipping it produces a forty-entry walk.
- **Named clusters plus voted loose cards** (prototype C's rule; rejected). A named cluster nobody voted for is exactly the kind of topic a scope should leave out.
- **Re-sorting the walk when votes or cards arrive** (rejected). ADR-0010's write-time-snapshot rule; a walk that reshuffles under a team mid-discussion is the anchoring machine in another form.
- **Ranking or exempting late cards on votes** (rejected). A second ranking to explain, for a card whose route in is a human saying "this one, next".
- **A "please raise this" request from participants** (rejected). A queue for a ten-second social act; the board already shows the card to everyone with a marker.
- **Re-snapshotting on re-entry to `discuss`** (rejected). Rewinding to rename a cluster would throw away twenty minutes of coverage; advancing destroys nothing.
- **Interrupt-now or append-to-end as raise variants** (rejected). A jump is already free, so inserting next covers both without a menu.

## Consequences

### The snapshot has a scope

- **When a `vote` entry ran**, the order on entering `discuss` is the topics with at least one dot in that entry, votes descending. **When none ran**, it is every topic in creation order, which is the truth about the choice the team made.
- The walk gains **`snapshotAt: v.number()`** beside `stageEntryId`, `order`, `cursor` and `covered` ([ADR-0016](0016-a-retro-is-one-room-with-its-ceremony-state-beside-it.md)).
- **Keyed by entry, kept on re-entry.** Rewinding out of `discuss` and advancing back into the same entry keeps its order and coverage; a second `discuss` entry in the stage list gets its own fresh snapshot. Nothing auto-extends a walk.

### Raise

- **`raise({ topicRef })`** is a `stageFlow` act ([ADR-0013](0013-retro-permissions-extend-the-one-decision.md)) available while the shared stage is a `discuss` entry with a walk. It inserts the topic into `order` immediately after `cursor`, so it is next and the current topic is not interrupted. Idempotent when the topic is already in the order. Available on any topic outside the walk, late or merely un-voted, from the card's context menu on the board and from the walk panel.
- **Raise is the only writer of the order after the snapshot.** Votes never reshuffle it; grouping never rewrites it. A cluster formed mid-walk from in-walk cards is a new topic outside the walk, raisable, while its members' entries stay where they are. A cluster dissolved mid-walk leaves a dangling entry that the read projection skips and coverage ignores.
- A late card's dots, if any, show on the card as information and never rank it. There is no exemption from the budget and no second ranking.

### What the board shows

- A card is **late** when it was written after `snapshotAt` and its topic — itself if loose, its cluster if grouped — is outside the walk. It carries a **"new" marker at every zoom level**, a dot at shape level ([ADR-0011](0011-the-retro-board-is-one-canvas-with-semantic-zoom.md)), until its topic enters the walk. Dragging a late card into an in-walk cluster clears the marker, because the walk will reach it through the cluster.
- The walk panel lists, below the order, **outside the walk**: "2 written since the order was set" first, then "18 topics without votes" collapsed, each row with Go (pan to it) and Raise.
- **Coverage counts the walk only**, with the late count as a separate number: "3 of 10 covered · 2 new". At shape level coverage is still which in-walk cluster labels are un-ticked; topics outside the walk are not ticked and not counted.
- Export ([ADR-0019](0019-retention-follows-the-team-and-export-never-widens-access.md)) prints the walk as covered / not covered over the order, and lists topics outside the walk under their own heading.

### Tests that enforce this

- Entering `discuss` after a `vote` entry snapshots exactly the topics with dots, votes descending; with no `vote` entry it snapshots every topic in creation order; `snapshotAt` is set.
- A card written after `snapshotAt` is absent from `order`, is marked late in the board projection, and stops being marked once its topic is raised or it joins an in-walk cluster.
- `raise` inserts at `cursor + 1`, is a no-op for a topic already in the order, is refused outside a `discuss` entry with a `ConvexError` of code `stage`, and is refused to a non-`stageFlow` holder with `forbidden` ([ADR-0022](0022-the-canvass-only-local-state-is-the-hand.md)).
- Dots cast during `discuss` on a topic outside the walk change nothing in `order`.
- Rewinding to `group` and advancing back to the same `discuss` entry leaves `order`, `cursor` and `covered` untouched; a second `discuss` entry starts a fresh walk.
- Dissolving a cluster in the order leaves a dangling ref that the projection omits and the coverage count excludes.
- The coverage readout's denominator equals the number of live entries in `order`, never the number of topics on the board.
