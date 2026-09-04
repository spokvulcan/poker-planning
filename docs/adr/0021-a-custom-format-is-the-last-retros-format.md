# A custom format is the last retro's format

**Status:** accepted — decided on [map #253](https://github.com/spokvulcan/poker-planning/issues/253) via [#275](https://github.com/spokvulcan/poker-planning/issues/275). Specified, not yet built. Amends [ADR-0013](0013-retro-permissions-extend-the-one-decision.md): stage-list structure edits are `retroSettings`, not `stageFlow`.

[ADR-0010](0010-a-retro-stage-projects-and-defaults-but-never-forbids.md) made the format the seed of a retro's stamped stage list, and [ADR-0016](0016-a-retro-is-one-room-with-its-ceremony-state-beside-it.md) fixed its shape — a name, up to ten prompts with label, hint, tint and order, and a stage seed carrying reveal, tally, budget and timebox per entry — and made it a copy on the retro, never a reference. What was left open was what a format is made of beyond that shape, which ship, how far a team may change one, and where a changed one lives.

The evidence is unusually clear about how little it can say. `docs/research/retrospective-effectiveness.md` §6 item 3: **no study compares retro formats against each other on any outcome**; Mad/Sad/Glad, Start/Stop/Continue, Sailboat and 4Ls are untested against each other. §4.5: "rotate the format or the team disengages" traces to practitioner books, and Matthies & Dobrigkeit found that 3 of 18 activity introductions created a headache that had not existed. The one place the literature is specific is §1.7 and §5.4: the classic "what went badly" opening invites the complaining cycle, which Kauffeld & Lehmann-Willenbrock found does more damage than functional interaction does good, and structuring prompts are the counter-measure. So the library is a familiarity and product call, the spec says so, and the prompts are where the one real constraint is either honoured or baked in.

The teardown (`docs/research/retro-tool-teardown.md`) supplies the other half. Retrium's fourteen techniques are one engine with different column headers plus two engines it cannot generalise; custom templates are the first thing every incumbent paywalls or breaks (Parabol cut free custom templates to two, Spreo ships none on Free, Miro's custom templates drop note content); and the baseline most teams actually use is Confluence's went well / needs improvement page.

So: **a format is a prompt set plus a stage seed, six ship, all of them run on the one canvas, the create form lets a team edit the copy before it is stamped, and the edited copy is the custom format — living on the retro, carried forward because the picker pre-selects the team's newest retro's format.** There is no formats table, no template store and no rotation nudge.

## Considered Options

- **A `formats` table for team or user custom formats** (rejected). Copy-whole plus reuse-last already gives carry-forward; a table adds an entity, a sync problem and the exact feature the category paywalls, for nothing the team cannot already do.
- **Pick-only at creation, no edits** (rejected). Then "custom" needs a store. Editing the copy on the create form is the whole feature.
- **Formats needing their own engine** (rejected): radar, fishbone, timeline. Every shipped format is prompts with soft zones on the canvas of [ADR-0011](0011-the-retro-board-is-one-canvas-with-semantic-zoom.md).
- **"What went well / What didn't"** (rejected as a shipped format). The second prompt is the complaining-cycle opening. Its familiar shape ships as **Went well, Do differently, Ideas** with the negative phrased as a change.
- **A rotation suggestion** (rejected). Not an evidenced claim, and novelty has a measured cost.
- **A stable `key` on the copied format** (rejected). Name is enough for the picker and for analytics, and an edited format is honestly not the shipped one.
- **Timeboxes in shipped seeds** (rejected). Advisory anyway, and the sixty-minute figure is folklore (§4.2).

## Consequences

### The library

Six formats, code constants in the model layer, one named as the default. Every one carries a one-line picker description that is not copied onto the retro. Hints appear in the write flow only, never on the board. Prompts are ordered positive-first everywhere, and every negative prompt asks for the change in the same breath.

1. **Went well, Do differently, Ideas** — default. Picker: "The familiar three. A good first retro."
   - *What went well?* — "Something worth keeping. Name what made it work."
   - *What should we do differently?* — "A change you would make, not a complaint. What would you try instead?"
   - *Ideas* — "Anything you would like the team to try, even half-formed."
