# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

AgileKit is an open-source online planning poker tool for Scrum teams. The project is a modern Next.js/Convex stack with a whiteboard-style interface using React Flow.

## Git Workflow Rules

**IMPORTANT**: Always ask the user before committing or pushing changes, even if bypass permissions are enabled. Do not assume permission to commit or push based on tool access alone.

## Development Commands

```bash
# Development (run both in separate terminals)
npm run dev              # Start Next.js dev server (http://localhost:3000)
npx convex dev           # Start Convex backend

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix linting errors
npm run ts:check         # TypeScript type checking

# Testing
npm run test:e2e            # Run Playwright tests (starts servers automatically)
npm run test:e2e:ui         # Run with Playwright UI for debugging
npm run test:e2e:headless   # Run in headless mode (CI)

# Run a single test file
npx playwright test tests/room/room-creation.spec.ts

# Run tests matching a pattern
npx playwright test -g "should create a new room"
```

> Requires Node.js 20+

## Architecture

### Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Backend**: Convex (serverless TypeScript functions with real-time reactivity)
- **Auth**: BetterAuth with anonymous sessions (see [docs/authentication.md](docs/authentication.md))
- **Styling**: shadcn/ui, Tailwind CSS 4
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

**Auth guards** (`convex/model/auth.ts`): Every mutation must enforce authorization. Use `requireRoomMember(ctx, roomId)` for room-scoped mutations (returns `{ user }` for identity checks). Use `requireAuth(ctx)` for global mutations. Never trust client-supplied `userId` without verifying `user._id === args.userId`. See [docs/authentication.md](docs/authentication.md) for full patterns.

Example usage in frontend:

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const room = useQuery(api.rooms.get, { roomId });
const createRoom = useMutation(api.rooms.create);
```

### Canvas Node System

The room canvas (`src/components/room/`) uses React Flow with custom node types:

- **Node types** defined in `src/components/room/nodes/` (PlayerNode, SessionNode, TimerNode, VotingCardNode, ResultsNode, StoryNode, NoteNode)
- **Type definitions** in `src/components/room/types.ts` - defines `CustomNodeType` union
- **Node state** synced via Convex (`canvasNodes` table)
- **Layout logic** in `useCanvasLayout.ts`, state management in `useCanvasNodes.ts`

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

### Design Tokens

The project uses semantic design tokens defined in `src/app/globals.css`. These tokens ensure consistent theming across light and dark modes.

**Surface Tokens** - For layered UI elements (stacking depth: 1=base, 2=elevated, 3=highest):

- `surface-1`: Primary containers (cards, panels)
- `surface-2`: Secondary/elevated containers
- `surface-3`: Interactive elements (handles, hover states)

**Status Tokens** - For contextual feedback with `-bg` (background) and `-fg` (foreground) variants:

- `status-info-*`: Informational states (blue)
- `status-success-*`: Success states (green)
- `status-warning-*`: Warning states (amber)
- `status-error-*`: Error states (red)

**Usage in Tailwind**:

```tsx
// Surface tokens
className = "bg-white dark:bg-surface-1";
className = "hover:bg-gray-100 dark:hover:bg-surface-3";

// Status tokens
className = "bg-green-50 dark:bg-status-success-bg";
className = "text-green-700 dark:text-status-success-fg";
```

**When to use tokens vs hardcoded values**:

- Use surface tokens for container backgrounds in dark mode
- Use status tokens for semantic feedback colors
- Keep hardcoded values for gradients (tokens don't support gradient pairs)
- Keep hardcoded values for hover states that need distinct visual feedback

## Claude Code Skills

Project-specific skills in `.claude/skills/`:

- **vercel-react-best-practices**: React/Next.js performance optimization guidelines from Vercel Engineering
- **web-design-guidelines**: UI design review checklist

## Important Notes

- **shadcn/ui components**: Always use `npx shadcn@latest add [component-name]` - never create manually
- **Convex dev server** must be running alongside Next.js for full functionality
- Both servers start automatically when running Playwright tests

## Releases

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases.

- **Conventional Commits required**: All commits must use `feat:`, `fix:`, `chore:`, etc. prefixes
- **Automatic changelog**: Generated from commit messages when Release PR is merged
- **Semantic versioning**: `feat:` = minor bump, `fix:` = patch bump, `feat!:` or `BREAKING CHANGE:` = major bump

Key files:
- `.github/workflows/release-please.yml` - GitHub Actions workflow
- `release-please-config.json` - Configuration (changelog sections, release type)
- `.release-please-manifest.json` - Current version tracker

See [docs/releasing.md](docs/releasing.md) for full documentation.

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
