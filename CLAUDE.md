# CLAUDE.md

## Repository Overview

AgileKit is an open-source online planning poker tool for Scrum teams. The project is a modern Next.js/Convex stack with a whiteboard-style interface using React Flow.

## Architecture

### Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: Convex (serverless TypeScript functions with real-time reactivity)
- **Auth**: BetterAuth with anonymous sessions (see [docs/authentication.md](docs/authentication.md)). In the browser a page asks the viewer (`useAuth().viewer`) who is looking, reads as them through `useCallerQuery`, and takes what they are offered of their account (places, Sign in, the way back) from `src/components/auth/account.ts`
- **Styling**: read [docs/design-tokens.md](docs/design-tokens.md) before styling UI. shadcn/ui, Tailwind CSS 4, semantic colour tokens
- **UI Primitives**: Base UI (`@base-ui/react`). A component takes another element through its `render` prop (e.g., `<DropdownMenuItem render={<Link href="..." />}>`); the lint (`eslint.config.mjs`) fails Radix imports, `asChild` and `--radix-*` variables.
- **Canvas**: @xyflow/react for the whiteboard interface

### Route Groups

`src/app/layout.tsx` is the shared root: fonts, theme, toaster, analytics consent and the frame check. Every page sits in a route group under it, and the group's layout supplies the backend:

- `src/app/(app)/`: every page but the demo. Its layout fetches the session's token on the server and mounts BetterAuth and `AuthProvider`. New pages go here.
- `src/app/(demo)/`: `/demo` only. A Convex client with no auth that never connects, so the Demo simulation costs the backend nothing (ADR-0003; `src/app/shells.test.tsx` holds it to that).

### Convex Backend Pattern

The backend uses a two-layer architecture:

```
convex/
├── rooms.ts           # API layer - thin handlers with validation
├── model/
│   └── rooms.ts       # Domain logic - business rules and data access
```

**API layer** (`convex/*.ts`): Defines mutations/queries with argument validation and auth guards, delegates to model layer.

**Model layer** (`convex/model/*.ts`): Contains business logic, database operations, and helper functions.

**Auth guards** (`convex/model/auth.ts`): every mutation is guarded, and its handler takes the caller and the rows its guard loaded: a room write starts with `requireRoomWrite`, and every other way in takes what [docs/authentication.md](docs/authentication.md) names for it. The caller comes from the session, through `convex/model/caller.ts` alone; a query on room contents takes `requireRoomReader`, any other public query degrades with `getCaller`, and a guard refuses through `refusal()` (ADR-0031). `convex/requireRoomWrite.test.ts`, `convex/caller.test.ts` and the lint (`eslint.config.mjs`) enforce this.

**Ceremony rules** (`convex/ceremony.ts`): whatever differs between planning poker and a retro (spectators, voting rounds, player nodes, retention, activity precision, the hand-off) is read from `rulesOf(room)`. Never compare `roomType` directly.

**One writer per concern**: `model/users.ts` makes `users` rows (`findOrMakeUser`, which the global ways in such as creating a room take instead of `requireUser`) and is the only place one turns permanent, `model/memberships.ts` writes `roomMemberships`, `model/ownership.ts` writes a room's owner, owner role and retention, `model/canvas.ts` writes `canvasNodes`, `model/votingRound.ts` writes poker votes. Deleting an account and a guest signing in go through `model/accountLifecycle.ts`: a module that stores a user id implements `UserRows` (`model/userRows.ts`), or `convex/accountLifecycle.test.ts` fails (ADR-0030); it also deletes a deleted account's BetterAuth sign-in, the app's only write to BetterAuth's tables (ADR-0033). `eslint.config.mjs` lists who may write each of these concerns, and the lint fails any other writer.

