# Authentication Architecture

AgileKit uses [BetterAuth](https://www.better-auth.com/) for user identity management, supporting both anonymous guest sessions and permanent accounts (Google OAuth and Email Magic Links).

## Overview

The authentication system consists of three layers:

1. **BetterAuth Session** - Browser-persisted session (cookie-based)
2. **Global User** - Convex `users` table record linked to BetterAuth ID
3. **Room Membership** - Per-room participation via `roomMemberships` table

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Session                          │
│  BetterAuth cookie (1 year expiry, weekly refresh)              │
└─────────────────────────┬───────────────────────────────────────┘
                          │ authUserId
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      users (Global)                             │
│  _id, authUserId, name, email, avatarUrl, accountType           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ userId
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   roomMemberships                               │
│  _id, roomId, userId, isSpectator, isBot, joinedAt              │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### Backend (Convex)

| File | Purpose |
|------|---------|
| `convex/auth.ts` | BetterAuth server config with databaseHooks, anonymous, google, and magic link plugins |
| `convex/auth.config.ts` | Convex auth provider configuration |
| `convex/http.ts` | HTTP routes for auth endpoints |
| `convex/schema.ts` | Database schema with `users` and `roomMemberships` tables |
| `convex/users.ts` | User/membership API (join, leave, edit, queries, linkAccount) |
| `convex/model/users.ts` | User/membership business logic & account linking logic |
| `convex/model/auth.ts` | Auth guard helpers (`requireAuth`, `requireAuthUser`, `requireRoomMember`, `requireRoomReader`, `requireTeamRole`, `getOptionalAuthUser`) |
| `convex/email.ts` | Internal actions to send Magic Link emails via Resend |

### Frontend (Next.js)

| File | Purpose |
|------|---------|
| `src/lib/auth-client.ts` | BetterAuth client with anonymous and magic link plugins |
| `src/lib/auth-server.ts` | Server-side auth helpers (`isAuthenticated`, `fetchAuthQuery`, etc.) for use in Server Components |
| `src/app/auth/signin/page.tsx` | Dedicated Sign In Page for permanent account upgrade |
| `src/app/auth/verify/page.tsx` | Magic Link Verification Page |
| `src/app/api/auth/[...all]/route.ts` | Next.js API route handler |
| `src/components/auth/auth-provider.tsx` | React context for auth state |

## Data Model

### users (Global Identity)

```typescript
{
  _id: Id<"users">,
  authUserId: string,    // BetterAuth ID (unique)
  name: string,          // Display name (persists across rooms)
  email?: string,        // Email from OAuth or magic link
  avatarUrl?: string,    // Google profile picture URL
  accountType?: "anonymous" | "permanent",
  createdAt: number,
}
```

Indexed by: `by_auth_user` on `authUserId` and `by_email` on `email`.

### roomMemberships (Room Participation)

```typescript
{
  _id: Id<"roomMemberships">,
  roomId: Id<"rooms">,
  userId: Id<"users">,   // FK to global user
  isSpectator: boolean,
  isBot?: boolean,       // For demo room bots
  joinedAt: number,
}
```

Indexed by: `by_room`, `by_user`, `by_room_user`

## Authorization Guards

All Convex mutations must enforce authorization using helpers from `convex/model/auth.ts`. Never trust client-supplied `userId` without verifying it matches the authenticated user.

### Auth Helpers (`convex/model/auth.ts`)

| Helper | Returns | Use when... |
|--------|---------|-------------|
| `requireAuth(ctx)` | `{ subject }` (auth identity) | You only need to confirm the user is logged in |
| `requireAuthUser(ctx)` | `{ identity, user }` | You need the app-level `users` record |
| `requireRoomMember(ctx, roomId)` | `{ identity, user, membership }` | The mutation is scoped to a room (room *attendance*) |
| `requireRoomReader(ctx, roomId)` | `{ identity, user, room }` | A read-only query on room-owned data (room *access*, ADR-0009). Passes a room member or a member of the room's Team (ADR-0008); denies when the Team row is gone; never returns a membership |
| `requireTeamRole(ctx, teamId, "admin" \| "member")` | `{ identity, user, team, membership }` | Every team mutation and the members-only team reads (ADR-0008). Team role grants no room power; `claim` is decided by the room guard from the Team inputs it reads |
| `getOptionalAuthUser(ctx)` | `user \| null` | Queries that should degrade gracefully for unauthenticated users |

### Which guard to use

- **Room-scoped mutations that accept `userId`** (votes, canvas, timer): Use `requireRoomMember` + verify `user._id === args.userId`. This ensures both room membership and identity.
- **Room-scoped mutations without `userId`** (issues, room settings): Use `requireRoomMember`.
- **Global mutations acting on own data** (editGlobalUser, deleteUser): Use `requireAuth` or `requireAuthUser`.
- **Admin-style mutations** (users.remove — kick another user): Use `requireRoomMember` to verify the caller is at least in the room.
- **Read-only queries on room-owned data** (canvas nodes, issue exports, retro contents): Use `requireRoomReader`. It answers "may you read this room?", not "are you in it?", and its return type carries no membership — a reader need not be an attendee (ADR-0009). Every new query on room contents picks `requireRoomReader` or `requireRoomMember` deliberately; one that takes neither is a bug.
- **Queries**: Use `getOptionalAuthUser` for graceful degradation, or derive `currentUserId` from `ctx.auth.getUserIdentity()` server-side (see `rooms.get` for the pattern).

### Example: room-scoped mutation with userId

```typescript
import { requireRoomMember } from "./model/auth";

export const pickCard = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
    cardLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot vote as another user");
    }
    await Votes.pickCard(ctx, args);
  },
});
```

### Example: room-scoped mutation without userId

```typescript
import { requireRoomMember } from "./model/auth";

export const create = mutation({
  args: { roomId: v.id("rooms"), title: v.string() },
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    return await Issues.createIssue(ctx, args);
  },
});
```

### Example: mutation with issueId only (no roomId arg)

Look up the parent record to get the roomId, then use `requireRoomMember`:

```typescript
export const updateTitle = mutation({
  args: { issueId: v.id("issues"), title: v.string() },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");
    await requireRoomMember(ctx, issue.roomId);
    await Issues.updateIssueTitle(ctx, args);
  },
});
```

## User Creation on Sign-In (databaseHooks)

BetterAuth `databaseHooks` in `convex/auth.ts` ensure a Convex `users` record exists for every permanent account:

```
databaseHooks.user.create.after:
  - Anonymous users → skipped (Convex user created via ensureGlobalUser or joinRoom)
  - Permanent users (Google OAuth, magic link) → calls ensureGlobalUserFromAuth
    to create Convex user with name, email, avatarUrl, accountType="permanent"

databaseHooks.user.update.after:
  - Syncs avatar URL changes to existing Convex user (syncAvatarFromAuth)
```

This ensures the Convex `users` record exists immediately after sign-in, before the user joins any room.

## Server-Side Auth (Next.js)

`src/lib/auth-server.ts` exports server-side auth utilities for use in Server Components and Route Handlers:

```typescript
import { isAuthenticated } from "@/lib/auth-server";
import { redirect } from "next/navigation";

// In a server layout or page:
const authenticated = await isAuthenticated();
if (!authenticated) {
  redirect("/auth/signin?from=/dashboard");
}
```

Use this for pages that require authentication (e.g., dashboard). Client-side redirects alone are insufficient — the page still renders briefly before redirecting.

## Auth Flow

### First-Time Permanent Account (Google OAuth / Magic Link)

```
1. User visits /auth/signin (or is redirected there)
2. Signs in with Google or receives magic link email
3. BetterAuth creates auth user
4. databaseHooks.user.create.after fires:
   - Creates Convex users record (ensureGlobalUserFromAuth)
   - Sets email, avatarUrl, accountType="permanent"
5. Browser redirects to callbackURL
6. User can immediately join rooms, see their profile, etc.
```

### First-Time User Joining a Room (Guest)

```
1. User visits /room/[roomId]
2. useConvexAuth() returns isAuthenticated=false → JoinRoomDialog shown
3. User enters name and clicks "Join Room"
4. authClient.signIn.anonymous() creates session → cookie set
5. joinRoom mutation:
   - Creates global user record (users table) with accountType: "anonymous"
   - Creates room membership (roomMemberships table)
6. existingMembership query auto-updates → RoomCanvas renders
```

### Account Linking Flow (Anonymous → Permanent)

```
1. Anonymous user in /room/abc123 clicks "Create account"
2. Redirected to /auth/signin?from=/room/abc123
3. Signs in with Google or Magic Link
4. BetterAuth creates permanent user and fires onLinkAccount hook
5. Backend hook internal.users.linkAnonymousAccount executes:
   - Finds existing "anonymous" user via old authUserId
   - Transfers all roomMemberships, votes, and canvas node ownership
   - Updates accountType to "permanent", assigns email & avatarUrl
   - Safely deletes old anonymous record
6. Redirected back to /room/abc123
```

## Auth Provider Context

The auth provider uses `useConvexAuth()` for auth state and queries the internal Convex global user table to fetch metadata like `email` and `accountType`.

```typescript
interface AuthContextType {
  authUserId: string | null;    // BetterAuth ID (for mutations)
  isAnonymous: boolean;         // Whether the session is anonymous
  isLoading: boolean;           // Auth loading state (from Convex)
  isAuthenticated: boolean;     // Whether user is authenticated (from Convex)
  email: string | null;         // User email for permanent accounts
  accountType: "anonymous" | "permanent" | null;
}
```

## Environment Variables

### Next.js Environment Variables (`.env.local`)

```bash
# Required for BetterAuth
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://your-project.convex.site
NEXT_PUBLIC_SITE_URL=http://localhost:3000  # or production URL
```

### Convex Server Environment Variables

BetterAuth requires these variables to be set in the Convex environment (not `.env.local`):

```bash
# Development
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32)
npx convex env set GOOGLE_CLIENT_ID "your-google-client-id"
npx convex env set GOOGLE_CLIENT_SECRET "your-google-client-secret"
npx convex env set RESEND_API_KEY "re_..."
npx convex env set EMAIL_FROM_ADDRESS "AgileKit <noreply@agilekit.app>"

# Production
npx convex env set SITE_URL https://your-domain.com
npx convex env set BETTER_AUTH_SECRET <your-production-secret>
npx convex env set GOOGLE_CLIENT_ID "your-production-client-id"
npx convex env set GOOGLE_CLIENT_SECRET "your-production-client-secret"
npx convex env set RESEND_API_KEY "re_production_..."
npx convex env set EMAIL_FROM_ADDRESS "AgileKit <noreply@agilekit.app>"
```

| Variable | Purpose |
|----------|---------|
| `SITE_URL` | Base URL for auth callbacks |
| `BETTER_AUTH_SECRET` | Secret key for signing sessions (min 32 chars) |
| `GOOGLE_CLIENT_ID` | OAuth Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret from Google Cloud Console |
| `RESEND_API_KEY` | Resend key used for dispatching Magic Link emails |
| `EMAIL_FROM_ADDRESS` | From address for transactional emails |

## Session Configuration

- **Expiry**: 1 year (`60 * 60 * 24 * 365` seconds)
- **Refresh**: Weekly (`60 * 60 * 24 * 7` seconds)
- **Storage**: HTTP-only cookie
