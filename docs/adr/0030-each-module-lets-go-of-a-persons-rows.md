# Each module lets go of what it keeps about a person

**Status:** accepted, 2026-09-26.

An account ends in one of two ways: it is deleted (a guest's sign-out included), or a guest signs in and is folded into a permanent account. Both used to be long functions in `convex/model/users.ts` that wrote every table naming a user: memberships, votes, canvas nodes, retro stickies and votes, action items, analytics, presence and room ownership. Each new table was one more thing they had to know about, and they didn't always: an account's Jira connection outlived it, tokens and all. Every table's rule for merging lived there too, far from the table, and a sign-in could leave an owner without the owner role.

So every module that keeps rows naming a person implements one small interface (`UserRows` in `convex/model/userRows.ts`): the fields it owns, `forget` for a deleted account and `fold` for a guest signing in. `convex/model/accountLifecycle.ts` runs them in a fixed order and owns only the `users` row. A test walks the schema for every field that holds a user id, nested ones included, and fails unless exactly one module claims it; the presence component, which names people outside the schema, is claimed the same way.

## Considered Options

- **Keep the two functions, with a checklist in a comment** (rejected). Both bugs above happened with the functions in plain sight, and nothing fails when a table is missing from a checklist.
- **Delete the rows by reference, in the database** (rejected). Convex has no cascading deletes, and a fold is not a delete: every module has its own rule for what the account keeps when both it and the guest have a row, such as the more senior role or one vote per topic.

## Consequences

- A module that starts storing a user id fails the completeness test until it says how to forget and fold it.
- The order is part of the design: rooms are handed off while the person's memberships still say who else is in them, and memberships go before the voting round, so a guest's vote lands on the account's seat. A deleted account leaves each room the way a person does, so a round it was the last one yet to vote in finishes without it ([ADR-0004](0004-roster-exit-reconciles-the-auto-reveal-countdown.md)).
- Only the memberships module walks a person's rooms. What follows a seat hears about it room by room: a deleted account leaves each room, and the canvas drops the player node there; on a sign-in, the memberships tell ownership and the canvas about each seat that becomes the account's, and the canvas hands the guest's player node over, or drops it where the account has one. Other modules find the rest of a person's rows by their own indexes, never through another module's table, so they can run anywhere in the order. The canvas used to find timers through the person's memberships, because a timer saved who last ran it; that missed rooms the person had already left, so the timer stopped saving it, and the node's own last-updated-by field records who last touched it.
- What a person wrote in a retro stays after they go, named "Former member", because the retro's `forget` keeps it on purpose. A module's `forget` decides what "letting go" means for its rows.