**Room ending**: a room is deleted only through `model/roomEnding.ts`: `endRoom` (deleting a retro, the hand-off, the admin wipe) and `endStaleRooms` (the daily sweep), in bounded steps it schedules itself. It deletes the room's rows itself; only issues (with their links), integration mappings (through the webhook reconcile) and presence let go of their own. A table that gains a `roomId` joins its inventory, or `convex/roomEnding.test.ts` fails.

### Canvas Node System

Both ceremonies are drawn on one whiteboard (`src/components/whiteboard/whiteboard.tsx`). It owns React Flow's node buffer, saving drops (one `canvas.moveNodes` write per drop, with an optimistic update), keyboard nudges, Delete, dropping one node onto another, and the view: its first fit and refits, following a node, and the fit, zoom, centring and bringing into view that the chrome and the boards ask for through `useWhiteboardView`, all under one rule for padding, zoom limits and duration, measured against the board's own pane. Nothing else moves React Flow's viewport. Each ceremony is an adapter that derives its nodes from the server and says what the gestures mean:

- **Planning poker**: `src/components/room/room-canvas.tsx`. Node types in `src/components/room/nodes/` (PlayerNode, SessionNode, RoundTimerNode, SessionTimeNode, VotingCardNode, ResultsNode, NoteNode), built in `hooks/buildCanvasNodes.ts`; nodes take their writes from one frozen `PokerBoardActions` object, as the retro's do. The `CustomNodeType` union is in `src/components/room/types.ts`
- **Retro**: `src/components/retro/retro-canvas.tsx`. Nodes built in `build-retro-nodes.ts`; writes in `use-retro-mutations.ts` are optimistic updates that apply the server's own pure rules (`convex/retroTopics.ts`, `convex/retroSteps.ts`, `convex/retroStickyView.ts`), most of them through `board-view.ts`; `use-sticky-draft.ts` holds a sticky being written until its add lands. Its timer, the manual stopwatch (`nodes/timer-node.tsx`), is the one node writing through a hook of its own, `use-timer-actions.ts`
- **Chrome**: `src/components/room/board-chrome.tsx`, around both boards and the demo. A board hands it what it shows of the board (name, link, noun), its panels, its share entries and what goes in the account's place (the account menu, or the demo's call to action); the chrome owns which panel is open (`hooks/usePanelState.ts`: one at a time, Escape closes), draws every control from one list in the phone's menu sheet and the desktop's bars, and docks the open panel, mounting its content only while it is open. A node opens a panel through the handle the chrome gives its board (`ref`, as the session node's issue button does)
- **Node state** synced via Convex (`canvasNodes` table), written only by `convex/model/canvas.ts`
- **Text over shared data** (notes, names, stickies) goes through `useLiveText` (`src/hooks/use-live-text.ts`), which never overwrites what someone is typing
- **Tests at the boards' seams** use the whiteboard's test stand-ins (`src/components/whiteboard/testing/`), in place of `@xyflow/react` and `convex/react`: React Flow drawing the nodes and driving the gestures (`drop`, `dropOnto`, `pressDelete`, `doubleClickPane`), and Convex's local cache keyed by function and arguments, which applies optimistic updates, rolls back a refused write and records writes, refusals and reads. Prove what the board then shows, not only the write. The jsdom project's setup file (`vitest.jsdom-setup.ts`) gives every component test `matchMedia` and `ResizeObserver`

### E2E Testing Pattern

Playwright specs act through the page objects in `tests/pages/` (guide: [tests/README.md](tests/README.md)).

## Important Notes

- **shadcn/ui components**: Always use `npx shadcn@latest add [component-name]` - never create manually
- **Local servers**: run `npx convex dev` alongside `npm run dev`; Playwright (`npm run test:e2e`) starts both itself. Every checkout, worktrees included, shares one Convex dev deployment, and `npx convex dev` pushes this checkout's `convex/` to it

## Releases

Commit and PR titles follow Conventional Commits (`feat:`, `fix:`, `chore:`, …): release-please builds versions and the changelog from them, and CI checks them. Releases and deploys: [docs/releasing.md](docs/releasing.md).

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map to their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
