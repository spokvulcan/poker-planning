# Retro: specification

**Status:** built on `retro/whiteboard`, 2026-09-24. Why the retro has this shape is [ADR-0026](../adr/0026-the-retro-is-a-whiteboard-like-the-poker-room.md); its words are in [`CONTEXT.md`](../../CONTEXT.md) (Ceremonies and Retro). This file replaces the team retro's build spec, retired with the ADRs it assembled. Section numbers that older code comments cite (§4.5, §10, §15.2, §16.4, §18, §20, §23) point into that file: `git show c01eb61:docs/spec/retro.md`.

## 1. Where it lives

| Part | Files |
|---|---|
| Rules shared with the browser (pure) | `convex/retroTemplates.ts` (steps, colours, templates, caps), `convex/retroRules.ts` (stacks, vote totals, discussion order, GIF allowlist), `convex/retroLayout.ts` (where nodes and new stickies land) |
| Backend | `convex/retro.ts` (arguments and guards), `convex/model/retro.ts` (logic and the face-down projection) |
| Board | `src/components/retro/`: `retro-canvas.tsx`, `build-retro-nodes.ts`, `nodes/`, `use-retro-mutations.ts`, `gif-picker.tsx`, `retro-settings-panel.tsx`, `retro-summary.ts` |
| Routes | `/retro/new` (create), `/room/[roomId]` (both ceremonies, one join gate), `/dashboard/retros` (list), `/api/gifs` (GIPHY proxy) |

## 2. Data

A retro is a `rooms` row with `roomType: "retro"`, `ownerId` (the creator), `retained`, optional `permissions` in the retro shape, and `retro`:

| Field | |
|---|---|
| `step` | `write`, `vote`, `discuss` or `done` |
| `columns` | `{ id, title, emoji, color }[]`: ids `c1`, `c2`, …; at most 6; colour one of yellow, green, pink, blue, purple, orange |
| `votesPerPerson` | 1 to 10, default 3 |
| `showAuthors` | default `false` |
| `focusStickyId?` | the spotlight: a topic's top sticky |
| `nextRoomId?` | the retro that "Start the next retro" opened |

Three tables, all room-owned: the room cascade empties them and the daily orphan sweep skips them.

