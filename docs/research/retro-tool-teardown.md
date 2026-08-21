# How incumbent retro tools are built — a teardown

> Research for [#255](https://github.com/spokvulcan/poker-planning/issues/255), feeding the
> Team Retrospective map ([#253](https://github.com/spokvulcan/poker-planning/issues/253)).
> Verified 2026-08-19. Every load-bearing claim below cites the source it came from.
> Claims that could not be confirmed at a primary source are marked **unverified**.

## Scope and method

Tools torn down: **Parabol**, **EasyRetro**, **TeamRetro**, **Metro Retro (now Spreo)**,
**Retrium**, **FigJam**, **Miro**. Second-tier entrants scanned for contrast.

Sources were weighted: vendor help centres and pricing pages over marketing pages; Parabol's
own source code over anything written about it; G2/Capterra "what do you dislike" and vendor
changelogs over comparison blogs. Third-party comparison sites in this category are hostile
marketing and were treated as unreliable — Capterra's Retrium listing still advertises a
"$5.00 flat rate per month" basic plan and a free version that
[retrium.com/pricing](https://www.retrium.com/pricing) contradicts.

Reddit was not reachable by the tooling used, so the practitioner-sentiment sampling leans on
Hacker News, vendor community forums (forum.figma.com, community.miro.com), G2, Capterra and
GitHub issues instead.

---

## The market collapses to three archetypes

Everything in this category is one of three things, and the interesting fact is that **nothing
sits between the first and the third**.

1. **Guided phase machine** — Retrium, TeamRetro, Parabol. A named, ordered sequence of phases;
   the facilitator drives; the UI genuinely permits different things in each phase. Buys
   structure, pays in rigidity, lockstep and dead air.
2. **Board with toggles** — EasyRetro. Columns plus ~25 independent switches. "Phases" are the
   facilitator remembering to flip `Hide cards` at the right moment. Cheap and fast; no
   guidance, no continuity, and the toggles read as bugs to participants.
3. **Generic canvas** — Spreo (ex-Metro Retro), FigJam, Miro. Infinite canvas, sticky notes,
   a timer and a voting session bolted on. Zero retro semantics: no object represents "a retro",
   no phase exists, and every safeguard is a human asking people not to scroll over there.

Structured tools are rigid. Canvases are formless. The gap between them is the thesis.

---

## Comparison table

| | **Parabol** | **EasyRetro** | **TeamRetro** | **Spreo** (ex-Metro Retro) | **Retrium** | **FigJam** | **Miro** |
|---|---|---|---|---|---|---|---|
| **Board model** | Columns per reflect-prompt | Columns (horizontal) or lines (vertical) only | Columns / topics with icons + colours | Infinite canvas, frames + zones | One-thing-at-a-time guided screens | Infinite canvas | Infinite canvas |
| **Phase model** | 7 default phases: `checkin → TEAM_HEALTH → updates → reflect → group → vote → discuss`; only the first three are optional | **None.** ~25 toggles simulate phases | 9 steps: Icebreaker → Welcome → Open Actions → Brainstorm → Group → Vote → Discuss+Actions → Review → Close; reorderable pre-meeting | **None.** Design / Meeting Mode + 8 toggles; Activity Frames hide later sections | **Three** machines: columnar THINK → GROUP → VOTE → DISCUSS → WRAP UP; radar DEFINE → COLLECT → ANALYZE; root-cause DEFINE → THINK → GROUP → ELABORATE → DISCUSS → WRAP UP | **None** | **None** |
| **Who advances** | Facilitator — enforced in the graphql-shield layer (`isMeetingFacilitator`), not the resolver | Nobody — board owner flips toggles | Facilitator; gating is real ("participants cannot vote or group ideas until moved to the next step") | Any licensed member becomes Host; no enforcement | Facilitator only, orange arrow + confirm dialog | n/a | n/a |
| **Participant navigation** | **Soft lockstep** — backward freely, never forward; facilitator one ahead except GROUP/DISCUSS. Advancing drags everyone along | n/a | Forward-linear (backward mid-meeting **unverified**) | Free | **Locked.** "your screen will follow along". Only opt-out anywhere is Abstain, during Vote | n/a | n/a |
| **Readiness signal** | Ready toggle + `readyCount/(activeCount-1)` ring; double-confirm to advance reflect/group/vote early | None | **`I'M FINISHED`** + check mark per avatar + typing indicators; progress bars in health checks | None | None documented | None | Vote session shows per-participant completion |
| **Hidden until reveal** | Yes during `reflect` — but **client-side only**, no server gate on reflection content | `Hide cards` toggle — cards render **blurred**, not absent | Named setting: `SHOW IDEAS IMMEDIATELY` vs `SHOW IDEAS IN NEXT STEP` | Private Writing **on by default**; reveal is **per-author, self-serve** | Blurred **globally** until the facilitator reveals for everyone | **No such feature at all** | Private mode (Starter+) — hides sticky **text** only |
| **Anonymity** | One per-meeting boolean `disableAnonymity`, **anonymous by default**, snapshotted at start so unchangeable mid-meeting; 5 documented leaks | Only works on **public** boards (i.e. the ones with no history); `Show card's author` flippable any time | **3 levels** — Names / Aliases / Anonymous — one-way ratchet, Anonymous is irreversible | **Off by default on principle**; distinct handwriting per person. `Hide Identities` is irreversible for content made while on | **Always anonymous, non-configurable.** Colours decoupled from author and column; anonymous in exports | **None.** `authorVisible` is a display flag; `authorName` still readable via the Plugin API | Private mode "Make names anonymous" is permanent and excluded from board history — but is a paid feature |
| **Grouping** | Drag-onto-group only — 2 drop-target types, no tap-select, no keyboard, no merge-two-stacks (open since 2020). Free non-LLM similarity suggestions + AI mode; one-click reset | `Merge into…` via a ⋯ menu, not drag | Drag-and-drop, `ONLY FACILITATOR` vs `EVERYONE CAN GROUP`; AI `SUGGEST GROUPS` / `SUGGEST ACROSS TOPICS`, accept ✔ / reject ✘ | **Spatial** — Topics auto-form on proximity, drag a topic and its stickies follow; AI grouping in beta (BYO keys) | Column-based, simultaneous; **conflict resolution is explicitly human** — the facilitator's job is to notice disagreement and call a discussion | Free drag; FigJam AI "Sort stickies" **copies** them into a new section | Free drag; Miro AI cluster by keyword or sentiment |
| **Voting** | Default 5 total / 3 per group, max 12; adjustable mid-meeting; blind until Vote→Discuss; you may vote on your own | `Max votes per user`, per board **or per column**; `One vote per card`; `Hide vote count` | `SET VOTE COUNT` (or ∞), `LIMIT PER IDEA`, per-topic cap, `MUST CAST ALL VOTES`, `REVEAL VOTES IN NEXT STEP` vs immediately | Rounds with a budget + allow-duplicates; votes **live and attributed**; unlimited rounds | **√(number of topics)** votes, **non-overridable**; private until Discuss; single round | Paid-only; votes hidden until session ends, then **who voted for what is reviewable** | Budget up to 99, optional one-vote-per-object, duration in minutes/hours/**days**, "all votes are anonymous", **no export** |
| **Action items** | Team-scoped task board written into from Discuss; `updates` phase made default 2026-08-05, **not migrated to existing teams** | Card ⋯ → `Convert to action item`; **no carryover** | First-class: priority, due date, owner; 3 permission modes incl. **propose→approve**; `Open Actions` step + `Review` step + `PARKING LOT` auto-transfer | Assignee + due date + **email nudges** (assigned / upcoming / overdue) | "Ambassador" + target date; complete / archive-with-reason | **Nothing native** — the Jira integration runs the other way | Jira Cards can create issues (Starter+, 3.5★) |
| **Carryover** | Phase exists but is a **per-person board walk** ("what are you working on?"), not a review of last retro's commitments | No | **Yes — two steps in the agenda** | Import actions into any board, **two-way synced** | Open actions sit on the Home tab you launch the next retro from | No | No |
| **Continuity model** | Team → Organization; `meetingSeriesId`; Insights | Board-per-retro; teams are paid-only; **1-year inactivity wipes the account** | Team-owned recurring meetings; dashboards; **health radar with trend lines vs previous checks** | Boards + team spaces | Team Room = "where your team goes to start a retrospective, view your retrospective history and review action items" | File-per-retro | Board-per-retro; duplicating a board **drops voting results** |
| **Integrations** | Jira, GitHub, GitLab, Azure DevOps + more | Jira (one-way), Trello, Slack, Confluence | **17**, incl. bidirectional Jira / Azure DevOps / GitHub / Linear; webhooks; MCP server (Jun 2026) | Jira | Jira (**Cloud only**, no custom required fields), Slack, SSO. **No MS Teams.** API is Enterprise-only + SCIM-only | None for FigJam | Jira/Azure Cards; Planner apps are Business+ |
| **Free tier** | 2 teams, 10 meetings/mo, unlimited users, **30-day history** | **2 public boards/month**, 0 teams | **None** — 30-day trial | **None** — 30-day trial, then read-only | **None** — 30-day trial | 3 FigJam files, 3 pages/file, 30-day version history, **no voting** | 3 editable boards, **no timer / voting / private mode** |
| **Paid entry price** | $8 / active user / mo | €22 / mo **flat, no per-seat fees** | US$250 / yr for 1 team, ≤25 members | ~$4 / user / mo annual | **$39 / Team Room / mo**, unlimited users | **$3 / mo Collab seat** | $8 / member / mo |
| **Billing unit** | Per user | **Per team (flat)** | Per team | Per user | **Per team room** | Per seat | Per member |
| **Licence** | **AGPL-3.0**, dual-licensed | proprietary | proprietary | proprietary | proprietary | proprietary | proprietary |

---

## Per-tool detail

### Parabol — the reference implementation, and it is open source

Parabol is [AGPL-3.0 with alternative licences "negotiated directly with Parabol the
organization"](https://raw.githubusercontent.com/ParabolInc/parabol/master/LICENSE), so the
source is the primary source. Everything in this section was read from `master` on 2026-08-19.

**Phases.** The enum is explicit
([`NewMeetingPhaseTypeEnum.graphql`](https://github.com/ParabolInc/parabol/blob/master/packages/server/graphql/public/typeDefs/NewMeetingPhaseTypeEnum.graphql)):
`lobby`, `checkin`, `updates`, `reflect`, `group`, `vote`, `discuss`, `SUMMARY`, plus a
tier-gated `TEAM_HEALTH`. Its own doc comments describe `discuss` as "groups are discussed
**one at a time**". Only `TEAM_HEALTH` is gated by tier
([`isPhaseAvailable.ts`](https://github.com/ParabolInc/parabol/blob/master/packages/server/utils/isPhaseAvailable.ts)).

**The default sequence changed three weeks ago.**
[PR #13350](https://github.com/ParabolInc/parabol/pull/13350), merged 2026-08-05:

```diff
- phaseTypes: ['checkin', 'TEAM_HEALTH', 'reflect', 'group', 'vote', 'discuss'],
+ phaseTypes: ['checkin', 'TEAM_HEALTH', 'updates', 'reflect', 'group', 'vote', 'discuss'],
  disableAnonymity: false,
```

Three facts fall out of one diff. The `updates` (Task Review) phase now runs **before**
`reflect` — review last retro's commitments first. Retros are **anonymous by default**. And the
category leader is shipping action-item carryover as a default phase in August 2026, with the
PR body noting "Only true for new teams; no migration for previous teams." The follow-through
gap is live, not settled.

**Anonymity is a read-time projection over attributed data.** In
[`RetroReflection.ts`](https://github.com/ParabolInc/parabol/blob/master/packages/server/graphql/public/types/RetroReflection.ts):

```ts
creatorId: async ({creatorId, meetingId}, _args, {authToken, dataLoader}) => {
  const meeting = await dataLoader.get('newMeetings').loadNonNull(meetingId)
  const {meetingType} = meeting
  if (!isSuperUser(authToken) && (meetingType !== 'retrospective' || !meeting.disableAnonymity)) {
    return null
  }
  return creatorId
}
```

Authorship is stored on the row; anonymity is enforced at the GraphQL boundary by a single
per-meeting boolean. Parabol super-users can still read `creatorId`; the `creator` resolver
deliberately blocks even them, with the comment "let's not allow super users to grap this in
case the UI does not check `disableAnonymity`". `isViewerCreator` always resolves — you always
see your own. It is **one meeting-level flag**: no per-card, per-column or per-phase anonymity.
The value is a *team* setting snapshotted into the meeting at start, so it cannot even be
changed mid-meeting; per-meeting anonymity for a recurring series is an open ask filed
2026-08-18 ([#13381](https://github.com/ParabolInc/parabol/issues/13381)). Comments are the one
exception — `addComment` takes a per-message `isAnonymous`.

**And it has leaked, repeatedly** — five defects, mostly found by Parabol themselves:
[#10205](https://github.com/ParabolInc/parabol/issues/10205) anonymous comments de-anonymised
after submission, a p1 found live *during an Enterprise demo call*;
[#10953](https://github.com/ParabolInc/parabol/issues/10953) typing indicators reveal who is
writing an anonymous comment, "replicated during a Parabol growth retro";
[#9196](https://github.com/ParabolInc/parabol/issues/9196) anonymous reactions are not anonymous;
[#9197](https://github.com/ParabolInc/parabol/issues/9197) @-mentions leak anonymous comments
into notifications; and the inverse,
[#7974](https://github.com/ParabolInc/parabol/issues/7974) — a *non*-anonymous retro loses
authorship on export, still true at `ExportToCSV.tsx:225`, which hardcodes
`author: 'Anonymous'` for every row regardless of the flag. Anonymity implemented as one flag
consulted by many surfaces fails at whichever surface forgets to consult it.

**The phase machine is two-tier navigability** — the single most reusable design in this whole
teardown. From
[`unlockNextStages.ts`](https://github.com/ParabolInc/parabol/blob/master/packages/client/utils/unlockNextStages.ts):

```ts
const phasesWithExtraRequirements = [GROUP, DISCUSS]
unlockStagesForParticipants   -> unlockAllStagesForPhase(phases, stage.phaseType, false)     // isNavigable
unlockNextStageForFacilitator -> unlockAllStagesForPhase(phases, nextStage.phaseType, true)  // isNavigableByFacilitator
                                 // ...but returns [] for GROUP and DISCUSS
```

Every stage carries two independent unlock flags, and the client picks between them in one line
(`useGotoStageId.ts:60`): `const canNavigate = isViewerFacilitator ? isNavigableByFacilitator : isNavigable`.
A phase unlocks for participants **only once the facilitator has entered it**, while the
facilitator's *next* phase unlocks for the facilitator alone. Net effect — call it **soft
lockstep**: participants can wander freely **backward**, never **forward**; the facilitator can
run one phase ahead — except `GROUP` and `DISCUSS`, which have data preconditions (you need
reflections; you need votes) and stay locked until satisfied.

**Only three of the seven phases are optional.** `setMeetingSettings` exposes
`checkinEnabled`, `teamHealthEnabled`, `reviewPastTasksEnabled` and `disableAnonymity`
(`setMeetingSettings.ts:23-67`). **Reflect, Group, Vote and Discuss cannot be turned off.** A
team that wants "write it down and talk about it" still clicks through Group and Vote. `reflect`,
`group` and `vote` have exactly one stage each; `discuss` has one stage per reflection group.

**Where the facilitator guard actually lives.** `navigateMeeting.ts` itself contains no
`viewerId === facilitatorUserId` check — the guard sits in a separate graphql-shield layer,
`packages/server/graphql/public/permissions.ts:197` → `isMeetingFacilitator('args.meetingId')`.
Worth knowing if you read the resolver in isolation, and worth copying as a pattern: the
authorisation rule is declared once, next to the schema, rather than inlined per handler.
Two neighbouring mutations are *not* so guarded: `promoteNewMeetingFacilitator` and
`endRetrospective` are only `isTeamMemberOfMeeting` (`permissions.ts:141-144, 211-212`), so any
participant can seize facilitation or end the meeting.

**The drag-along, and the consent ritual.** When the facilitator advances, every client sitting
on the *old* facilitator stage is force-moved to the new one
(`NavigateMeetingMutation.ts:133-144`). The only protection is
`isInterruptingChickenPhase`, whose set is **just `agendaitems` and `discuss`** — `reflect` is
not in it, so a facilitator clicking Next while you are mid-sentence yanks your view to Group.
Against that, non-facilitators press a **Ready** toggle (`flagReadyToAdvance`), and the
facilitator's Next button renders a progress ring of `readyCount / (activeCount - 1)`. If not
everyone is ready, the phase is in `PHASE_REQUIRES_CONFIRM = ['reflect','group','vote']`, and it
is the last stage of the phase, the facilitator must click **twice**
(`BottomControlBarReady.tsx:31,100`). So readiness *is* surfaced — as a ring and a
double-confirm — which makes the recurring "facilitators cannot see when participants finish a
phase" complaint a legibility failure rather than a missing feature.

**Reflect-phase privacy is client-side only.** The hiding happens in
`PhaseItemColumn.tsx:144` — `columnStack.filter(({isViewerCreator}) => isViewerCreator)` — with
everyone else's cards drawn as grey chits reading "*N* team member reflections + *M* in
progress". But `RetroReflection.ts` overrides `creatorId`, `creator`, `editorIds` and
`reactjis` and defines **no `content` resolver**, and `permissions.ts` has **no shield rule for
`RetroReflection` at all** (contrast `RetroReflectionGroup.voterIds: isSuperUser`). Reflection
IDs are published to the whole meeting channel on create. Reading the code, a participant
querying `reflectionGroups { reflections { plaintextContent } }` during Reflect gets everyone's
in-progress cards. For a product whose value proposition is psychological safety, blind
brainstorming is a client-side convention, not a guarantee. *(Verified by reading the resolver
and the shield map; not confirmed by a live query.)*

**Voting.** `RETROSPECTIVE_TOTAL_VOTES_DEFAULT = 5`, `RETROSPECTIVE_MAX_VOTES_PER_GROUP_DEFAULT = 3`,
`RETROSPECTIVE_TOTAL_VOTES_MAX = 12`
([`constEnums.ts:268`](https://github.com/ParabolInc/parabol/blob/master/packages/client/types/constEnums.ts)).
Both are adjustable mid-meeting; lowering the total clamps the per-group max.

**Grouping is drag-onto-group, and only that.** The board is a kanban with one column per
reflect prompt, not a canvas. `endDraggingReflection.ts:36-50` accepts exactly two drop targets:
`REFLECTION_GRID` (ungroup) and `REFLECTION_GROUP` + `dropTargetId` (merge). **There is no
tap-to-select, no keyboard path, and no merge-two-stacks** — the last has been an open request
since [2020-03-03](https://github.com/ParabolInc/parabol/issues/3613). Drag is hand-rolled, not
a library: `useDraggableReflectionCard.tsx` is 471 lines wiring `mousedown`/`touchstart`
directly, with a 120 ms long-press threshold to tell drag from scroll. Every reflection is born
in its own group, so grouping is merging singletons. Any participant can group — there is no
facilitator shield on `endDraggingReflection`.

Auto-grouping has two modes behind `generateSuggestedGroups`: a **free, LLM-less `similarity`
mode** using cosine distance over embeddings written as cards are typed
(`SIMILARITY_THRESHOLD = 0.78`, `+0.03` same-column bonus, `-0.05` per card beyond three), and
an `ai` mode gated on `canAccessAI`. Similarity groups are computed automatically on entering
Group, and suggestions are **advisory** — they render as hover outlines you choose to apply.
Group titles auto-generate: with AI, an LLM title; without, literally the first three words
longer than three characters (`getSimpleGroupTitle.ts`). A manual rename sticks, tracked by
`titleIsUserDefined: title !== smartTitle`. Machine grouping is undoable in one click
(`resetReflectionGroups`). Two lessons transfer even to a non-AI build: **grouping must be
reversible**, and **a cheap non-LLM similarity pass is a real option**.

**Discuss** is one topic per stage, auto-sorted by vote count descending
(`makeGroupsToStages.ts`), with tasks, comments and polls creatable inline and a per-stage
facilitator-only timer whose suggested duration is derived from **the team's own prior
meetings**, outlier-filtered by IQR (`GenericMeetingStage.ts:8-24,60-70`). That is a genuinely
nice touch: the timer learns how long this team actually takes.

One nuance worth stealing: the discuss stages are created with **`isNavigable: true` *and*
`isNavigableByFacilitator: true`**, so once the meeting reaches Discuss everyone can move between
topics freely. **Lockstep binds only the phases before Discuss** — which is exactly right, since
those are the phases where seeing ahead would corrupt the data.

Retro voting also has **no reveal mutation** — unlike poker's `pokerRevealVotes`. Tallies simply
appear because the phase advanced. Blind voting is an emergent property of the phase machine
rather than a designed act, which is worth being deliberate about in our own model.

**Task carryover is weaker than it sounds.** The `updates` phase loads `team.tasks` filtered to
the current stage owner and walks the team **round-robin, one person at a time**, prompting
"what's changed with your tasks?" / "what are you working on?"
(`RetroMeetingUpdates.tsx`, `RetroMeetingUpdatesPrompt.tsx`). It is a per-person board walk, not
a "here is what we committed to last retro" view. Compare TeamRetro's `Open Actions` step, which
is exactly that view.

**No guest access.** `joinMeeting` is shielded by `isTeamMemberOfMeeting` — an account and team
membership are required, and the public "try it" demo is a single-player bot simulation
(`packages/client/modules/demo/ClientGraphQLServer.ts`). The request to allow anonymous
participants was filed in 2022 with a pointed rationale — "**Anonymous submissions is a standard
of trust we have built and I could not ask 10-200 people to go create an account**" — labelled
`icebox` and closed in 2023 without shipping
([#6528](https://github.com/ParabolInc/parabol/issues/6528)).

**Pricing.** Starter (free): 2 teams per company, 10 meetings/month, unlimited users, **30 days
meeting history**, 2 custom templates, 3 AI summaries. Team: $8/**active** user/month — "users
who haven't logged in for 30 days will automatically be marked inactive and will not count
toward your bill". Enterprise adds SAML/SCIM and on-prem options
([parabol.co/pricing](https://www.parabol.co/pricing/)). The caps are confirmed in code:
`MAX_STARTER_TIER_TEAMS = 2`, `MAX_QUAL_AI_MEETINGS = 3`, `STARTER_TIER_LOCK_AFTER_DAYS = 30`.

**The free tier has been shrinking for three years**, per archive snapshots: unlimited archive →
30 days (2023), unlimited custom templates → 2 (2023), $6 → $8 (2024), unlimited meetings → 10
per month (2025). In March 2026 they shipped `isCompanyOverLimit.ts`, a transitive-closure
dragnet over org membership plus email-domain matching to catch one company split across many
free orgs, then hard-blocked meetings. In May 2026 they called it, in public,
["an overly aggressive monetization tactic"](https://www.parabol.co/friday-ship/491-shaping-features-in-2026/)
and removed every call site. The file remains on master with zero callers.

**Self-hosting is legally clean and operationally hostile.** The licence is plain AGPLv3 with no
anti-SaaS clause and no licence key — `defaultTier.ts` is one line, `IS_ENTERPRISE === 'true'`,
and SAML and SCIM are fully in the OSS tree. But there is **no official public Docker image**,
and the production compose stack was **deleted** in February 2026
([#12620](https://github.com/ParabolInc/parabol/pull/12620)); the surviving development stack
says "Parabol does not provide any support on this stack" and "not meant for production", and
the sole self-hosting discussion has zero replies. Meanwhile they sell managed single-tenant
instances. The gap between "you may" and "you can" is deliberate.

**What they keep fixing** (`docs/changelog/CHANGELOG-v6.md` and recent releases): "Allow
non-facilitator to advance to reflect phase (#8693)" — loosening lockstep; "When skipping phases,
mark interim stages as complete (#8374)"; "unable to ungroup some reflection groups (#8623)"; an
entire **suggest-groups** programme against OpenAI including a reset-groups button and prompt
tuning; sentiment analysis; Zoom/Recall transcription bots in `discuss`.

**Complaints.** The sharpest is from a user interview with a Product Owner/Scrum Master
(2025-04-08), on the grouping and voting phases:

> "It's just like a drag while everyone sits there and watches me try to organize things."
> … "**It's really not a group effort to group things.**" … "The only thing I didn't like was the
> timer. Not everyone can see the timer." … "You can't add notes during grouping and voting."

([source](https://echometerapp.com/en/parabol-alternative-echometer-comparison-review-user/) — a
competitor-hosted interview, but a user's words, not marketing copy.) On Capterra, a Technology
Operations Manager gives it 4/5 with the con: "**As a host of a meeting, I can't see when my team
is ready for the next phase.**"

**Drag-and-drop is the most chronic complaint in the repo, unbroken from 2019 to 2026**:
[#3388](https://github.com/ParabolInc/parabol/issues/3388) "Cannot reliably drag Reflection card"
(2019); [#7014](https://github.com/ParabolInc/parabol/issues/7014) (2022) — "**it was pretty
impossible using the trackpad**", with the author asking for a non-drag path ("Could you perhaps
somehow select a group easier using dropdowns/tagging?");
[#6757](https://github.com/ParabolInc/parabol/issues/6757) iPad dragging, iceboxed;
[#7297](https://github.com/ParabolInc/parabol/issues/7297) card vanishes when dragged out of an
expanded group, p1, "since then it occurred **> 900 times**";
[#10272](https://github.com/ParabolInc/parabol/issues/10272) concurrent-grouping data loss — group
someone's card while they type and the group is missing in Vote;
[#8618](https://github.com/ParabolInc/parabol/issues/8618), from Parabol's own Growth team,
"**multiple people had to refresh the page** during our grouping phase";
[#12690](https://github.com/ParabolInc/parabol/issues/12690) still open.

**Mobile is a stated non-priority.** In 2019 Parabol's own designer wrote "**Today folks can't
drag and drop on mobile.** Even if they could, they are constrained to a single column"
([#3064](https://github.com/ParabolInc/parabol/issues/3064)). Mobile bugs are consistently
triaged `p3`/`p4`/`icebox` across six years — a policy, not a backlog accident. Below 704 px the
board degrades to one swipeable column at a time.

**Realtime reliability is a standing tax**: silent websocket desync affecting production meetings
("We had at least **7 users with the same issue in production**… There are probably more users
affected, **for whom the app did not crash but who do not get any live updates**",
[#11250](https://github.com/ParabolInc/parabol/issues/11250)); an embedder memory leak, a web
server OOM crashloop, and awareness collapse at 100+ open meetings all currently open. Perceived
speed degrades with board size — "the interface is getting really slow… when dragging cards from
one column to another. I'm wondering if it is because I have a lot of unarchived cards (635 in one
column)" ([#8609](https://github.com/ParabolInc/parabol/issues/8609)).

From [G2's pros-and-cons digest](https://www.g2.com/products/parabol/reviews?qs=pros-and-cons)
(search-snippet derived — G2 blocks direct fetching, so treat as weaker evidence):
"teammates start grouping or moving cards prematurely, which disrupts the individual reflection
process"; "facilitators cannot see when participants finish a phase"; "the cards written by the
same person are spread out, making it difficult to comment on what you write without navigating
through the whole board". The phase-guarding tension is documented in their own tracker —
[#2948 "Guard retro phases or allow free navigation"](https://github.com/ParabolInc/parabol/issues/2948):
"Mid grouping, I lost the ability to move the cards…I may have gone ahead a step and then it
locked", and the complaint that the workflow creates awkward delays where facilitators work alone
while participants wait passively. On anonymity,
[#2806](https://github.com/ParabolInc/parabol/issues/2806) reports that anonymity **decreased**
participation during discussion — the facilitator wanted to "call on each person to share and add
color". Closed, 2019, no PR.

### EasyRetro — a board with toggles

**No phase model.** Facilitation is ~25 independent switches —
`Hide cards`, `Disable voting`, `Hide vote count`, `Disable moving cards`, `Disable add/edit cards`,
`Presentation mode`, `Highlight mode`, `Show card's author`
([board settings](https://intercom.help/easyretro/en/articles/6476873-easyretro-s-board-settings-explained)).
Hidden cards render **blurred**, not absent
([why cards are blurred](https://intercom.help/easyretro/en/articles/9073091-why-are-some-cards-blurred)).
There is no participant "I'm done" signal anywhere in the docs.

**Anonymity is structurally leaky.** It is a property of *not being logged in*, not a board
setting: "contributing to EasyRetro's board as an anonymous user is only possible when using
Public boards"
([help](https://intercom.help/easyretro/en/articles/9269001-how-do-i-make-sure-my-contributions-to-easyretro-s-board-are-anonymous)).
The private, team-owned, history-preserving boards are precisely the ones that cannot be
anonymous — and `Show card's author` can be flipped at any time.

**Grouping is menu-driven, not drag:** enable `Merge cards`, then ⋯ → `Merge into…` → click the
target ([help](https://intercom.help/easyretro/en/articles/4993481-how-to-merge-and-unmerge-the-cards-on-your-board)).
Reviewers find it "very difficult". No AI grouping.

**Action items are retrofitted onto cards** — ⋯ → `Convert to action item`, reversible — with no
assignee/due-date documented and **no carryover**
([help](https://intercom.help/easyretro/en/articles/4993672-how-to-turn-your-cards-into-action-items)).
A Capterra reviewer notes action points "needs to be tracked outside the tool manually".

**Pricing is the one genuinely differentiated thing here.** Free: **2 public boards per month**,
unlimited participants, **0 teams**. Team €22/mo (annual) for 1 team; Business €50; Large Business
€79; Enterprise from €133. FAQ, verbatim: "One subscription covers your whole team — there are no
per-seat fees" ([easyretro.io/pricing](https://easyretro.io/pricing/)). Aggregators that list
"$20 per user/month" are wrong.

**Sharp edges.** No per-card undo — the official restore path is to delete the whole board and
recover it ([help](https://intercom.help/easyretro/en/articles/9289517-how-to-retrieve-restore-deleted-cards)).
The timer can be stopped by **any participant**, not just the facilitator
([help](https://intercom.help/easyretro/en/articles/5231180-how-to-set-a-timer-on-my-board)).
And "if you have been inactive for more than 1 year, we'll clear the data of your account, and you
won't be able to see your old boards again"
([help](https://intercom.help/easyretro/en/articles/4063256-how-long-is-a-board-accessible-for)).

Six help-centre articles exist purely to explain why something *appears* broken — "Why are some
cards blurred?", "Why I can't move my cards?", "Why I can't sort my cards by vote?"
([index](https://intercom.help/easyretro/en/collections/2359997-help-center)). That is the toggle
model's real cost: users cannot tell a setting from a bug.

### TeamRetro — the most complete guided flow

**Nine steps, reorderable before the meeting**: Icebreaker → Welcome → **Open Actions** →
Brainstorm → Group → Vote → Discuss and Add Actions → Review → Close
([overview](https://help.teamretro.com/article/181-overview),
[retrospectives](https://help.teamretro.com/article/152-retrospectives)). The `PROCESS` tab
enables, disables and reorders steps; "you cannot disable Brainstorm and the Close steps" and
"All steps can be reordered except for the **CLOSE** step"
([customising](https://help.teamretro.com/article/156-customising-your-retrospective)).
Gating is real: "participants cannot vote or group ideas until moved to the next step"
([async guide](https://help.teamretro.com/article/442-running-an-asynchronous-brainstorming-retrospective)).
Backward navigation mid-meeting is **unverified** — no help article documents it.

**Readiness is first-class**: participants click **`I'M FINISHED`**, a check mark appears beside
their avatar, and typing indicators show who is actively contributing
([brainstorm step](https://help.teamretro.com/article/157-retrospective-brainstorm-step)).
Health-check surveys give facilitators per-member progress bars.

**Anonymity is the best-designed model found anywhere.** Three named levels on the `GENERAL` tab —
`NAMES`, `ALIASES` (pseudonyms), `ANONYMOUS` — with a **one-way ratchet**: "this setting can only
move upward—towards more anonymity… Setting a retrospective to Anonymous is irreversible."
Under `ANONYMOUS` it hides who is present, who added an idea, who voted for each idea, and comments
on ideas. It deliberately does **not** anonymise action assignments, comments on actions, team
membership, or chat ([anonymity](https://help.teamretro.com/article/149-anonymity)). Participants
can also toggle their own avatar per idea, mixing attributed and anonymous cards in one meeting.
That "anonymous input, attributed accountability" split is the sharpest single idea in the category.

**Voting is the most configurable**: `SET VOTE COUNT` (or infinity), `LIMIT PER IDEA`, a per-topic
cap, `MUST CAST ALL VOTES` blocking progression, and `REVEAL VOTES IN NEXT STEP` (default) vs
immediately ([vote step](https://help.teamretro.com/article/162-retrospective-vote-step)).

**Action items are objects with a lifecycle and, crucially, a place in the agenda.** Three
permission modes — facilitators only, everyone commits, or **everyone proposes and the facilitator
approves**. Each carries priority, due date and owner. The `Open Actions` step opens the retro by
reviewing prior commitments; the `Review` step covers "both current and previous action items";
and a `PARKING LOT` "automatically transfer[s] to the next meeting and team dashboard"
([discuss step](https://help.teamretro.com/article/163-retrospective-discuss-step),
[actions](https://help.teamretro.com/article/166-actions)). 17 integrations, several bidirectional,
plus webhooks and an MCP server ([integrations](https://www.teamretro.com/integrations/)).

**Continuity is real**: team-owned recurring meetings, dashboards, and a **Team Health Check**
second product whose radar reports Individual / Median / Mode / Mean / Standard Deviation /
Distribution / Range with **trend lines comparing the current result to previous health checks**
([radar statistics](https://help.teamretro.com/article/342-health-radar-statistics)).

**Pricing:** no free tier, 30-day trial. Single Team US$250/yr (≤25 members); Small Organization
US$600/yr (3 teams); Large Organization from US$900/yr (6+)
([pricing](https://www.teamretro.com/pricing)).

**Complaints.** The guided flow is too prescriptive for anything non-standard, in the sharpest
review in this whole teardown: "right now TeamRetro works best with retros that have a structured
flow… it makes it difficult for more abstract retrospectives that a coach or Scrum Master might
want to introduce to provide variance. **I find myself using other tools like Trello when I want to
do something like that**"
([G2](https://www.g2.com/products/teamretro/reviews?qs=pros-and-cons)); echoed on Capterra as
"TeamRetro does prescribe a particular activity set". Reviewers ask for a canvas — "a
whiteboard-like canvas where cards or columns can be custom arranged (e.g., in quadrants)". And
grouping is *still* the weak point as of February 2026: "slow and buggy while grouping" (3.0★,
[Capterra](https://www.capterra.com/p/193264/TeamRetro/reviews/)) — despite a changelog full of
grouping-smoothness and realtime-performance rescues, including a migration to Ably. Health Check
and Retrospective don't compose: "I have to provide **two separate links** to my team when I
facilitate a retro".

### Spreo (formerly Metro Retro) — the canvas that gave up on retros

**Identity first, because it matters:** Metro Retro no longer exists under that name.
`https://metroretro.io/` returns **301 Moved Permanently → https://spreo.io/**. It was renamed
twice — **Metro Retro → Ludi** (4 Aug 2025, strategic,
["Expanding Beyond Retrospectives"](https://spreo.io/blog/metro-retro-is-now-ludi)) → **Ludi →
Spreo** (1 Jul 2026, forced: "for trademark reasons we can no longer use the name, Ludi",
[announcement](https://spreo.io/blog/our-new-name-spreo)). Operator: Deqo Software Limited.
Cite `spreo.io` and `docs.spreo.io` only — the rebrand is patchy (status.spreo.io still says
"Ludi", the live FAQ still documents a free plan removed in Sept 2024) and
`webflow.metroretro.io` is stale legacy infrastructure.

The repositioning is the finding: **the most retro-native canvas in the market deliberately
stopped being a retro tool**, and now also sells planning poker, sprint planning, story mapping
and standups — direct overlap with AgileKit's own expansion path.

**No phases.** Two modes (Design / Meeting Mode); any licensed member can start a session and
becomes Host. Eight independent toggles, not a sequence. The closest thing to guidance is
Activity Frames, which hide later sections, plus a sheep icon that "herds" everyone to a frame.
Zero facilitation enforcement.

**Reveal is per-author and self-serve** — the opposite of Retrium. Private Writing is **on by
default**; each author reveals their own stickies, all at once or one at a time. The Host can
disable it globally or right-click → Force Reveal.

**Anonymity is off by default, on principle** — "we don't believe anonymity should be default".
Every sticky is attributed, and each person gets distinct handwriting. `Hide Identities` is a
session toggle, irreversible for content created while it is on, and it disables Spotlight and
Follow and strips authorship from exports.

**Grouping is spatial**: Topics auto-form on proximity, and dragging a topic carries its stickies.
AI Topic Grouping and Sub-sort are in beta (bring your own keys). **Voting is live and
attributed** — configurable rounds with a votes-per-person budget and an allow-duplicates flag,
unlimited rounds, a new round freezing the prior results, and anyone may start one. There is no
discuss phase; you get Timer, Ping, Vanishing Pen, Follow, Spotlight and frame-herding.

**Actions have the best data model in the set and nothing to hang it on.** Created from a sticky
via `@` or "Assign Action", with an assignee, a due date and email nudges (assigned / upcoming /
overdue). Carryover works by importing actions into any board, **two-way synced**. Exports are
PDF/CSV/HTML/Markdown/JSON with selectable columns including *Votes By Participant*. But
integrations are **Jira only, Business tier and up** — no Slack, no Teams, no API — and there is
**no retro history object and no trend analytics**; "Time Machine" is board replay, not analysis.

**Pricing: no free tier since Sept 2024.** 30-day trial, then the account **pauses read-only**.
Starter $4/member/month annual ($5 monthly); Business $6 annual ($8 monthly). Starter gets 1 team
and **zero external guests**; Business caps at 200 members with 2 guests per board; Enterprise
includes on-prem ([spreo.io/pricing](https://spreo.io/pricing)).

**The lock-in finding.** Export is **blocked on paused accounts** — "You cannot create, edit or
export boards." Stop paying and you cannot get your retro history out. That is the hardest
data-portability trap found anywhere in this teardown.

**Other annoyances:** no mobile or tablet support at all; PDF export runs a 99.636% uptime SLO
against 99.999% for core; documentation rot across three brand names; the security certifications
shown are DigitalOcean's rather than their own, in a single region (AMS3). The 2026 roadmap — a
WebGL rewrite, Ctrl+F, and a minimap — is the vendor confirming large-board lag and
lost-on-canvas as real problems.

**What they got right, and it is not nothing:** the fun is real and shipped — Jukebox, Spinner,
Buzzer, Counter, Object Tray, confetti cannon, Throw Hat, and Slapping (spacebar-fling an avatar,
with sound). Retrium ships none of this; it is a genuine axis of differentiation that costs
little.

### Retrium — the most committed guided retro, and a cautionary tale

**Three phase machines, not one.** Columnar/sticky techniques run **THINK → GROUP → VOTE →
DISCUSS → WRAP UP**; the Radar runs **DEFINE → COLLECT → ANALYZE**; and root-cause/fishbone runs
**DEFINE → THINK → GROUP → ELABORATE → DISCUSS → WRAP UP**
([root cause](https://support.retrium.com/articles/how-do-i-run-a-root-cause-analysis-in-retrium/)).
Note there is **no "Prime Directive" phase** — that is Academy methodology content, not product.
14 techniques ship (4Ls, Sprint Goal, Fishbone, Goals Alignment Radar, Lean Coffee, Mad Sad Glad,
Safety Check Radar, Sailboat, Starfish, Start Stop Continue, SWOT, Team Radar, What Went Well/What
Didn't, WRAP — [techniques](https://www.retrium.com/retrospective-techniques)), but the columnar
ones are one engine with different column headers.

**This is the hardest lockstep in the market.** Participants are locked to the facilitator's
phase, stated verbatim and repeated after every transition: "*the facilitator will move the team
to the Group phase. This is automatic and your screen will follow along.*" Only the facilitator
advances, via a right-hand orange arrow with a confirm dialog. The sole opt-out anywhere in the
product is **Abstain**, and only during Vote. Whether anyone can move *backwards* is
**unverified** — the docs only ever describe forward motion. The facilitator is whoever picked
the technique and clicked Start Retro; anyone with team-room access can "Take over facilitation"
([facilitator](https://support.retrium.com/articles/what-does-the-retrospective-facilitator-do/)).

**Reveal is global and facilitator-gated** — the exact opposite of Spreo. Cards are blurred for
everyone until the facilitator toggles "Reveal notes for everyone" / "Blur notes for everyone".
There is no per-author reveal. (Fishbone's Think phase is unblurred by default.)

**Anonymity is always on and non-configurable** — their single most-praised property. "During the
private brainstorming phase, you'll only be able to see the content of your own notes unless the
facilitator reveals everyone's notes. This is to reduce groupthink and to maintain the anonymity
of individuals"
([help](https://support.retrium.com/how-do-i-maintain-anonymity-in-my-retrospectives)). The
commitment goes deeper than a flag: note colours are explicitly decoupled from author *and*
column, radar line colours are randomised, and "everything remains anonymous when exported". No
admin de-anonymisation is documented. A reviewer's summary: "It **DOESN'T show who is typing
what**".

**Voting is dogma.** Each participant gets **√(number of topics)** votes, **non-overridable**.
Votes are private during voting and revealed on entering Discuss. One round only. Abstain
available. Nobody else in the category computes a budget for you; nobody else refuses to let you
change it either.

**Grouping is column-based, simultaneous and collaborative, with human conflict resolution.**
There is no merge logic and no AI — the facilitator's *documented job* is to notice disagreement
about a card's placement and call a discussion about it. That is a deliberate design position,
not a gap.

**Action items** are created in DISCUSS by anyone present, with an optional "ambassador" (owner)
and target completion date, both marked "recommended", SMART guidance in-product, and
complete / archive-with-reason / delete
([help](https://support.retrium.com/articles/how-do-action-items-work-in-retrium/)). Carryover
happens by placement rather than by phase: open actions sit on the **Home tab** — the same screen
you launch the next retro from.

**The Slack app is the standout integration in the whole teardown**: it pushes phase progression
and an end-of-meeting summary, and sends a **weekly digest with mark-complete buttons and two-way
sync**. That is a real accountability loop, and it is the only one found anywhere. Against it,
Jira sends the title only and is **Cloud-only** with no support for issue types that have custom
required fields; there is **no Microsoft Teams integration at all**; export is CSV/TXT only; and
the API is Enterprise-only and SCIM-only, so it cannot read retro data.

**Discuss** surfaces the top-voted topic first, auto-ordered by votes, with the team choosing how
many to cover. The timer is general-purpose and manual, not per-topic. **Wrap Up** ends with an
anonymous 1–5 "Was this retro worth our time?" — a self-evaluation loop nobody else ships.

**A Team Room is the unit of both product and billing** — "where your team goes to start a
retrospective, view your retrospective history and review action items". History is a real
timeline of cards, votes and actions; but **charted cross-retro trends appear to be absent**
(radar statistics are computed within a single radar). One retro may be open per room at a time;
250 participants max; 7 radar spokes max. **No free tier**, 30-day trial. Team Edition **$39 per
Team Room/month**; Business $59/room/month ($715/yr); Enterprise for 25+ teams. **Unlimited
users, price unchanged** ([pricing](https://www.retrium.com/pricing)). Note the anomaly: Business
at $715/room/yr costs more than Team at $468/room/yr for the same unlimited users, buying only
SSO, SOC audit access and priority support. No refunds "of any kind"; no on-prem and no plans for
it. A coach running 6 teams pays ~$2,808/yr regardless of headcount.

**Interaction is one-thing-at-a-time with no canvas**: columns, then a vote overlay, then a
single-topic view, then a rating screen. No drawing, images, GIFs, reactions or fun elements of
any kind. "Async" means leaving the room open.

**The complaints are quiet, and the quiet is the story.** Retrium has **12 G2 reviews, newest
1 Oct 2024**, an unclaimed G2 profile, 0 TrustRadius reviews and 3 on Capterra. Sentiment is
positive-to-neutral. What criticism exists is consistent:

- Per-room pricing suppresses adoption *inside paying accounts*: "I am Scrum Lead for 4 teams and
  **due to licensing limitations, we have been using Retrium for 2 of my teams**"
  ([G2](https://www.g2.com/products/retrium/reviews)); "pay per room will increase a lot the
  overall price" ([Capterra](https://www.capterra.com/p/149376/Retrium/reviews/)). Capterra's
  Value-for-Money sub-score is **2.0/5** against 4.7 overall — but that rests on a single rating
  out of three reviews and is anecdote, not a metric.
- Inflexibility, not condescension: "whenever I come up with a more creative retrospective that
  does not follow this format, **it is hard to host it with Retrium**… A nice improvement would be
  to have some more freedom in the flow of a retrospective, and which steps it has"
  ([Jelle Smeets, 2021](https://blog.jellesmeets.nl/review/remote-retrospectives-the-easy-way-a-retrium-review/)).
  The only substantive HN mention agrees: "I like retrium, but it's much more structured than a
  whiteboard-style tool" ([HN](https://news.ycombinator.com/item?id=37696324)).
- Action items go nowhere after the meeting: "The action item just **sits there within the tool**.
  I would prefer if Retrium… **sends out notifications to the tagged team member** as a follow up"
  (G2, Oct 2024).
- Mobile: "the view is not tailored for the small screen and is therefore not very practical".

**The real signal is a stalled product.** Founded 2015, total funding **$1M** from a single 2017
seed round, ~8 FTE ([CB Insights](https://www.cbinsights.com/company/retrium)). The public
changelog has been silent since **27 Aug 2024**; the CIJ beta has been closed since Dec 2023; and
"Retrium Next" is an AI rebuild in a **separate environment with no data migration**, in which
they dismiss their own flow — "Yeah. We're done with that." Post-2017 company status (layoffs,
acquisition) is **unverified** — CB Insights carries nothing after 2017. Trustpilot and Gartner
Peer Insights were not checked.

Retrium's own 2026 framing of the problem it is chasing is worth keeping: "teams struggle when
their facilitator is on PTO, switches teams, or just wasn't trained in this stuff to begin with."
That is the facilitator-dependency problem, stated by the vendor most committed to the
facilitator-driven model.

### FigJam — no session model, no anonymity, cheapest seat

**There is no phase concept at all.**
[Run meetings in FigJam](https://help.figma.com/hc/en-us/articles/8538436879767-Run-meetings-in-FigJam)
enumerates timer, music, spotlight, voting, stamps, cursor chat, audio, open session, templates and
sections — and contains no stage, phase or step. Sections are labelled static regions. Spotlight is
a viewport broadcast: it moves eyeballs, it does not gate what anyone can do.

**No content hiding exists.** Confirmed negative against
[Sticky notes in FigJam](https://help.figma.com/hc/en-us/articles/1500004414322-Sticky-notes-in-FigJam).
The gap is long-standing and loudly felt:
[private writing](https://forum.figma.com/suggest-a-feature-11/private-writing-13312) ran
Jul 2022 → Aug 2025 with 3,590 views — "**It's not possible to have a good retro without this
capability**"; also
[truly anonymous stickies](https://forum.figma.com/suggest-a-feature-11/bring-truly-anonymous-sticky-notes-to-figjam-8801)
(2022) and
[anonymous voting + stickies](https://forum.figma.com/suggest-a-feature-11/anonymous-voting-stickies-18636)
(Sep 2024 → Mar 2026) — "This is essential for our retro process". Figma's only public reply in
four years is "We'll pass this onto the FigJam team for future consideration." A community widget,
[See No Sticky!](https://www.figma.com/community/widget/1134911678648354187/see-no-sticky), exists
solely to fake it.

**Anonymity is cosmetic, provably.** The
[REST API spec](https://github.com/figma/rest-api-spec/blob/main/openapi/openapi.yaml) exposes
`authorVisible: boolean` on `StickyNode`, but the Plugin API typings expose both
`authorVisible: boolean` **and** `authorName: string` as independent mutable properties — any
plugin reads the author directly. The toggle is per-sticky and reversible by anyone, and FigJam AI
can [sort stickies by Author](https://help.figma.com/hc/en-us/articles/18711926790423-Sort-and-summarize-stickies-with-FigJam-AI),
a first-party feature reading the retained data.

**Voting is paid-only.** "Voting sessions can be started in files that are part of a paid team."
Participants see their own votes while others' stay hidden until the session ends, and multiplayer
cursors are hidden so votes aren't revealed early — but afterwards you can review "how each
participant voted", so it is not anonymous. There is no integrated timer: you "still have to
manually end the session"
([voting](https://help.figma.com/hc/en-us/articles/9359912208663-Run-voting-sessions-in-FigJam)).

**No action items.** The [Jira integration](https://help.figma.com/hc/en-us/articles/360039827834-Jira-and-Figma)
runs the opposite direction, embedding Figma files into Jira issues. There is no sticky→ticket path.

**Pricing.** Starter (free): 3 FigJam files, 3 pages per file, 30 days version history. The
**Collab seat is $3/month** on Professional ($5 on Org/Enterprise) and grants full FigJam editing —
**the cheapest per-participant price in this comparison**, and the number any new entrant has to
beat ([pricing](https://www.figma.com/pricing/)). The dedicated FigJam iPad app was retired
8 January 2026.

### Miro — strong primitives, no sequencing, and the retro toolkit is paid

**No retro phase machinery.** [miro.com/agile/retrospective/](https://miro.com/agile/retrospective/)
presents a four-step flow — collect → cluster → prioritise → plan — but each step is a separately
started, independent feature. Nothing sequences them, nothing enforces order, nothing knows a retro
is in progress. Miro's advantage over FigJam is that the individual primitives are far stronger,
not that a session model exists.

**The free plan cannot run a facilitated retro.** Per the authoritative
[plans matrix](https://help.miro.com/hc/en-us/articles/360017730233-Plans-and-features-available):
timer ✘, voting ✘, private mode ✘, editing visitors ✘, custom templates ✘ on Free. The entire retro
toolkit starts at Starter, $8/member/month. And Free allows "only 3 most recently created boards…
The rest… are locked in a view-only mode" — per **team**, not per person, so a colleague creating a
board locks yours, and you cannot choose which three survive
([Free Plan](https://help.miro.com/hc/en-us/articles/360017730373-Free-Plan)).

**Private mode is the strongest anonymity primitive in the category** — and it is paid. Any board
editor can start it; new sticky text is hidden and others see a closed-eye icon. The start-time
toggle **"Make names anonymous"** makes text "anonymous **forever** — even after private mode is
turned off", removes author labels, disables Follow, anonymises cursors and 'Created/Modified by',
and **excludes the content from Board history and Highlight changes**. "Anyone can reveal their
stickies" is explicitly framed for retro turn-taking. Miro's own caveat: "it is not a data
protection feature" ([private mode](https://help.miro.com/hc/en-us/articles/9794413310482-Private-mode)).
It hides sticky **text only** — colour-coded stickies still leak the signal — and in Oct–Nov 2025
Miro AI's catch-up feature printed private sticky content **under each author's real name** before
being fixed
([thread](https://community.miro.com/developer-platform-and-apis-57/resolved-private-mode-sticky-notes-being-revealed-26230)).
A bolt-on privacy mode fails when a new surface is added that doesn't know about it.

**Voting**: budget up to 99, optional one-vote-per-object, duration configurable in minutes, hours
or **days** (so async works), "all votes are anonymous", per-participant completion visible to the
facilitator, results persistable to the board — but **no export** ("you can take a screenshot as a
workaround") and **not carried into a duplicated board**
([voting](https://help.miro.com/hc/en-us/articles/360017572274-Voting)). Guests and edit-capable
visitors **cannot start a voting session**, so whoever runs the retro must be a paid member.

**Performance is vendor-documented as a ceiling**: "performance can be impacted starting from 1,000
objects… we recommend keeping the number of objects on the board below 5,000", with advice to
"minimize navigation across the board" and lock objects so participants don't move each other's
content
([performance](https://help.miro.com/hc/en-us/articles/360013588560-Board-performance-and-loading-issues)).

**Pricing**: Free $0, Starter $8, Business $20 per member/month annual, Enterprise custom with a
30-member minimum. Guests need **Business** to edit. AI credits on Free are **10/month pooled
across the entire team**, and "Guests and Visitors can't run AI actions"
([credits](https://help.miro.com/hc/en-us/articles/19756209116178-Miro-AI-credits)).

---

## Second-tier entrants — and what their pricing admits

| Tool | Free tier | Paid entry | Billing unit |
|---|---|---|---|
| [Neatro](https://www.neatro.io/pricing) | 10 members, unlimited retros, **30-day data history** | $23.20/mo | **per team** |
| [GoRetro](https://www.goretro.ai/pricing) | **none** (30-day trial) | $29/mo | **per team** |
| Echometer | **1 team, 1 retro per month** | ~$40/mo | **per team** |
| [Scatterspoke](https://www.scatterspoke.com/pricing) | 1 seat | $29/seat/mo | per seat |
| Atlassian | free with Confluence | — | — |

Atlassian is the notable one. The largest incumbent in agile tooling ships a **page template** —
the [Retrospective Blueprint](https://confluence.atlassian.com/conf94/retrospective-blueprint-1540721739.html):
what went well / what needs improvement / action items, plus an auto-created index page listing all
retrospectives in the space. No phases, no voting, no anonymity, no grouping. That is the real
baseline most teams are choosing between.

**Two patterns fall out of this table.**

First, **the category has converged on per-team pricing** — Retrium per Team Room, TeamRetro per
team, EasyRetro flat, Neatro per team, GoRetro per team, Echometer per team — because a
45-minute biweekly meeting cannot carry a per-seat licence. Spreo went the other way *and* removed
its free tier.

Second, and more usefully: **free tiers are squeezed precisely on continuity.** Parabol 30-day
history. Neatro 30-day history. Echometer one retro per month. EasyRetro two boards per month with
older ones deleted to make room. Miro locks your older boards. FigJam expires version history at
30 days. TeamRetro, Retrium, GoRetro and Spreo have no free tier at all. The industry monetises
exactly the mechanism that makes retrospectives work.

---

## Where they annoy users — the cross-cutting themes

**Action items go nowhere.** The most consistent complaint in the category, and it predates all
these products. On HN: "After every single project, the org comes together to do a retrospective…
People leading the project take no action items, management doesn't hold themselves accountable at
all… And so, the cycle repeats next time"
([HN](https://news.ycombinator.com/item?id=46048044)). A retro-tool founder's own pitch names it:
"teams lose or don't complete their action items from retrospectives. It happens because many
existing tools don't focus on action items as much as they should"
([HN](https://news.ycombinator.com/item?id=19264268)). Retrium's newest G2 review says the action
item "just sits there within the tool". Parabol only made action review a default phase in
August 2026, and did not migrate existing teams.

**Retros have no memory.** "Generally they've have been a waste of time… the minutes from the retro
meetings don't get recorded anywhere anyway, so there's nothing to refer back to in the future"
([HN](https://news.ycombinator.com/item?id=31534439)); "the ceremonies like retro (exercise in
taking notes and throwing them away)" ([HN](https://news.ycombinator.com/item?id=27581572)).
EasyRetro reviewers: "the reporting and data export features could be more robust to help track
progress over time". FigJam and Miro have no history model beyond duplicating a file — and
duplication is exactly where the output is dropped, because Miro doesn't copy voting results and
Miro custom templates drop note content.

**Anonymity is all-or-nothing, and both settings are wrong.** The evidence cuts both ways in the
same corpus. For anonymity: "As a senior, I found out that at the last 'retrospective' I was one
the only ones who had anything on 'needs improvement'… and **during anonymous voting my items did
get most of the votes**" ([HN](https://news.ycombinator.com/item?id=44475806)) — the hidden
agreement only surfaced because the vote was anonymous. Against it: Parabol
[#2806](https://github.com/ParabolInc/parabol/issues/2806) reports anonymity **decreased**
participation in discussion. Teams hand-roll it when the tool won't: "The doc didn't have edit
history enabled, so it was (mostly) anonymous"
([HN](https://news.ycombinator.com/item?id=36844555)). Only TeamRetro offers graduated levels, and
even it cannot vary anonymity **across phases**, which is what the evidence actually asks for.

**Grouping is the hated part, and delegating it fails in both directions.** Facilitator-only
grouping disengages the room — "When a facilitator takes grouping out of the hands of participants,
they leave the majority of the room to watch and disengage, which is stressful for the facilitator
and isn't fun for participants either"
([Easy Agile](https://www.easyagile.com/blog/facilitator-tips-how-to-deal-with-common-retro-problems)).
Open grouping lets people move cards during others' reflection (Parabol G2). Mechanically it is
also just bad: EasyRetro's merge is "very difficult", TeamRetro's is "slow and buggy while grouping"
as of Feb 2026. Every vendor's 2025–26 answer is AI — Parabol embeddings, TeamRetro suggest-groups,
Miro AI clusters, Spreo AI clustering.

**Loudest voice wins.** "Extroverts thrive at stand-ups, planning, and retros"
([HN](https://news.ycombinator.com/item?id=17674405)). No tool addresses turn-taking beyond
Retrium's discuss-one-at-a-time and Miro's per-person reveal.

**Occasional participants are priced as employees.** A Miro guest needs a $20/member/month Business
seat to edit; a Starter visitor can edit but cannot start a vote. Retrium's per-room licensing
demonstrably suppresses adoption inside paying accounts. FigJam's $3 Collab seat is the honest
exception.

**Async is a workaround, not a mode.** TeamRetro's documented async recipe is literally: drag
BRAINSTORM to the top of the workflow and "leave the meeting in the BRAINSTORM step to allow
participants to add their ideas in their own time". No deadline, no reminder, no partial-
participation model, and "participants cannot vote or group ideas until moved to the next step"
([async guide](https://help.teamretro.com/article/442-running-an-asynchronous-brainstorming-retrospective)).
Retrium and Parabol are synchronous by construction. Miro's voting-session duration in **days** is
the closest thing to a designed async primitive anywhere in the set.

**Mobile is second-class for the people who most need it.** Miro's timer is browser/desktop only
and voting excludes phones; FigJam retired its iPad app; Retrium "is not tailored for the small
screen"; EasyRetro only shipped mobile drag-and-drop in April 2024.

**Nobody has won.** Every Show HN retro-tool launch scores under 15 points — Better 12, GoRetro 8,
FunRetro 4, QuickRetro 3, Fast Retro 2, Metro Retro 1, Rapport 1, SprintPulse 1. Retrium, the
most-committed guided-retro product in the market, has 12 G2 reviews after eleven years, $1M raised
and no changelog since August 2024. Metro Retro rebranded away from retros entirely. The category is
crowded, undifferentiated, and commercially unproven.

---

## What's genuinely unsolved

Ranked by how structural the gap is — that is, how unlikely the incumbents are to close it.

**0. A phase machine that is *soft*.** This is the biggest single opening, and it only becomes
visible once you see the two poles together. Retrium enforces one rigid flow — participants' screens
follow the facilitator, the sole opt-out anywhere is Abstain during Vote, and its own reviewers say
"it is hard to host a creative retrospective with Retrium". Spreo deleted the flow entirely and made
the human the whole runtime. Parabol sits between and is the closest anyone gets — soft lockstep,
data-precondition locks on Group and Discuss, free navigation once Discuss begins — but its four core
phases **cannot be turned off**, and advancing yanks typing participants out of Reflect.

Nobody ships *suggested* phases that carry real state — reveal policy, vote budget, discussion
ordering — which a team can skip, reorder, or run ahead of without the tool breaking. That is the
gap between "structured" and "rigid", and it is where the whole product sits.

**1. Anonymity that varies across phases.** Every tool treats anonymity as one global constant.
Parabol: a single `disableAnonymity` boolean, snapshotted at meeting start so it cannot even change
mid-meeting — and leaked five separate times, because one flag consulted by many surfaces fails at
whichever surface forgets. Retrium: always anonymous, non-configurable. Spreo: off by default, on
principle. TeamRetro gets closest with three levels and a one-way ratchet, and with the right
instinct about *what* to anonymise — deliberately keeping action assignment, action comments and
team membership attributed.

But nobody offers *anonymous while writing, attributed while discussing*, and nobody offers
per-column or per-activity anonymity. That is precisely what the contradictory evidence asks for:
anonymity surfaces the unpopular truth ("during anonymous voting my items did get most of the
votes") and then blocks the follow-up ("call on each person to share and add color"). It is a design
question nobody has answered, not a feature nobody has built.

**1b. Reveal semantics are genuinely unsolved.** Retrium reveals **globally, facilitator-gated**;
Spreo reveals **per-author, self-serve**; Parabol reveals implicitly by advancing a phase; FigJam
cannot reveal at all. These are opposite answers with opposite failure modes — global reveal creates
the "everyone waits for one person" problem, self-serve reveal creates the "nobody goes first"
problem. A **per-phase reveal policy** is unclaimed ground, and it is the same decision as §1 wearing
a different hat.

**2. Continuity, given away rather than sold.** Retro history is the mechanism that makes the ritual
work, and it is the thing every free tier is engineered to withhold. A product that keeps history
permanently and free inverts the entire category's monetisation — which is why the incumbents
structurally cannot follow.

**3. The follow-through loop.** Parabol shipped action review as a default phase three weeks ago and
did not migrate existing teams. Retrium's action items "just sit there" with no notification.
EasyRetro converts a card to an action and then loses it. TeamRetro is the only one that has solved
it — by making carryover *two steps in the agenda* (`Open Actions` at the start, `Review` at the end)
plus a `PARKING LOT` that auto-transfers. That shape is validated and copyable.

**4. Async as a first-class mode.** Nothing in this set models a collection window: a deadline, a
reminder, who has and hasn't contributed, what happens to a late arrival, how a synchronous
discussion opens on top of asynchronously gathered cards. TeamRetro's "just leave it in Brainstorm"
is the state of the art. This is the cleanest air in the market.

**5. Structured but escapable.** TeamRetro's own reviewers leave for Trello and Miro when they want
quadrants or brainwriting; Retrium's reviewers say the same. Meanwhile canvas users beg for the
structure. Both halves of the market are asking for the middle, and the middle is empty — partly
because it is genuinely hard, and partly because, per §12 below, nobody has made this a business.

**6. Readiness that is actually legible.** This one is subtler than it first looks. Parabol *has*
the feature — a Ready toggle, a `readyCount/(activeCount - 1)` progress ring on the Next button, and
a forced double-click to advance Reflect/Group/Vote early — and reviewers **still** say "As a host of
a meeting, I can't see when my team is ready for the next phase." So the gap is not the signal, it is
the signal's legibility. TeamRetro's answer is more literal and evidently works: an `I'M FINISHED`
button, a check mark next to each avatar, and live typing indicators. Named, per-person, always
visible — not a ring on a button. That distinction is the whole lesson, and it is cheap.

**7. Grouping that does not need AI to be good.** Every vendor is solving this with embeddings.
AgileKit has ruled AI out of v1, so the grouping interaction has to win on design alone — against
incumbents whose *manual* grouping is measurably bad (EasyRetro "very difficult", TeamRetro "slow and
buggy" in 2026). That is a lower bar than it looks. Parabol's one detail worth copying regardless:
grouping must be undoable in one click.

**8. Guest participation without a seat.** The ceremony includes people who attend one 45-minute
meeting a fortnight. Per-seat tools price them as employees; per-team tools cap them (Spreo: 2 guests
per board on Starter). Anonymous link-join with no account is a structural advantage AgileKit already
has.

**9. Retro and estimation in one place.** TeamRetro sells both and makes you send two links.
EasyRetro pushes planning poker to an entirely different product. Spreo now sells planning poker,
sprint planning, story mapping and standups on one canvas — so this lane is being contested, not
ignored. AgileKit already owns the estimation half.

**10. Vote budgets are dogma or nothing.** Retrium computes **√(topics)** and refuses to let you
change it. Everyone else hands you a raw integer with no guidance. Nobody *suggests* a budget and
*allows* an override — which is the obviously correct answer and costs nothing.

**11. Data portability is a lever both vendors pull against users.** Spreo **blocks export on
paused accounts** — "You cannot create, edit or export boards" — so stopping payment traps your
retro history. Retrium locks history behind an activated Team Room. Parabol's retro CSV export only
shipped in November 2025 and strips authorship even from non-anonymous retros. EasyRetro wipes
accounts after a year of inactivity. Permanent, exportable history is not just a free-tier
differentiator; it is a trust differentiator.

**12. The category is commercially unproven, not merely underserved.** This is the caveat on every
item above. Retrium — the most-committed guided-retro product in existence — has 12 G2 reviews after
eleven years, $1M raised, ~8 staff, no changelog since August 2024, and is replacing its own flow
with an AI rebuild. Metro Retro renamed twice and stopped being a retro tool. Parabol laid people
off, pivoted from product-led to sales-led, and publicly retracted its own monetisation crackdown as
"overly aggressive". Every Show HN retro launch scores under 15 points. The empty middle is partly
empty because **nobody has yet made guided retrospectives a business that grows**. That argues for
building this as a second ceremony on an existing product with an existing audience — which is
exactly what #253 proposes — and against treating it as a standalone bet.

---

## Implications for the map (#253)

Cross-referencing the locked decisions against the gaps above:

- **Guided phase flow, not a blank whiteboard** puts us in archetype 1, so we inherit its documented
  failure modes. Design explicitly against: participants moving cards during others' reflection
  (Parabol), illegible readiness (Parabol — the ring exists and reviewers still say they can't see
  it), "I lost the ability to move the cards" (Parabol #2948), and "it is hard to host a creative
  retro with this" (Retrium, TeamRetro). Parabol's **two-tier navigability** — separate
  `isNavigable` / `isNavigableByFacilitator` per stage, with data-precondition phases excluded from
  pre-unlock, and full free navigation once Discuss begins — is the best-evidenced answer in the set
  and transfers directly to a Convex phase model. Take its lessons too: make the phases skippable
  (Parabol's four core phases are not), and never yank a typing participant forward.
- **Grouping** is the sharpest wedge available, because incumbent *manual* grouping is measurably
  bad and the reason is structural. Parabol accepts exactly two drop targets, hand-rolls 471 lines
  of pointer handling, has no keyboard path, no tap-to-select, and no merge-two-groups (open since
  2020); a user asked verbatim "**could you perhaps somehow select a group easier using
  dropdowns/tagging?**". EasyRetro's ⋯-menu merge is called "very difficult". TeamRetro's drag was
  "slow and buggy" in February 2026. **A non-drag grouping model — select-then-assign, keyboard and
  touch reachable — is defensible product ground that needs no AI.**
- **Async collection + sync discussion** is the cleanest unoccupied position in the market. Nothing
  here models a collection window properly.
- **Permanent retention, fully free** directly inverts the category's monetisation, which is the
  most defensible thing on the locked list.
- **No AI in v1** is survivable specifically because incumbent manual grouping is bad. But it does
  mean grouping UX is a first-class design problem, not a checkbox.
- **Anonymity** — the decision ticket should start from TeamRetro's split (anonymise ideas, votes and
  presence; never anonymise action ownership) and Parabol's implementation shape (store attributed,
  project at the read boundary, one enforcement point) — then go past both by letting the projection
  vary per phase.
- **Team entity, deliberately minimal** matches Retrium's Team Room definition almost exactly:
  "where your team goes to start a retrospective, view your retrospective history and review action
  items". That is the minimum viable team.
- **Anonymous link-join** is a bigger advantage than it looks. Parabol requires an account and team
  membership (`joinMeeting: isTeamMemberOfMeeting`), and iceboxed the request to change it with the
  customer's own words on the record: "I could not ask 10-200 people to go create an account".
  Spreo gives Starter customers **zero** external guests. Miro guests need a $20/member/month
  Business seat to edit. AgileKit already does anonymous link-join.
- **Positioning**: the honest comparison is not Parabol, it is **FigJam at $3/seat and Confluence's
  page template**. That is what teams actually use.

---

## Caveats — what is unverified, and what not to trust

Marked so downstream tickets do not harden these into facts.

**Unverified:**
- Whether Retrium or TeamRetro allow a facilitator to move phases *backward* mid-meeting. Both
  vendors' docs only ever describe forward motion.
- Whether Retrium charts any cross-retro trend. Radar statistics are computed within a single radar;
  a longitudinal view was not found.
- Retrium company events after 2017 (layoffs, acquisition). CB Insights carries nothing later.
- Parabol's "10 meetings per month" free cap appears on the pricing page but **has no enforcing
  constant or code path in the OSS repo**.
- Whether Miro's private mode is genuinely absent from the Free plan (it is not listed on Free, and
  is listed from Starter up).
- Trustpilot and Gartner Peer Insights were not checked for any vendor.
- FigJam voting on iPad.

**Actively unreliable — excluded or caveated above:**
- Third-party comparison sites (retrotools.io, retrospectivetools.com, softwarereview.com, and every
  vendor's "X alternative" page). retrotools.io states EasyRetro's free plan is 1 board, contradicting
  EasyRetro's own pricing page and help centre.
- Capterra's Retrium listing still advertises a "$5.00 flat rate per month" basic plan and a free
  version. Both are contradicted by retrium.com/pricing.
- Capterra's Retrium "Value for Money 2.0/5" rests on **one rating out of three reviews**. Directional
  at best; never quote it as a metric.
- GoRetro's "Product Direction 67% vs 93%" comparison figure — G2's Retrium profile has too few
  reviews for G2 to render satisfaction sub-scores at all.
- G2 review text throughout: G2 blocks automated fetching, so G2 quotes here are search-snippet
  derived unless explicitly noted as browser-verified.

**Two things that sound true and are not evidenced — do not repeat them:**
- *Backlash to Parabol's free-tier shrinkage.* The caps are real and Parabol themselves called their
  2026 enforcement "overly aggressive", but no user thread, review or issue expressing anger was
  found.
- *"Retros feel too long / too many phases" as a user complaint.* Only one interviewee gestures at it,
  and her point is that grouping and voting are unnecessary **for her small team**, not that the phase
  count is oppressive.