2. **Start, Stop, Continue** — name kept, prompts reordered positive-first. Picker: "Every card asks for a change."
   - *Continue* — "Something that works and should stay."
   - *Start* — "Something we do not do yet that would help."
   - *Stop* — "Something we do that costs more than it gives."
3. **Glad, Sad, Mad**. Picker: "How the sprint felt, glad first."
   - *Glad* — "What made you glad this sprint?"
   - *Sad* — "What disappointed you, and what would have helped?"
   - *Mad* — "What frustrated you? Say what you would change."
4. **4Ls**. Picker: "Liked, learned, lacked, longed for."
   - *Liked* — "What did you enjoy?"
   - *Learned* — "Something you know now that you did not before."
   - *Lacked* — "What was missing, and what would it have changed?"
   - *Longed for* — "What do you wish we had?"
5. **Sailboat**. Picker: "The team as a boat: what pushes, what drags, what is ahead."
   - *Wind* — "What is pushing us forward?"
   - *Island* — "Where are we trying to get to?"
   - *Anchors* — "What is holding us back, and how would we lift it?"
   - *Rocks* — "A risk ahead we should steer around."
6. **Lean Coffee** — `collect` visible. Picker: "No prompts, just topics. Vote, then talk."
   - *Topics* — "Something you want the team to talk about. One topic per card."

The spec states plainly that this list is a familiarity choice, not an evidenced one.

### The seed

- **One standard seed** for every format: `collect (hidden) → review → group → vote → discuss → close`, `voteBudget` 5, `maxPerTopic` unlimited, no timeboxes. A format may override entries; Lean Coffee sets `collect` to `visible` ([ADR-0015](0015-a-hidden-retro-card-is-a-silhouette-projected-by-the-shared-stage.md)).
- **A teamless retro drops `review` at creation**, a creation rule rather than a format rule, because `review` is a query over the team's open actions ([ADR-0017](0017-an-action-item-has-one-home-and-carries-over-by-staying-open.md)) and would be empty. Adoption into a team never rewrites a stage list; a `retroSettings` holder may add a `review` entry afterwards.
- Tints come from a fixed palette of eight design-token colours; a custom prompt picks from the same palette.

### Creation and the picker

- `/retro/new` ([ADR-0014](0014-retro-is-the-second-ceremony-of-one-toolkit.md)) opens with a format pre-selected and the picker collapsed to one line, expandable to the library with the team's last-used format first. Pre-selection is the team's newest retro's format, else the shipped default. A first retro never opens with a decision.
- **The create form shows the selected format's prompts and stage list, both editable before stamping**: rename or add prompts up to ten, pick a tint, add, remove or reorder stage entries except `collect` and `discuss`, flip `collect` between `hidden` and `visible`. The edited copy is what is stamped. The creator may rename an edited format; otherwise it keeps its base name, which is user-facing text that outlives the retro in the export ([ADR-0019](0019-retention-follows-the-team-and-export-never-widens-access.md)) and the nudge ([ADR-0020](0020-a-nudge-is-sent-by-a-person-and-a-reminder-by-a-date.md)).
- **No rotation suggestion** of any kind.

### Editing a running retro

Under `retroSettings` ([ADR-0013](0013-retro-permissions-extend-the-one-decision.md)): prompt labels and hints are editable at any stage; a prompt may be added at any stage and removed only while no card answers it; stage entries may be added, removed or reordered except `collect`, `discuss` and the current entry. Past entries are never rewritten. A stage never forbids, and the two locks are the ones that would orphan cards or move the ground under the shared pointer.

### Tests that enforce this

- Creating a retro from each shipped format stamps exactly its prompts and seed; a team retro carries `review`, a teamless one does not; Lean Coffee's `collect` entry is `visible`, every other format's is `hidden`.
- Editing prompts or stages on the create form stamps the edited copy and leaves the shipped constant untouched; an eleventh prompt is refused; removing `collect` or `discuss` is refused.
- The picker pre-selects the team's newest retro's format, edited or not, and the shipped default when the team has none.
- Adopting a teamless retro into a team leaves its stage list unchanged.
- On a running retro, removing a prompt with cards is refused, removing the current stage entry is refused, and renaming a prompt changes no card's `promptId`.
- No shipped prompt label or hint contains "badly", "wrong" or "didn't", the guard against re-introducing the complaining-cycle opening by a later edit.
