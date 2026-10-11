# Every round is timed, and the clock keeps facts the reader interprets

**Status:** accepted, 2026-10-12. Amends the glossary's **Quick Vote** (no longer untimed) and replaces the poker room's manual stopwatch; the retro's timer is unchanged.

The poker room's timer was a manual stopwatch every room got and few used: in production, 21% of poker rooms ever started it, three were left running for days, and its reading was thrown away on reset. Meanwhile the server already timed issue-backed rounds for time-to-consensus, but not Quick Vote rounds, which are most rounds (78% of poker rooms never create an issue), and nothing in the room showed it. Research on other tools (`docs/research/estimation-timer-teardown.md`) found that timers that get used are bound to the round, and the complaints are about sound, controls anyone can grab, and enforcement at zero.

So the room times itself. **Every round has a record** in `votingTimestamps`, a Quick Vote's with no issue: when it started, when its voting ended (the reveal, or the move for a round never revealed), when it was revealed, and when the room moved on (`endedBy`: the next round, another target, or the issue dropped). Voting time is start to reveal; discussion time is reveal to the end. The voting round stays the one writer of round records (ADR-0002) and opens one on every start, reset and abandon, and on the first vote of a round nothing timed yet.

**Breaks are facts, read when used.** The round clock (`convex/model/roundClock.ts`, the one writer of `roundClocks`, `roomAttendance` and `roomBreaks`) keeps three kinds of stretch: nobody had the room open (from presence's heartbeat, kept to the minute, gaps of two minutes or more), someone paused, and nobody did anything for twenty minutes (observed by the activity chokepoint, ADR-0005, before it moves the clock). Which of them count, and how a round's time splits, is decided in one pure module (`convex/roundTime.ts`) that the browser and the server share: a gap with nobody there counts as a break from ten minutes, a pause and a long quiet always. Changing a threshold re-reads the past instead of leaving it wrong. A session is the stretch since the room was last empty for thirty minutes. Nothing is stored about who was present.

**What the room shows.** The poker board's timer node shows the time on the current ticket, a voting/discussion bar under it, and a shared timebox (a pixel sand timer: 1, 2, 3 or 5 minutes, +1 minute, flip again) that never acts at zero: it turns amber and counts overtime. The timebox and the pause follow the **game flow** permission, so everyone may flip it by default, as with the sand timer Mike Cohn describes, and a room that restricts game flow restricts it too. A session time node above the session node shows the session's tickets as voting, discussion and break, off by default. Either node can be hidden for the room through **room settings** (a canvas node's `isHidden`); hiding stops nothing.

## Considered Options

- **Keep the stopwatch, polish it** (rejected). Nobody has to remember to start a clock that starts with the round, and the stopwatch's readings were never kept.
- **Close a round when the team leaves** (rejected). A session ending would have to end rounds the voting round owns, and a team returning to the same revealed round would find it closed. Absences as breaks need no such write: the round stays open and the absence comes out of its time.
- **Decide breaks when writing** (rejected). The thresholds are guesses; facts read later let them change without a migration.
- **Countdown that reveals at zero** (rejected). Groups under time pressure fall back on their first preferences; a forced reveal turns the first round's spread into the answer.
- **Per-person timing** (rejected). Time belongs to the round and the ticket, never to a voter: no fastest or slowest voter.

## Consequences

- The activity chokepoint now writes a long quiet as a break for a poker room. A write passing it twice with the room it loaded keeps one.
- `votingTimestamps.issueId` is optional; time-to-consensus still totals an issue's rounds, and readers by room skip the Quick Vote rows.
- The clock query reads no room row (the latest round names the current target), so the activity clock every vote moves re-runs none of it. It never reads the wall clock: the browser reads the facts against its own.
- Three room-keyed tables join the room ending's inventory, and the one-writer lint names their writer.
- A new poker room gets a session time node, hidden unless its creator chose it; the new-room form remembers the last choice in the browser.
