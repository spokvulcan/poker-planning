# A vote follows its topic

**Status:** accepted, 2026-09-26. Amends [ADR-0026](0026-the-retro-is-a-whiteboard-like-the-poker-room.md): how votes and the spotlight behave when topics change.

A retro vote is cast on a **topic** and stored under the sticky that was its top at the time. Until now it stayed on that sticky whatever happened to the board afterwards. Stacking a topic someone had voted for onto another topic they had voted for left them with two votes counting once, and one of their budget gone for nothing. Taking a sticky off a stack took along any vote stored under it, so a vote cast for the whole stack could leave with one of its stickies. And the server, the board's optimistic updates and the totals each had their own idea of which vote belonged to which topic.

So a vote belongs to its topic, not to a sticky. It is filed under the topic's top and moves whenever the topic does: when two topics are stacked, when a stack's top is deleted and its oldest member takes its place, and in a guest's sign-in. A person left with two votes on one topic keeps one and gets the other back. A topic taken off the board gives its votes back. Taking a sticky off a stack starts a topic of its own with no votes: the votes stay with the stack they were cast for. The spotlight follows its topic by the same rule, and goes off when its topic leaves the board.

The rule is one pure module (`convex/retroTopics.ts`) that each act describes itself to, as where each topic it touched ends up. The server's writes and the board's optimistic updates both apply it, so a vote dot never lands in one place and then jumps.

## Considered Options

- **Leave votes on the sticky they were cast on** (rejected). It is what caused the lost budget and the leaving votes, and it meant the one-vote-per-topic rule held only at the moment of voting.
- **Refuse stacking a topic that has votes** (rejected). Grouping what people wrote is the point of the board, and stacking during `vote` or `discuss` is how a team notices two stickies say the same thing.
- **Let a vote count twice after a merge** (rejected). One vote per person per topic is what makes the totals read as how many people want to talk about it.
- **Send an unstacked sticky's votes with it** (rejected). Nobody can tell whether a vote on a stack was meant for the one sticky that is leaving, and a vote leaving with a sticky moves the ranking under everyone's eyes during the discussion.

## Consequences

- Nobody holds two votes on one topic, so totals are a count of people per topic, and a vote given back is back in the budget at once.
- A person who voted for a sticky that is later stacked and taken off again finds their vote on the stack, not on the sticky.
- When a guest signs in to an account that also voted in the retro, the account keeps one vote per topic up to the vote budget, its own first, and the rest go back.