- `retroStickies`: `clientId` (minted in the browser, at most 64 characters; the node key and the create dedupe key), `columnId`, `text` (trimmed, at most 500, empty only when there is a GIF), `gif?` (`url`, `width`, `height`, `title?`), `authorId` (always), `position`, `height?` (how tall the author's browser draws it face-up, whole pixels from 124 to 20,000; in no read, used only by the reveal), `stackId?` (the stack's top), `createdAt`.
- `retroStickyVotes`: `stickyId` (the topic's top when the vote was cast), `voterId`.
- `retroActionItems`: `text` (at most 300), `done`, `ownerId?`, `carriedOver?`, `createdAt`.

The fixed nodes are `canvasNodes` rows, positioned and saved like poker's: `retro`, `timer`, one `pad-<columnId>` per column (`data: { columnId }`) and `actions`. Stickies are not canvas nodes. Caps: 400 stickies and 100 action items per retro, 200 stickies per move, 40-character column titles; a GIF's size is clamped to 2000 px a side and its title to 140 characters.

## 3. Creating and joining

`/retro/new` takes an optional name (left empty, it becomes "Retro, Sep 24") and one of five templates, copied into the retro:

| Template | Columns |
|---|---|
| Went well, To improve, Ideas (default) | Went well, To improve, Ideas |
| Start, Stop, Continue | Start, Stop, Continue |
| Mad, Sad, Glad | Glad, Sad, Mad |
| Liked, Learned, Lacked, Longed for | Liked, Learned, Lacked, Longed for |
| Sailboat | Wind, Anchors, Rocks ahead, Island |

A line under the form says whether the retro will be kept: "Kept on your account until you delete it." for a permanent account, otherwise that guest retros are removed after 5 quiet days, with a link to sign in. "Start Retro" signs a visitor in as a guest when they have no session (with a generated name), calls `retro.create`, copies the retro's link and opens it. The room starts at `write`, retained when the creator's account is permanent, with the retro node on top, the timer to its left, the pads in a row beneath and the action items at the end of the row. The creator joins through the room page's join gate like anyone else (automatically, since they have a name) and is owner because `ownerId` is theirs. A retro has no spectators: the join dialog hides the toggle and `joinRoom` stores `isSpectator: false`.

## 4. Steps

| | `write` | `vote` | `discuss` | `done` |
|---|---|---|---|---|
| Other people's stickies | face-down | face-up | face-up | face-up |
| Votes | refused | cast and taken back | refused | refused |
| Totals per topic | hidden | hidden | shown | shown |
| Topics | | | ranked, one in the spotlight | ranked, all marked discussed |
| Retro node button | "Reveal N stickies" | "Start discussion" | "Next topic", then "Finish retro" | "Start the next retro" or "Go to the next retro" |

In every step stickies are written and moved, authors edit or delete their own, and action items change. `setStep` (`stageFlow`) goes to any step, forward or back, and nothing advances by itself. Entering `discuss` from `write` or `vote` puts the first topic in the spotlight; entering `write` or `vote` clears it. Leaving `write` is the reveal, and the only step change that moves stickies ([ADR-0027](../adr/0027-a-face-down-sticky-shows-no-size-and-the-reveal-makes-room-for-it.md)): going down the board, a topic that sat clear of a face-down topic above it, and would now be under it face-up, moves down to clear it by as much as it did (at most 16 px), taking the topics below along; one that overlapped a face-down topic already moves only with it. Heights come from `height`, or the face-down size when nobody measured one (`settleOnReveal` in `convex/retroLayout.ts`). The retro node's step bar jumps between Write, Vote and Discuss; `done` is reached with "Finish retro".

## 5. Stickies

- **Writing.** Clicking a pad (or Enter on it) opens a draft below the lowest sticky in that column's lane, counting a face-down sticky at the face-down size, all the writer's browser knows of it; double-clicking the empty board opens one at that spot, in the column whose pad is nearest across. Enter sticks it, Shift+Enter starts a new line, Escape cancels, and clicking away sticks it (an empty draft is dropped). A sticky needs words, a GIF or both. A create retried with the same `clientId` returns the same sticky.
- **Changing.** The author edits the words or GIF (double-click, or the pencil) and deletes (the bin, or Delete or Backspace on a selection) in any step. A holder of `cardManagement` may do the same to someone else's sticky once it is revealed; in `write` the server refuses with `stage`. Anyone in the retro moves any sticky; a drop writes one `moveStickies` batch and nothing is written mid-drag.
- **Face-down.** `retro.board` returns each sticky as `_id`, `clientId`, `columnId`, `position`, `stackId?`, `createdAt`, `mine` and `hidden`. A face-up sticky adds `text`, `gif?` and, only while `showAuthors` is on and the step is not `write`, `authorName` ("Former member" for a deleted account). In `write`, another person's sticky is `hidden` and carries none of those, and the board draws it 124 px tall whatever it holds (`FACE_DOWN_HEIGHT`). The step is read from the room, so no role sees more. The author's browser records how tall it draws each of its own stickies face-up with `retro.measureStickies`, skipping one being edited or open as a stack; the server keeps a height only for the caller's own stickies, writes only one that changed, and never returns it. The board also returns `writers` (how many people have written) and `myVotes`. Until `discuss` it reads only the viewer's own votes, so a vote re-sends the voter's board and nobody else's; `retro.votesCast` counts everyone's, and the board subscribes to it only in `vote`.
- **Stacks.** Dragging one sticky until its centre is over another marks the target "Drop to stack", and the drop calls `stackSticky`; a drag of several stickies never stacks. The sticky joins the target's stack, and a stack's top brings its whole stack. In `write` the server refuses with `stage` unless both stickies are the actor's. A stack shows its top with the others peeking out and a count that opens it; "Take off the stack" (after `write`) puts a sticky back beside the stack. Deleting a top makes its oldest member the top, in the same place, with the stack's votes and the spotlight.

## 6. Votes and the discussion

- **Votes.** `toggleVote` works only in `vote` (otherwise `stage`), at most once per person per topic (a vote on any sticky of a stack is the stack's), and within `votesPerPerson` per person (otherwise `budget`, which the board never sends). Voting again takes the vote back. Lowering the budget keeps votes already cast. Totals are summed per topic when read, so stacking regroups them. Nobody is shown who voted for what: the board sends each viewer their own votes and, from `discuss` on, the totals, and `retro.votesCast` sends the count cast.
- **Order.** `discussionOrder`: the topics with a vote, most first, ties by column order and then creation; with no votes at all, every topic, column by column. Server and browser compute it from the same rows; it is never stored.
- **Spotlight.** `stepDiscussion` moves it to the next or previous topic (`discuss` only; it stops at either end). `focusTopic` ("Discuss this now") puts any face-up topic in it from `vote` on, and from `vote` also moves the retro to `discuss`. Both are `stageFlow`. Every viewer's canvas pans to the spotlight, the other stickies dim, and each ranked topic shows its place (#1, #2, …), ticked once passed.

## 7. Action items and the next retro

- An action item is a text, an optional owner who must be in the retro, and done or not. Adding, editing, ticking, assigning and deleting all need `actionManagement` (`everyone` by default); an owner has no extra right over their own item. The action items node lists carried-over items first ("From last retro"), then this retro's, with the open count.
- `startNext` (`stageFlow`, offered in `done`) returns the next retro if one was already opened. Otherwise it opens one owned by the person pressing it (so its retention follows their account), named by `nextRetroName` ("Sprint 42 retro" becomes "Sprint 43 retro"; a name without a number gains " 2"), with the same columns, `votesPerPerson` and `showAuthors`, default permissions, and a copy of every open action item (`carriedOver: true`, same owner and creator). It sets `nextRoomId`, so everyone at the finished retro sees "Go to the next retro"; people join the next one by following it.

## 8. GIFs

- The sticky editor's picker searches GIPHY through `/api/gifs`: a Next.js route holding `GIPHY_API_KEY`, open to signed-in sessions only (guests included), trending until you type, 24 results a page, rated pg-13, with "Powered by GIPHY" shown. Without the key the route answers `{ configured: false }` and the picker offers only "Paste a link".
- **GIPHY's rate limit.** A beta key allows 100 calls an hour; Next caches a 200 answer for an hour (a search) or 10 minutes (trending), and never caches a refusal. When GIPHY refuses with 429 the route answers 429 with `rateLimited: true`, and the picker says the hourly limit is used up and opens "Paste a link". After answering, the route counts every search in `gifSearchUsage` (one row per hour: `requests`, cached answers included, and `rateLimited`) through `gifUsage.record`; `npx convex run gifUsage:recent` lists the latest hours. With analytics consent the picker also sends Google Analytics `gif_search` (a typed search), `gif_pick` (`source`: search or link) and `gif_search_limited`, never the search terms.
- The server stores a GIF only if `normalizeGifUrl` accepts it: https, from a GIPHY (`media*.giphy.com`, `i.giphy.com`), Tenor (`media*.tenor.com`, `c.tenor.com`) or Imgur (`i.imgur.com`, image files only) media host. A `giphy.com/gifs/…` page link is rewritten to its media file; a Tenor page link is refused. Every viewer's browser loads the image from that host.

## 9. Permissions and guards

| Category | Default | Covers |
|---|---|---|
| `stageFlow` | facilitators | steps, the spotlight, next and previous topic, "Start the next retro" |
| `cardManagement` | facilitators | editing or deleting someone else's sticky, after `write` |
| `actionManagement` | everyone | every action-item write |
| `retroSettings` | facilitators | name, columns, votes per person, show authors |

The relationship verbs are the poker room's (`promote`, `demote`, `remove`, `transfer`, `changePerms`) plus `delete`, owner-only. No category gates writing a sticky, moving or stacking stickies, changing or deleting your own, or voting within the budget; the steps' rules still apply. Every mutation requires membership (`requireRoomMember`, or `requireCan` built on it); `retro.board` and `retro.actionItems` take `requireRoomReader`, which admits members only. `rooms.get` stays unguarded and carries `rooms.retro`, which holds no sticky content.

## 10. Retention, accounts and deletion

- `retained` is set whenever a permanent account comes to own a retro: by `createRetro` for a permanent creator, by account linking for every retro the linked account owns, and by `Rooms.setRoomOwner` when a transfer or an account deletion's hand-off gives the retro to a permanent account; nothing clears it. The daily sweep (03:00 UTC, up to 100 rooms a run) deletes rooms with `retained: false` and a `lastActivityAt` more than five days old. The settings panel says which kind a retro is; the dashboard marks guest retros.
- Linking a guest to a permanent account re-points the guest's stickies, retro votes and the action items they own. In a retro where the permanent account already voted, the guest's votes are dropped instead.
- `users.deleteUser` (a guest's sign-out, or Delete account for a permanent account) first hands each retro the user owns to the member who joined it first, as owner, or deletes it when nobody else joined; a permanent heir keeps it, as on a transfer. The user then leaves every room. Their stickies, retro votes and action items stay: names show as "Former member" and the votes still count.
- Delete retro (owner only) schedules the room cascade: stickies, votes, action items, canvas nodes, memberships, then the room.

## 11. Summary, dashboard, writes

- **Summary.** "Copy summary" (share menu, settings panel, and the retro node in `done`) and "Download Markdown" (share menu) build Markdown in the browser (`buildRetroSummary`): name, date and sticky count; the action items as a checklist with owners; from `discuss` on, the topics in order with their votes and stacked stickies; then each column's stickies. Face-down stickies are left out and author names never appear.
- **Dashboard.** `/dashboard/retros` (`retro.listMine`) shows the retros the person has joined, newest first (their newest 200 memberships, at most 50 retros): name, step ("Writing", "Voting", "Discussing", "Done"), up to four column chips, open and done action items, last activity, and "Guest" when not retained. It is empty for a visitor with no user row.
- **Writes.** Every sticky, vote, step, spotlight, node-position and action-item write is a Convex optimistic update (`use-retro-mutations.ts`), rolled back by Convex if the server refuses; creating, starting the next retro, settings, columns, permissions and deletion wait for the server. `measureStickies` shows nothing, so it has no optimistic update and a failure is only logged. The model layer refuses with `ConvexError({ code, message })`, `code` one of `forbidden`, `budget`, `missing`, `stage`, and the board shows the message as a toast (a generic line for any other error). Nothing is retried. Every retro mutation calls `updateRoomActivity`, which patches a retro room's `lastActivityAt` only when it is more than an hour old.

## 12. Legacy data

The team retro this replaces never shipped in a release. The two deployments that ran it were cleared with a one-off migration (every team-retro room deleted through the room cascade, its tables emptied, and the `teamId`, `joinPolicy` and `emailOptOut` fields stripped), after which the migration and those fields were removed. The emptied tables are no longer in the schema.

## 13. What copy may say

Wording may be polished; no claim may go beyond what the code does.

- **May say:** a retro on the same whiteboard canvas as planning poker; free and open source; join by link, no account needed; everyone writes at once and stickies stay face-down until the facilitator reveals them; five templates, with columns renamed, added or removed on the board; GIFs from GIPHY search or a pasted GIPHY, Tenor or Imgur link; stack stickies by dropping one on another; a few votes each, one per topic, with totals hidden until the discussion; the most-voted topics are discussed first; action items with an owner, and open ones carried into the next retro; teammates see what was written and not by whom, unless the retro shows authors; nobody is shown who voted for what; a Markdown summary; a retro started by a signed-in account is kept, and a guest's is deleted after 5 days without activity.
- **May not say:** that stickies are anonymous, or that nobody, the facilitator included, can find out who wrote one (the author is stored and show authors names it); anything about Teams, team history, invites, join policies or a team page; retro emails, reminders or notifications; any export beyond the Markdown summary, or a read-only share page; formats, stages, clusters, coverage or raise; any AI; that retros improve delivery or outcomes; that any retro number measures the team.
- **Words:** "Retro" in the product, "retrospective" in titles, metadata and long-form copy, "ceremony" only in these docs; a "sticky", never a card; a "step", never a stage.

## 14. Tests

- **convex-test:** `convex/retroLayout.test.ts` (where a pad's sticky lands and where the reveal moves stickies), `convex/retro.test.ts` (creation and nodes, the face-down projection and show authors, sticky heights and the reveal, sticky validation and the GIF allowlist, stacks, votes, the discussion and the spotlight, permissions at the defaults, action items, the next retro, columns, the listing, deletion, account linking, transfer), `convex/retroRules.test.ts`, `convex/retention.test.ts`, `convex/accountDeletion.test.ts`, `convex/roomActivity.test.ts`, `convex/requireRoomReader.test.ts`.
- **Node:** `src/components/retro/build-retro-nodes.test.ts`, `src/components/retro/retro-summary.test.ts`.
- **Playwright:** `tests/retro/retro-board.spec.ts`, two cross-browser facts: stickies face-down until the reveal, votes hidden until the discussion, the spotlight and action items shared; and the next retro carrying open action items over.
- **Manual:** [`tests/retro/MANUAL.md`](../../tests/retro/MANUAL.md): touch, drag-to-stack and GIF flows.
