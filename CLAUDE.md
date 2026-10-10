# CLAUDE.md

## Repository Overview

AgileKit is an open-source online planning poker tool for Scrum teams. The project is a modern Next.js/Convex stack with a whiteboard-style interface using React Flow.

## Architecture

### Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: Convex (serverless TypeScript functions with real-time reactivity)
- **Auth**: BetterAuth with anonymous sessions (see [docs/authentication.md](docs/authentication.md))
- **Styling**: shadcn/ui, Tailwind CSS 4, semantic colour tokens (read [docs/design-tokens.md](docs/design-tokens.md) before styling UI)
- **UI Primitives**: Base UI (`@base-ui/react`) - NOT Radix UI. Components like Dialog, DropdownMenu, etc. use Base UI primitives. Base UI does not support `asChild` pattern; use `render` prop instead (e.g., `<DropdownMenuItem render={<Link href="..." />}>`).
- **Canvas**: @xyflow/react for the whiteboard interface

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

**Auth guards** (`convex/model/auth.ts`): Every mutation must enforce authorization. Use `requireCan(ctx, roomId, spec)` for permission-checked operations (`requireCanForUser` where the user is already resolved, e.g. action contexts), `requireActingUser(ctx, roomId, userId)` for room-scoped mutations that take a client-supplied `userId` (verifies authenticated + member + acting as that user), and `requireAuth(ctx)` for global mutations. Never re-implement these checks inline in handlers. See [docs/authentication.md](docs/authentication.md) for full patterns.

**Ceremony rules** (`convex/ceremony.ts`): whatever differs between planning poker and a retro (spectators, voting rounds, player nodes, retention, activity precision, the hand-off) is read from `rulesOf(room)`. Never compare `roomType` directly.

**One writer per concern**: `model/memberships.ts` writes `roomMemberships`, `model/ownership.ts` writes a room's owner, owner role and retention, `model/canvas.ts` writes `canvasNodes`, `model/votingRound.ts` writes poker votes. Deleting an account and a guest signing in go through `model/accountLifecycle.ts`: a module that stores a user id implements `UserRows` (`model/userRows.ts`), or `convex/accountLifecycle.test.ts` fails (ADR-0030).

Example usage in frontend:

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const room = useQuery(api.rooms.get, { roomId });
const createRoom = useMutation(api.rooms.create);
```

### Canvas Node System

Both ceremonies are drawn on one whiteboard (`src/components/whiteboard/whiteboard.tsx`). It owns React Flow's node buffer, saving drops (one `canvas.moveNodes` write per drop, with an optimistic update), keyboard nudges, Delete, dropping one node onto another, fitting and following a node. Each ceremony is an adapter that derives its nodes from the server and says what the gestures mean:

- **Planning poker**: `src/components/room/room-canvas.tsx`. Node types in `src/components/room/nodes/` (PlayerNode, SessionNode, TimerNode, VotingCardNode, ResultsNode, NoteNode), derived in `hooks/buildCanvasNodes.ts` and `hooks/useCanvasNodes.ts`; the `CustomNodeType` union is in `src/components/room/types.ts`
- **Retro**: `src/components/retro/retro-canvas.tsx`. Nodes built in `build-retro-nodes.ts`; writes in `use-retro-mutations.ts` are optimistic updates that apply the same pure rules as the server (`convex/retroTopics.ts`, `convex/retroSteps.ts`)
- **Node state** synced via Convex (`canvasNodes` table), written only by `convex/model/canvas.ts`
- **Text over shared data** (notes, names, stickies) goes through `useLiveText` (`src/hooks/use-live-text.ts`), which never overwrites what someone is typing

### Database Schema

Schema defined in `convex/schema.ts`. Key tables:

- `rooms` - Room configuration and state
- `users` - Global user identity (linked to BetterAuth via `authUserId`)
- `roomMemberships` - User participation in rooms (spectator status, join time)
- `votes` - User votes (sanitized based on reveal state)
- `issues` - Issue tracking with vote statistics
- `canvasNodes` - Persisted node positions and data

See [docs/authentication.md](docs/authentication.md) for details on the user/membership data model.

### E2E Testing Pattern

Tests use Page Object Model pattern:

```
tests/
├── pages/              # Page objects (HomePage, RoomPage, JoinRoomPage)
├── utils/              # Helper functions (room-helpers.ts, test-helpers.ts)
├── fixtures/           # Test fixtures
└── *.spec.ts           # Test files
```

## Important Notes

- **shadcn/ui components**: Always use `npx shadcn@latest add [component-name]` - never create manually
- **Local servers**: run `npx convex dev` alongside `npm run dev`; Playwright (`npm run test:e2e`) starts both itself

## Releases

Commit and PR titles follow Conventional Commits (`feat:`, `fix:`, `chore:`, …): release-please builds versions and the changelog from them, and CI checks them. Convex deploys from CI once `main` passes. See [docs/releasing.md](docs/releasing.md).

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
