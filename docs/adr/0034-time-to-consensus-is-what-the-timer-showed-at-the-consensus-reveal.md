# Time-to-consensus is what the timer showed at the reveal that reached consensus

**Status:** accepted, 2026-10-17. Amends [ADR-0032](0032-every-round-is-timed-and-the-clock-keeps-facts.md), whose consequences kept time-to-consensus as the total of an issue's voting.

ADR-0032 has one pure reading (`convex/roundTime.ts`), shared by the browser and the server, decide how a round's time splits and which breaks it leaves out. The poker board's timer and session time read it; time-to-consensus did not. The reveal stored each round's voting as wall-clock time (`durationMs`, its voting's end minus its start) and totalled an issue's rounds, so an issue started on a Friday evening and revealed on Monday morning stored the weekend while the room's timer showed minutes, and a lunch called as a pause mid-vote added the lunch. The total also left out the discussion between re-votes, though the product promises to "measure how long your team takes to reach agreement on each story".

So **an issue's time-to-consensus is what the timer showed at the reveal that reached consensus**: the time its rounds took up to that reveal, voting and the discussion between rounds alike, less the breaks the round clock leaves out. One pure function of an issue's rounds, the breaks and the moment gives that time. The timer reads it with the breaks still running (a pause nobody lifted, a quiet past twenty minutes); the round clock answers it at the reveal from the facts, which by then hold those breaks too, so the two agree by construction. The round record stops storing `durationMs`.

**It is settled at that reveal and kept on the issue**, a deliberate exception to ADR-0032's facts read later: the analytics snapshot ([ADR-0007](0007-analytics-read-from-a-write-time-snapshot.md)), the dashboard and the CSV export read a stored number, and none of them loads a room's rounds and breaks. A threshold changed later re-reads what the room's clock shows, but not issues already settled.

## Considered Options

- **Keep the wall-clock total** (rejected). The room's timer and the dashboard would keep disagreeing about the same rounds.
- **Voting time only, breaks left out** (rejected). The smaller change, but it stops short of what the product promises, and the dashboard would still not show what the room showed.
- **Re-read it from the facts on every analytics read** (rejected). A threshold changed later would re-read the past, but the dashboard's one read would load every room's rounds and breaks, and the write-time snapshot would have to carry facts instead of numbers.
- **Recompute the issues already settled** (rejected). Those settled before the round clock began keeping breaks (11 October 2026) have neither breaks nor reveal times to re-read, so a room's history mixes the two meanings whatever is done. The new meaning starts with the release that ships it.

## Consequences

- An issue discussed between re-votes takes longer than it used to, and one interrupted by a break takes less; for a while the dashboard's trend compares the two meanings.
- `votingTimestamps.durationMs` goes in two releases: the first stops writing it and clears it with a migration, the second removes it from the schema.
- A convex-test proves the promise end to end: an issue's time-to-consensus equals the timer's reading of the round clock at the reveal that settled it.
