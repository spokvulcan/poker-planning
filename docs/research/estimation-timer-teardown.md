# How estimation tools handle timers — a teardown

> Research for the estimation-timer redesign. Today every AgileKit room carries a manual count-up
> stopwatch node ([`TimerNode.tsx`](../../src/components/room/nodes/TimerNode.tsx)) that any room
> member may start, pause or reset ([`convex/timer.ts`](../../convex/timer.ts)) and that knows
> nothing about the voting round, while the server separately records time to consensus per issue
> ([`convex/schema.ts:164`](../../convex/schema.ts)) for the dashboard
> ([`dashboard-content.tsx`](../../src/app/%28app%29/dashboard/dashboard-content.tsx)) and the issues CSV
> ([`export-issues-csv.ts:60`](../../src/utils/export-issues-csv.ts)); a Quick Vote round has no
> issue and so no record ([`convex/model/votingRound.ts:32-63`](../../convex/model/votingRound.ts)).
> This note asks how other tools do it and what the evidence says about timeboxing estimation.
> Verified 2026-10-11. Every load-bearing claim below cites the source it came from.
> Claims that could not be confirmed at a primary source are marked **unverified**.

## Scope and method

**Tools.** Seven planning-poker web apps (PlanITpoker, PlanningPoker.com, Planning Poker Online,
Scrum Poker Online, Pointing Poker, Kollabe, Parabol Sprint Poker); seven Jira poker apps that
document a timer, drawn from the top of the Cloud install ranking in the
[Atlassian Marketplace API](https://marketplace.atlassian.com/rest/2/addons?text=planning%20poker&application=jira&hosting=cloud&limit=25)
on 2026-10-11 (SprintPoker, Async Poker and Smart Guess, which rank among them, were not checked);
three canvas or meeting timers (Miro, FigJam, Microsoft Teams); four retro tools (Retrium,
EasyRetro, TeamRetro, Easy Agile TeamRhythm).

**Sources, by weight.** Shipped code over documentation over marketing. Parabol was read from its
repository at commit [`e6145be`](https://github.com/ParabolInc/parabol/tree/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84)
(2026-10-08). PlanITpoker, PlanningPoker.com and Planning Poker Online were read from the
JavaScript bundles their apps serve to every visitor, fetched 2026-10-11; the hashed filenames
change on each deploy, so those links will rot. Two vendor pages that have since been rewritten or
removed were read from the Wayback Machine. Install counts and review texts come from the
Marketplace REST API. No room was created in any third-party tool, so on-screen placement is
inferred from code and help pages, not observed.

**Sentiment** comes from Marketplace reviews, vendor forums (community.miro.com, forum.figma.com),
Product Hunt and one competitor-hosted user interview, and is labelled as such. Reddit was not used.
Third-party comparison blogs were not used for feature facts.

**Skipped.** Ziteboard (no primary source found); Zoom poker apps (not evaluated); scrumpy.io (the
site refused TLS, so Scrumpy is covered through its vendor's Marketplace listings); Firepoker
([repo](https://github.com/evert0n/Firepoker), last push 2019: no timer in its game view or
controller, only orphaned `.timer-*` CSS rules).

---

## Findings in brief

- **Timers are low-salience.** Of 546 Marketplace reviews across the 13 most-installed
  poker-focused Jira apps, 2 mention a timer, both in passing (see
  [sentiment](#what-users-say-about-timers-sentiment-only)). Yet 13 of the 14 poker tools checked
  document one; Pointing Poker ships none, and the original technique had none
  ([Grenning 2002](https://wingman-sw.com/papers/PlanningPoker-v1.1.pdf)).
- **Three designs exist.** (1) A *round clock* bound to the story, which starts without a click:
  PlanITpoker, Planning Poker Online's `Time issues`, PlanningPoker.com, Appfire's autostart, Magic
  Estimations, DevSamurai. (2) A *facilitator countdown* launched by hand and indifferent to the
  vote: Parabol, Agile Poker, Planning Poker Agility, NASA, Retrium, TeamRetro. (3) A *generic
  canvas or meeting timer*: Miro, FigJam, Teams. AgileKit's free-floating manual count-up has no
  counterpart among the poker tools.
- **PlanITpoker already ships the unified design.** Its default timer is the current story's
  elapsed time: it starts when voting on the story starts, keeps running through re-votes, freezes
  when the moderator saves the final estimate, and the same number is stored as the story's voting
  duration, shown in a details modal, exported to CSV and totalled per room. That is close to
  AgileKit's time to consensus (which stops at reveal rather than at the saved estimate), made live.
- **What happens at zero splits the field**: a forced reveal (Appfire Planning Poker, Magic
  Estimations), a voting lockout (DevSamurai, archived docs), a cue and nothing else (most), an
  explicit no-forced-reveal rule (NASA), an overtime count (Teams).
- **Per-story time recording is rare**: PlanITpoker, Pointing Poker (deleted with the session) and
  Scrumpy's Confluence summary. Parabol stores stage times but shows none for poker; Kollabe's
  insights have no time metric; PlanningPoker.com's and Planning Poker Online's exports carry none.
- **Quiet is the norm in poker tools**: no timer sound in PlanITpoker or PlanningPoker.com, red
  only in the last ten seconds, Planning Poker Online's pie with the digits behind a tooltip, sound
  behind a toggle in Kollabe and Appfire (and opt-in in the retro tool EasyRetro). The complaints found attach to
  sound nobody can silence (Miro), controls anyone can grab (FigJam) and a timer not everyone sees
  (Parabol).
- **Durations: seconds for votes, minutes for talk, evidence for neither.** Vote-timer defaults and
  presets sit between 10 s and 2 min (Appfire, PlanITpoker); discussion-timer defaults between 1 and
  5 min (PlanningPoker.com, Mountain Goat, NASA, Parabol), with Planning Poker Online's 45 minutes
  the outlier. No controlled study of per-item timeboxes in planning poker was found; what exists
  says discussion improves estimates and time pressure makes groups lean on their initial
  preferences.

---

## Comparison table

Sources for every cell are in the per-tool notes below. Install counts are Jira Cloud installs on
2026-10-11.

| Tool | 1. Kind, durations | 2. Start / stop | 3. At zero | 4. Who controls; sync | 5. Time recorded | 6. Placement; default; price | 7. Unobtrusive touches |
|---|---|---|---|---|---|---|---|
| **AgileKit today** | Count-up stopwatch, m:ss | Manual play / pause / reset; ignores rounds | — | Any member with room write; synced | Separately: time to consensus per issue on dashboard and CSV; not for Quick Vote; not live | Canvas node in every room | Pulsing dot while running |
| **PlanITpoker** | Count-up `HH:MM:SS` by default; opt-in countdown 30 s (default), 1–5 min | Auto: starts with the story, runs through re-votes, freezes when the final estimate is saved, resumes if the story is reopened; moderator `Reset Timer` | Countdown halts at 0; no sound, no reveal | Moderator resets; computed from shared story timestamps | **Yes**: per-story voting duration, average voting time, fastest / slowest voter by name; CSV; room average and total | Players-list header, always shown; free | Red only in last 10 s of a countdown; grey when done |
| **PlanningPoker.com** | Countdown `MM:SS`; 1, 2, 3, 5, 10 min (default 1) | Starts with the game; resets to full on each story; runs on unless paused | Stops at 0; nothing else | Dealer only (+1m, start, pause); dealer's client broadcasts each second | No (CSV has no time column) | Opt-in per game, default off; free | Red at ≤10 s |
| **Planning Poker Online** | Countdown min:sec, default 45:00, editable | Manual; or `Time issues`: starts when an issue opens for voting, cancelled at reveal | Alert sound; facilitator gets `Time is up!` + Restart | Facilitator only (add 1 min, restart, cancel); synced | No | 36 px top-bar button; participants see it only while running; free | Pie fills green → amber (75%) → red (90%); digits only in tooltip |
| **Scrum Poker Online** | "Voting timer"; mechanics **unverified** | **unverified** | **unverified** | **unverified** | No history, no CSV | Premium, 40 USD/yr | Vendor suggests 3–5 min per story |
| **Pointing Poker** | None | — | — | — | Statistics panel: time per story, clear → consensus; deleted with the session | Creator can hide UI elements; free | Passive only |
| **Parabol Sprint Poker** | Countdown 1–10 min (default 5 in Estimate, 3 in Scope) or async deadline | Manual; survives reveal; cleared when the stage completes | `Time's Up!` gold pill + ticking sound ending at 0 | Facilitator only, server-enforced; shown only on the story it was set for | Stage start / end stored, not shown for poker | Facilitator's bottom bar; pill only while set; no tier check found | History-based suggestion, but only for Scope, not Estimate |
| **Kollabe** | Timer for "timeboxed voting rounds"; durations **unverified** | **unverified** | Optional audio alert, also in background tabs | Synced via room events; controller **unverified** | No time metric in Team Insights | **unverified** | Sound toggle at set time, remembered |
| **Planning Poker®, Appfire** (3,492) | Countdown; Cloud 10 / 60 / 120 s or custom; DC default 45 s | Manual, or `Start timer automatically` per issue (DC: not on round 1) | Ends voting: cards revealed, discussion starts | Game admin only | Game CSV export; time **unverified** | Admin controls in voting phase; opt-in | Optional sound at start and end |
| **Planning Poker Agility** (3,301) | Timers in seconds, for discussion or voting | Moderator; saved as board default | **unverified** | Moderator | None documented | Session config | — |
| **Agile Poker for Jira, Appfire** (1,812) | Values in seconds; preset buttons (10 s, 60 s) | Moderator launches | **unverified** | Moderator | None documented | Session config | Pitched for timeboxing review of results |
| **Magic Estimations** (1,445) | Voting timeout; duration **unverified** | Auto on each new issue | **Auto-reveal** | Set at game creation | None documented | Opt-in; outside recommended defaults | — |
| **DevSamurai AgileBox** (774) | Per-issue countdown set at game creation (archived docs) | Starts with the game | **Card choice locked**; results shown | Monitor can finish early | Gamelog; time **unverified** | — | Review: adjustable and mutable |
| **Scrumpy, AELBOX** (755) | Voting timer + session timer | **unverified** | **unverified** | **unverified** | Confluence summary: session timings, estimation time per task | Jira app + Confluence companion | Adjustable sound volume |
| **NASA, resolution** (111) | Fixed 2 min | **unverified** | Stops; **no forced reveal** | Facilitator pause / reset | No | Beside the voting cards | Facilitator decides when to reveal |
| **Miro** | Countdown, typed or ±; +1m / +5m | Manual | Visual + chime for everyone | Owners and editors (invited, space or team); starts and ends for all | No | Collaboration toolbar; minimise to icon; Starter+ only; browser and desktop | Optional music, mutable |
| **FigJam** | Countdown ≤ 99:59; one per file; add, never reduce | Manual | Shakes and shows 00:00 for all; no sound documented | Anyone with edit; cannot restrict | No | Top-right panel; hide to toolbar; all plans | Per-user music volume |
| **Microsoft Teams** | Countdown ≤ 100 min | Manual | Sound + red; keeps counting overtime | Any participant adds; presenters see it | No | Meeting `More` menu | Colours shift toward zero |
| **Retrium** | Countdown; add minute; reset | Manual | Facilitator can send an alert sound | Facilitator only; all see it | No | Bottom nav bar | Recommended for Discuss only |
| **EasyRetro** | Countdown in minutes | Manual (Add → New timer) | Sound only if ticked before start | Not stated; click countdown to stop | No | Next to Add button | Sound opt-in |
| **TeamRetro** | Per-step countdowns, defaults set before the meeting | Manual, per step | Chime; red pulse | **unverified** | No | Top of screen | Bell mutes the chime; music needs a timer |
| **Easy Agile TeamRhythm** (retro) | Countdown; add-time buttons | Manual | `Time's up` message | **Not synchronised**; refresh clears it | No | Retro page | — |

---

## Per-tool notes

### Planning-poker web apps

#### PlanITpoker — the round clock, and the most time data in the category

Read from the app bundle ([`index-f4c92f8a.js`](https://app.planitpoker.com/assets/index-f4c92f8a.js),
[`index-a9586f7f.css`](https://app.planitpoker.com/assets/index-a9586f7f.css)).

**The timer is a per-story clock, not a widget.** A `timer` store derives the display from the
current story's stored timestamps: with no countdown configured it counts up from the story's start
and formats it `HH:MM:SS`; with a countdown configured it counts down and halts at zero
([bundle](https://app.planitpoker.com/assets/index-f4c92f8a.js)). It starts when the room enters
play and stops when the moderator saves the story's final estimate (`Finish Voting`), not at
`Flip Cards`, so it includes the discussion after the reveal; `Clear Votes` leaves it running, so
re-votes accumulate; moving to the next story stamps that story's start, so the clock restarts per
story without anyone touching it; and a moderator-only `Reset Timer` button restamps the current
story ([bundle](https://app.planitpoker.com/assets/index-f4c92f8a.js)). Because every client
computes from the same stored timestamps, the clock is synced without a ticking server.

**Countdown is opt-in at room creation**: the checkbox `Do you want to use a countdown timer?` is off
by default and offers 30 s (preselected), 1, 2, 3, 4 or 5 minutes; five minutes is the ceiling
([bundle](https://app.planitpoker.com/assets/index-f4c92f8a.js)). No plan check guards the option
([bundle](https://app.planitpoker.com/assets/index-f4c92f8a.js)), and the pricing page lists no timer
among paid features ([pricing](https://www.planitpoker.com/pricing)).

**Expiry does nothing but stop.** No timer sound exists in the app and no reveal is tied to time
(auto-reveal is a separate setting). The numerals turn `--timer-red` only in the last ten seconds of
a countdown and grey once the story is done
([CSS](https://app.planitpoker.com/assets/index-a9586f7f.css),
[bundle](https://app.planitpoker.com/assets/index-f4c92f8a.js)). The `RoomTimer` (clock icon plus
numerals) sits in the header of the players list and is always rendered; no setting hides it
([bundle](https://app.planitpoker.com/assets/index-f4c92f8a.js)).

**Recording is where it stands out.** Each story keeps `started_at`, `timer` and `finished_at`;
reopening a finished story shifts `timer` forward by the time the story sat finished, so the clock
resumes rather than restarts — the same "summed over re-votes" idea as AgileKit's time to consensus,
measured to the saved estimate instead of the reveal
([bundle](https://app.planitpoker.com/assets/index-f4c92f8a.js)). The story-details modal shows
`Voting started`, `Voting duration` and `Average voting time`, plus each vote's own duration; the
stories list can show time, fastest and slowest columns; `Export Stories` writes a CSV with
`Voting Duration`, `Avg Voting Time`, `Fastest` and `Slowest` per story; and the rooms list shows each
room's fastest and slowest voter **by name** with their average voting time, plus the room's average
and total time ([bundle](https://app.planitpoker.com/assets/index-f4c92f8a.js)).

#### PlanningPoker.com — an opt-in per-story countdown the dealer owns

Read from the app bundle
([`app-3fcf6929….js`](https://play.planningpoker.com/app-3fcf6929-5572-420b-a5f1-d50975a1f41e.js)).

**Opt-in per game.** The create-game form asks `Would you like a story timer?` (default No) and then
`How much time would you like for each story?` with 1, 2, 3, 5 or 10 minutes, default 1
([bundle](https://play.planningpoker.com/app-3fcf6929-5572-420b-a5f1-d50975a1f41e.js)). The paid
checks in that form gate custom scales and saving defaults, not the timer
([bundle](https://play.planningpoker.com/app-3fcf6929-5572-420b-a5f1-d50975a1f41e.js)).

**Behaviour.** A `MM:SS` countdown that switches to a dark-red class at ten seconds or less. It
starts when the game view mounts for the dealer (the game's creator), resets to full length whenever
the story changes, and restarts itself on the next story if it had run out — only a dealer pause
stops it. Only the dealer sees `+1m`, start and pause, and only the dealer's client broadcasts the
remaining time to everyone every second. At zero the interval simply stops: the timer triggers no
sound and no flip ([bundle](https://play.planningpoker.com/app-3fcf6929-5572-420b-a5f1-d50975a1f41e.js)).
The vendor's own 2018 advice frames it as a check on whether talk is still productive, to reach for
when the team drifts into detail ([tips](https://planningpoker.com/?p=337)).

**No time is recorded.** The paid CSV export carries issue key, summary, description, acceptance
criteria and story points only ([bundle](https://play.planningpoker.com/app-3fcf6929-5572-420b-a5f1-d50975a1f41e.js)).

#### Planning Poker Online (We Agile You) — a facilitator timer that can become the round

**Documented:** a shared discussion timer the facilitator starts, pauses, resets and extends; default
45 minutes, editable in place; optionally restarts for each issue; plays a sound when it runs out;
free plan, web app and Jira app alike ([features](https://planningpokeronline.com/features/)). The
45-minute default is not a typo: the app's timer form initialises to 45:00 and afterwards to the last
duration used ([bundle](https://planningpokeronline.com/app-38f60a0de4d0aa84124e.js)). The same
vendor's [Jira app](https://marketplace.atlassian.com/apps/1233326/planning-poker-online-for-jira)
has the timer too ([features](https://planningpokeronline.com/features/)).

**From the code** ([bundle](https://planningpokeronline.com/app-38f60a0de4d0aa84124e.js)):
controls render only for users who can manage the game — `Add 1 minute`, `Restart`, `Cancel` and a
`Time issues` switch while running; a minutes/seconds form and `Start` while idle. With
`Time issues` on, opening an issue for voting starts the timer and revealing it (by hand or by
auto-reveal on the last vote) cancels it, so the timer becomes exactly the voting round. The display
is a 36-pixel round button in the top bar holding a pie that fills as time passes, green until 75%
elapsed, amber to 90%, red after; the remaining time appears only in a tooltip, and non-facilitators
see the pie only while it runs. At expiry the component plays an alert sound — the effect is not
gated on role and no mute control exists in the component — and shows the facilitator a red
`Time is up!` toast with `Restart`.

**Separately**, a short countdown before the cards flip gives late voters a moment, and auto-reveal
flips once everyone has voted; both are per-game and can be switched off
([features](https://planningpokeronline.com/features/)). Paid voting history keeps issue, result,
average and most-voted card — no time ([features](https://planningpokeronline.com/features/)). The
vendor's heuristic is 60–90-minute sessions of 10–15 stories, using the timer against fatigue
([remote teams](https://planningpokeronline.com/planning-poker-for-remote-teams/)).

#### Scrum Poker Online — the timer as a paid convenience

A built-in voting timer for time-boxing each story is one of four Premium extras at 40 USD a year;
the free tiers have none ([pricing](https://www.scrumpoker-online.org/en/pricing/)). The vendor
suggests a three-to-five-minute box per story so the team either decides or splits, and states the
tool keeps no round history and exports no CSV
([features](https://www.scrumpoker-online.org/en/features/)). Count direction, controls and expiry
behaviour are not documented and the room client was not inspected: **unverified**.

#### Pointing Poker — no timer, passive timing instead

No countdown appears in its documentation ([About](https://pointingpoker.com/About)) and its realtime
hub exposes no timer methods — only voting, reset, show-votes, notes and session calls
([hub proxy](https://pointingpoker.com/signalr/hubs)). Instead its statistics panel tracks how long
each story takes from clearing the previous votes to consensus; the vendor reads consistently long
times as a refinement problem and uniformly quick ones as too little discussion
([About](https://pointingpoker.com/About)). The data is deleted when the last participant leaves;
session creators can hide interface elements; the vendor advises deferring a story once discussion
passes 5–10 minutes ([About](https://pointingpoker.com/About)). Free, ad-supported
([home](https://pointingpoker.com/)).

#### Kollabe — a timer with an opt-out sound

Kollabe's comparison pages claim a built-in timer for timeboxed voting rounds
([vendor page](https://kollabe.com/alternatives/planning-poker-online)). Since 31 October 2025 an
audio alert plays when a retro or poker timer completes, even in a background tab; it is switched on
or off with a checkbox when the timer is set, remembered per user, pitched at facilitators who would
otherwise keep checking the clock, and available to all users
([update](https://kollabe.com/product-updates/audio-alerts-for-timers)). The poker room client listens
for a `timer-modified` event and keeps timers in shared room state, so timers are server-synced
([room bundle](https://kollabe.com/_next/static/chunks/pages/room-e527548f1ecffba4.js)). Auto-reveal
(January 2024) fires when everyone has voted and an admin is present, not on time
([update](https://kollabe.com/product-updates/automatic-round-reveal)). Team Insights' estimation
trends are consensus rate, average points and widest spreads — no time metric
([update](https://kollabe.com/product-updates/team-insights)). Durations, presets, controller and
placement: **unverified**. Kollabe's own blog recommends about two minutes per story in one post
([post](https://kollabe.com/posts/planning-poker-for-agile)) and a hard five in another
([post](https://kollabe.com/posts/planning-poker-disagreements)).

#### Parabol Sprint Poker — the facilitator countdown, and where the history suggestion stops

Read from the repository at
[`e6145be`](https://github.com/ParabolInc/parabol/tree/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84);
paths below are under `packages/`.

**Facilitator-only, enforced twice.** The bottom control bar shows the Timer button only to the
facilitator, only on incomplete stages, and not in lobby, check-in, first/last call or summary
([`MeetingControlBar.tsx#L116`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/MeetingControlBar.tsx#L116),
[`showTimerInPhase.ts`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/utils/showTimerInPhase.ts));
the `setStageTimer` mutation is guarded by `isMeetingFacilitator`
([`permissions.ts#L311`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/graphql/public/permissions.ts#L311)).
No tier check appears on this path; whether the free tier is limited is **unverified**.

**Two modes in one panel**: `Timer`, a synchronous countdown picked from 1 to 10 minutes, and
`Time Limit`, an asynchronous deadline with a date and hour picker and an optional Slack notice; the
panel opens on the async tab when at most one member is connected
([`StageTimerModal.tsx`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/StageTimerModal.tsx),
[`StageTimerModalTimeLimit.tsx#L27`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/StageTimerModalTimeLimit.tsx#L27),
[`StageTimerControl.tsx#L93`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/StageTimerControl.tsx#L93),
[`setStageTimer.ts#L51-L67`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/graphql/public/mutations/setStageTimer.ts#L51-L67)).
Defaults: 5 minutes for Estimate, 3 for Scope
([`MeetingControlBar.tsx#L25-L33`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/MeetingControlBar.tsx#L25-L33)).
Reopening a running timer offers `Add Time`
([`StageTimerModalTimeLimit.tsx#L89`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/StageTimerModalTimeLimit.tsx#L89)).

**The history-based suggestion confirmed — and its gap in poker.** At meeting creation Parabol
gathers the team's past stage durations per phase, ignoring stages under a minute
([`createNewMeetingPhases.ts#L48-L71`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/graphql/mutations/helpers/createNewMeetingPhases.ts#L48-L71)),
splits them at one hour into sync and async, filters each set by 1.5 × IQR and suggests the most
recent survivor (meetings load newest first) — the code comment calls it how long it took last time
([`GenericMeetingStage.ts#L5-L71`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/database/types/GenericMeetingStage.ts#L5-L71),
[`foreignKeyLoaderMakers.ts#L303-L313`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/dataloader/foreignKeyLoaderMakers.ts#L303-L313));
the picker clamps it to 1–10 minutes
([`StageTimerModalTimeLimit.tsx#L42-L45`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/StageTimerModalTimeLimit.tsx#L42-L45)).
In Sprint Poker this reaches Scope only. The Estimate phase is created empty and its stages are added
as stories are scoped, with `durations: undefined`, so every estimate timer opens on the fixed
5-minute default
([`createNewMeetingPhases.ts#L154-L161`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/graphql/mutations/helpers/createNewMeetingPhases.ts#L154-L161),
[`updatePokerScope.ts#L131`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/graphql/public/mutations/updatePokerScope.ts#L131)).

**Display and expiry.** While set, a pill above the estimate area shows the humanised time left on
jade; at zero it reads `Time's Up!` on gold, and a ticking sound is timed to finish exactly at zero
for everyone viewing that stage; it does not replay when someone navigates back to an expired stage
([`StageTimerDisplay.tsx#L53`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/StageTimerDisplay.tsx#L53),
[`StageTimerDisplayGauge.tsx`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/StageTimerDisplayGauge.tsx),
[`useSoundEffect.ts`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/hooks/useSoundEffect.ts)).
Nothing in the client mutes it. At expiry the facilitator adds time or moves on
([help, 2023](https://www.parabol.co/support/how-to-set-a-meeting-timer/)).

**Not tied to the vote, and not seen by everyone.** Revealing flips `isVoting` and touches nothing
else; the timer outlives the reveal and is cleared only when the stage completes
([`pokerRevealVotes.ts#L91`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/graphql/public/mutations/pokerRevealVotes.ts#L91),
[`navigateMeeting.ts#L59-L62`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/graphql/public/mutations/navigateMeeting.ts#L59-L62)).
It is set on the facilitator's stage but rendered from each viewer's own stage, and poker
participants move between stories themselves, so anyone on another story does not see it
([`setStageTimer.ts#L40`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/server/graphql/public/mutations/setStageTimer.ts#L40),
[`StageTimerDisplay.tsx`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/StageTimerDisplay.tsx),
[`MeetingControlBar.tsx#L112-L113`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/components/MeetingControlBar.tsx#L112-L113)).
Stage times are persisted (they feed the suggestion) but the poker summary reports only completed
stories and participants
([`makePokerStats.ts`](https://github.com/ParabolInc/parabol/blob/e6145bec8071a3c4d73aaf79c4a2ec7a5fde6f84/packages/client/modules/email/components/SummaryEmail/MeetingSummaryEmail/makePokerStats.ts)).

### Jira poker apps

#### Planning Poker® (Appfire) — the timer as a hurry-up that ends the vote

**Cloud.** The game admin's voting-phase controls include a timer button with durations of 10, 60
or 120 seconds or a custom value, a `Start timer automatically` toggle that starts it for each issue,
and a sound toggle for alerts at start and end
([game flow](https://support.appfire.com/space/PP/1149501468/Game%20flow%20%28Cloud%29)). The docs
justify it as a way to hurry a voting phase that is running long
([game controls](https://appfire.atlassian.net/wiki/spaces/PP/pages/492110077/Game+controls+Cloud)).
Expiry ends the voting phase the same way the admin's early reveal does: only played cards are
revealed and the round moves to discussion; for the early reveal the page adds that estimates not
yet played are not considered
([game flow](https://support.appfire.com/space/PP/1149501468/Game%20flow%20%28Cloud%29)).

**Data Center.** Autostart begins the countdown when voting starts and ends voting at the limit
whether or not everyone has played; the default is 45 seconds; autostart skips the game's first
round so the scrum master can make sure everyone has arrived
([game configuration](https://appfire.atlassian.net/wiki/spaces/PP/pages/511967561/Game+configuration+DC)).
Finished games export to CSV with summarised estimation data
([game flow](https://support.appfire.com/space/PP/1149501468/Game%20flow%20%28Cloud%29)); whether that
includes time is **unverified**.

#### Planning Poker Agility (Agile Pulse)

Timers are set in seconds for discussion or voting and can be saved with other session settings as
the board's default; votes are revealed when the moderator finishes voting or every online
participant has estimated — not on a timer
([session flow](https://agilepulse.atlassian.net/wiki/spaces/APP/pages/328046/Session+Flow+in+Planning+Poker+Agility)).
Expiry behaviour is undocumented: **unverified**.

#### Agile Poker for Jira (Appfire, formerly Spartez)

A moderator launches a timer to limit discussion or voting; values are set in seconds in the
session configuration and remembered as a personal per-board default
([interactive session](https://appfire.atlassian.net/wiki/spaces/JPP/pages/148570576/Interactive+session));
the Data Center screen shows preset buttons (10 s, 60 s) and a restart
([interactive session, DC](https://appfire.atlassian.net/wiki/spaces/JPP/pages/148570168)). The
Marketplace listing positions it for timeboxing the review of results, i.e. the discussion after the
reveal ([listing](https://marketplace.atlassian.com/rest/2/addons/com.spartez.jira.plugins.jiraplanningpoker/versions/latest)).
Expiry behaviour is undocumented: **unverified**.

#### Magic Estimations (Magic Apps)

An optional voting timeout is enabled at game creation; the countdown starts by itself whenever a new
issue enters the voting area and, when it stops, votes are revealed automatically; it is not among
the recommended default settings
([game process](https://magicapps.atlassian.net/wiki/spaces/TD/pages/768213054)).

#### DevSamurai AgileBox poker

The vendor's former games page (archived 2025-06-25) describes a countdown, set per game, for the
time to estimate each issue: once it runs out nobody can change their card, and results show when it
ends or the game monitor clicks `FINISH`
([archived docs](http://web.archive.org/web/20250625082000/https://docs.devsamurai.com/scrum-planning-poker/games)).
That page now 404s and the current overview does not describe a timer, so current behaviour is
**unverified**. A 2022 two-star review still lists an adjustable, mutable timer among the positives
([review](https://marketplace.atlassian.com/rest/2/addons/com.devsamurai.atlassian.plugin.planning-poker/reviews?limit=50)).

#### Scrumpy (AELBOX)

The listing advertises timers for voting and for the whole refinement session and adjustable sound
volume ([Jira listing](https://marketplace.atlassian.com/apps/1219205/scrumpy-planning-poker-for-jira));
the companion Confluence app's session summary includes timings for the session and estimation time
per task ([Confluence listing](https://marketplace.atlassian.com/apps/1219638/scrumpy-planning-poker-for-confluence)).
Mechanics are **unverified**.

#### NASA standup (resolution)

Every estimation runs a fixed two-minute timer the facilitator can pause or reset; at expiry it stops
counting and does not force a reveal — the facilitator decides when to reveal
([docs](https://wiki.resolution.de/doc/standup/features/planning-poker)).

### Canvas and meeting timers

#### Miro

Starter, Business, Enterprise and Education plans only; browser and desktop only. The timer sits on
the collaboration toolbar; time is typed or stepped, with `+1m` and `+5m` while running; the starter
and other editors invited by email or through a space or team can pause, extend or stop it; it starts
and ends for everyone; it can be minimised with the time left on the toolbar icon; at the end everyone
gets a visual notice and a chime; royalty-free music is optional and can be muted; it cannot be moved
on the board ([help, updated 2026-09-15](https://help.miro.com/hc/en-us/articles/360017730933-Timer)).

#### FigJam

Any plan. Anyone with edit access can start, pause, extend and stop it, and the help page states that
controls cannot be assigned to a single facilitator; up to 99:59; one timer per file; time can be
added but not reduced; the panel can be hidden while the countdown keeps running in the toolbar; at
zero everyone sees the timer shake and show 00:00 even with the panel closed; no sound is documented;
music is shared but each person sets their own volume or mutes it
([help, updated 2026-08-03](https://help.figma.com/hc/en-us/articles/4402269549591-Stay-on-track-with-the-timer-in-FigJam)).

#### Microsoft Teams (meeting timer)

Any participant can add one from the meeting's `More` menu; it is visible to participants with
presenter capabilities; at most 100 minutes; its colour changes as it nears zero; at zero it plays a
sound and turns red, then keeps counting to show how far over time the meeting is
([support](https://support.microsoft.com/en-us/teams/meetings-events/add-a-timer-to-teams-meetings)).

### Retro and facilitation tools (brief)

- **Retrium**: facilitator-only; everyone sees the countdown; opened from the bottom nav bar; add a
  minute, reset the timebox; recommended for the Discuss phase
  ([help](https://support.retrium.com/articles/how-to-set-a-timer-to-timebox-retro-activities/)); the
  facilitator can also send participants an alert sound
  ([help](https://support.retrium.com/articles/what-does-the-retrospective-facilitator-do/)).
- **EasyRetro**: `Add` → `New timer`, minutes only; the countdown appears next to `Add`; a sound plays
  only if `Play a sound when the timer ends` was ticked before starting; clicking the countdown stops
  it; the article does not say who may do so
  ([help, 2025-09-24](https://intercom.help/easyretro/en/articles/5231180-how-to-set-a-timer-on-my-board)).
- **TeamRetro**: an independent timer per step, with defaults set before the meeting; started from a
  `TIMER` button; a chime at the end, then a red pulse; a bell icon mutes the chime
  ([help](https://help.teamretro.com/article/168-timer)); background music plays only while a timer is
  set, and each participant can turn it off locally
  ([help](https://help.teamretro.com/article/411-background-music)).
- **Easy Agile TeamRhythm**: start, pause, resume, clear and add-time buttons, a `Time's up` message —
  but not synchronised across devices, cleared by a page refresh, so the vendor asks whoever shares
  their screen to run it ([help](https://help.easyagile.com/easy-agile-teamrhythm/timer)).

---

## What users say about timers (sentiment only)

- **Timers rarely come up.** Scanning all 546 reviews of the 13 most-installed poker-focused Jira
  apps (Foxly, a prioritisation suite, excluded; keys from the
  [Marketplace search](https://marketplace.atlassian.com/rest/2/addons?text=planning%20poker&application=jira&hosting=cloud&limit=25),
  texts from `/rest/2/addons/{key}/reviews`) found two that mention a timer: a 2018 Agile Poker review
  listing timers among many options, and a 2022 DevSamurai review crediting a timer one can lengthen,
  shorten and mute
  ([example](https://marketplace.atlassian.com/rest/2/addons/com.devsamurai.atlassian.plugin.planning-poker/reviews?limit=50)).
  A search of G2 and Capterra poker listings surfaced no timer complaints
  ([G2, PlanITpoker](https://www.g2.com/products/planitpoker/reviews)). Low salience is not the same
  as low use; no tool publishes usage.
- **Sound nobody can silence.** A Miro community post lists, among other limits, that the end-of-timer
  sound cannot be switched off and that a running timer cannot be shortened (April 2024)
  ([community](https://community.miro.com/ideas/suggestions-for-improving-the-board-timer-16256));
  an older post asks for control over whether timer music plays for everyone (2021)
  ([community](https://community.miro.com/ideas/control-timer-music-for-all-participants-5243)).
- **Controls anyone can grab.** A teacher reports a view-only student starting music for the whole
  class and asks for timer and music to be limited to editors; Figma forwarded it in October 2024 and
  it was still open in January 2026
  ([forum](https://forum.figma.com/suggest-a-feature-11/figma-for-education-disable-music-controls-for-people-with-view-access-21414)).
- **Visibility.** A product owner interviewed on a competitor's site disliked that not everyone could
  see Parabol's timer (April 2025)
  ([interview](https://echometerapp.com/en/parabol-alternative-echometer-comparison-review-user/));
  Parabol's per-stage rendering above is one mechanism that produces this in poker.
- **Demand for enforcement exists too.** A Product Hunt commenter asked a new poker tool for a timer
  that auto-reveals after a set countdown ([Product Hunt](https://www.producthunt.com/products/estimate-poker)).

---

## Timeboxing: what the evidence supports

### What the technique's authors and stewards say

- **Grenning (2002), the original paper, has no timer.** It attacks slow estimation structurally:
  estimates are written privately and revealed together, agreement means no discussion, and a story
  that will not converge is deferred, split or given the low estimate. He reports stories that had
  taken 10–30 minutes mostly taking "a minute or so", while warning that important discussion might
  be skipped and that a story nobody understands deserves the time
  ([paper](https://wingman-sw.com/papers/PlanningPoker-v1.1.pdf)).
- **Cohn / Mountain Goat** suggested a two-minute sand timer that anyone in the meeting may start at
  any time; when the sand runs out the next round of cards is played, and estimates rarely need more
  than three rounds ([page as of 2025-01-17](http://web.archive.org/web/20250117174414/https://www.mountaingoatsoftware.com/tools/planning-poker)).
  The 2026 rewrite drops the sand timer: timebox discussion so one item cannot eat the session, and
  treat more than three rounds as a sign the item needs clarifying, splitting or a product-owner
  decision ([current page](https://www.mountaingoatsoftware.com/agile/planning-poker)). Note the
  shape: anyone may invoke it, and expiry triggers a re-vote, not a decision.
- **Hellesøy (2007)**: a team aiming at three minutes per story used one- and two-minute hourglasses,
  kept forgetting to turn them or to notice they had run out, and overran; he wrote a full-screen
  countdown that turns from green to red and rings, with an option to show time in ten-second steps
  to avoid distracting people and an option to restart automatically
  ([README and page](https://github.com/eduardo/planning-poker-timer)).
- **Atlassian**: when estimates differ, spend a couple of minutes on the reasons and keep it high
  level ([guide](https://www.atlassian.com/agile/project-management/estimation)).
- **Scrum Guide**: the 2017 edition says refinement usually takes no more than 10% of the Development
  Team's capacity ([2017](https://scrumguides.org/docs/scrumguide/v2017/2017-Scrum-Guide-US.pdf));
  the 2020 edition drops the figure and calls refinement ongoing, with sizing owned by the developers
  ([2020](https://scrumguides.org/scrum-guide.html)). Neither timeboxes individual items.

### Recommended durations

| Source | What is timed | Figure |
|---|---|---|
| Appfire Planning Poker (DC / Cloud) | the vote | 45 s default / 10, 60, 120 s presets |
| PlanITpoker | the story (countdown) | 30 s default, at most 5 min |
| PlanningPoker.com | the story | 1 min default, at most 10 min |
| Mountain Goat (2025 page) | discussion before the next round | 2 min |
| NASA | each estimation | 2 min, fixed |
| Kollabe blog (2026-06) | the story | about 2 min |
| Atlassian | discussing differing estimates | a couple of minutes |
| Hellesøy's team (2007) | the story, discussion included | 3 min goal |
| Scrum Poker Online | the story | 3–5 min |
| Parabol (Estimate) | the stage | 5 min default, 1–10 min |
| Kollabe blog (2026-02) | the story | hard 5 min |
| Pointing Poker | discussion | defer after 5–10 min |
| Planning Poker Online | discussion per story | 45 min default |

All figures are from the notes above and the authors' pages. None cites evidence for its number.

### Empirical evidence

**No study was found that manipulates per-item discussion time in planning poker** and measures
accuracy. The studies that exist bear on it indirectly.

- **Discussion carries accuracy.** Twenty professionals estimated a project alone, then in five groups
  of four with about an hour to agree; the groups were less optimistic and closer to the actual effort
  than the average of individual estimates, plausibly because groups found more of the work
  ([Moløkken & Jørgensen 2003](https://ppig.org/files/2003-PPIG-15th-molokken.pdf); journal version
  [2004](https://doi.org/10.1023/B:EMSE.0000039882.39206.5a)). In a real project, planning-poker
  consensus estimates were less optimistic and more accurate than mechanically combined individual
  estimates for the same tasks ([Moløkken-Østvold & Haugen 2007](https://doi.org/10.1109/ASWEC.2007.15)).
- **It does not help everywhere.** Across 101 user stories from one XP team, planning poker improved
  estimates in most cases but increased error in the extreme cases; the study's motivation is that
  dominant personalities and anchoring degrade group estimation
  ([Haugen 2006](https://doi.org/10.1109/AGILE.2006.16)).
- **Anchoring is pervasive.** Anchors shift software estimates significantly whatever technique is
  used, and estimators are overconfident in their numbers
  ([Aranda & Easterbrook 2005](https://doi.org/10.1145/1081706.1081761)).
- **Time pressure makes groups lean on where they started.** In a group decision task, members'
  initial preferences largely determined decisions, and time pressure improved or worsened quality
  depending on those preferences and the discussion
  ([Kelly & Karau 1999](https://doi.org/10.1177/0146167299259002)). It is a management simulation,
  not estimation, but the mechanism maps directly onto first-round votes.
- **Time pressure in software work generally**: across 102 studies, most high-quality ones report
  higher productivity and lower quality under time pressure, with algorithmic tasks hit hardest
  ([Kuutila et al. 2020](https://doi.org/10.1016/j.infsof.2020.106257);
  [preprint](https://arxiv.org/abs/1901.05771)). This concerns deadlines, not meeting timers.
- Mahnič & Hovelja (2012) reportedly found that the optimism group discussion adds fades as
  estimators' expertise grows ([DOI](https://doi.org/10.1016/j.jss.2012.04.005)); the publisher page
  could not be read, so this is **unverified**.

### Risks the evidence points to

1. **Cutting the part that works.** The accuracy gain is attributed to discussion surfacing missing
   work; a timer that ends talk early removes it on exactly the stories that need it (Grenning's own
   caveat).
2. **Locking in the first round.** Under time pressure groups settle on initial preferences; a
   forced reveal or forced decision at zero turns the first-round spread into the answer, and
   Appfire's early end also drops anyone who had not voted.
3. **Pressure on individuals.** Ranking voters by speed (PlanITpoker's named fastest and slowest)
   sits awkwardly with a technique whose point is that everyone, not just the most vocal or senior,
   commits a number (Grenning). This is an inference; no study of the effect was found.

---

## Patterns worth taking / patterns to refuse

Observations from the evidence above, not recommendations.

### Worth taking

- **Bind the clock to the round.** Every poker tool whose timer is part of the flow attaches it to the
  story or the vote, so nobody has to remember to start it (PlanITpoker; Planning Poker Online with
  `Time issues`; PlanningPoker.com's per-story reset; Appfire's and Magic Estimations' autostart);
  PlanITpoker and Planning Poker Online also stop it at the result. The free-floating timer appears
  only in generic canvases and meeting tools, which are not estimation tools. Hellesøy's hourglasses
  show the failure mode of a timer someone must remember to start.
- **Measure passively, display live.** PlanITpoker shows the story's elapsed time during the round and
  stores the same number; Pointing Poker times clear-to-consensus without a button. AgileKit already
  computes the stored half; what is missing is the live half and Quick Vote rounds.
- **Treat zero as information.** Most tools only signal; NASA documents that expiry does not force a
  reveal; Parabol and Planning Poker Online leave the next step to the facilitator; Teams keeps
  counting into overtime. Cohn's sand timer triggers another round, not a verdict.
- **Stay quiet until the end.** Colour changes reserved for the last stretch (PlanITpoker and
  PlanningPoker.com at ten seconds; Planning Poker Online at 75% and 90%; Teams near zero), digits
  hidden behind a tooltip (Planning Poker Online), coarse ten-second display (Hellesøy), hide or
  minimise while running (FigJam, Miro), and sound as a toggle (Kollabe, EasyRetro, Appfire,
  TeamRetro's bell).
- **One owner for a shared countdown, one-click extension.** Parabol, Retrium, PlanningPoker.com,
  Planning Poker Online, Appfire and NASA restrict control; "+1 minute" or "add time" is near-universal
  (Miro, FigJam, Retrium, Planning Poker Online, PlanningPoker.com, Parabol). The open model is where
  the complaints are (FigJam). Cohn's anyone-may-start sand timer is the counterpoint: invoking a
  timebox is a social signal anyone can send.
- **Scale defaults to what is timed, and learn them.** Seconds for votes, minutes for discussion
  (table above). Parabol's team-history suggestion is the only learned default found, and it does not
  reach Sprint Poker's estimate stages; AgileKit's per-team time-to-consensus history is the
  equivalent raw material.

### To refuse

- **Enforcement at zero**: DevSamurai's lockout, Appfire's and Magic Estimations' timer-forced
  reveal. Appfire frames its timer as hurrying people; the evidence says hurried groups entrench
  initial positions, and the early end silently drops late voters.
- **Sound for everyone with no mute**: Parabol plays its ticking to every viewer of the stage with no
  mute in the client; Planning Poker Online's alert has none in its component; Miro's users ask to
  turn the end sound off.
- **Controls nobody owns**: FigJam cannot restrict its timer; Teams lets any participant add one.
- **Unsynced timers**: Easy Agile TeamRhythm's timer differs per device and dies on refresh.
- **Timers that are not where people look**: Parabol's countdown vanishes for anyone on another
  story; the one complaint found about Parabol's timer is that not everyone saw it.
- **Defaults that make the timer meaningless**: Planning Poker Online's 45 minutes per discussion is
  roughly 5–11 times the per-story time implied by its vendor's own guidance (60–90-minute sessions
  of 10–15 stories).
- **Naming the slow**: per-person fastest and slowest voter in PlanITpoker's story list, CSV and rooms
  list turns a team measure into an individual ranking.

---

## Not verified

- Scrum Poker Online: timer direction, controls and expiry behaviour.
- Kollabe: durations, presets, who controls the poker timer, placement, plan gating.
- Planning Poker Agility and Agile Poker for Jira: what happens at expiry.
- Magic Estimations: timeout duration options.
- DevSamurai: current timer behaviour (only the archived page documents it).
- Scrumpy: timer mechanics; the summary is described only in the vendor's listing.
- NASA: whether the two-minute timer starts by itself.
- TeamRetro: who may control the timer.
- Appfire Planning Poker: whether the game CSV export includes time.
- Parabol: whether the free tier limits the timer.
- Planning Poker Online: whether every participant, not just the facilitator, hears the expiry sound.
- Mahnič & Hovelja (2012): the finding attributed to it.
- Usage: no tool publishes how often its timer is used.
