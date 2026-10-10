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
| `convex/model/users.ts` | Identity: user rows, names, avatars; joining and leaving a room |
| `convex/model/memberships.ts` | Room attendance: the one writer of `roomMemberships` |
| `convex/model/ownership.ts` | Who owns a room: creation, transfer, a returning owner, the hand-off |
| `convex/model/accountLifecycle.ts` | Deleting an account and linking a guest to an account, through every module's `UserRows` |
| `convex/model/auth.ts` | Auth guard helpers (`requireAuth`, `requireAuthAs`, `requireAuthUser`, `getOptionalAuthUser`, `requireRoomMember`, `requireRoomReader`, `requireActingUser`, `requireCan`, `requireCanForUser`) |
| `convex/email.ts` | Internal action that sends the Magic Link email via Resend (the only email AgileKit sends) |

### Frontend (Next.js)

| File | Purpose |
|------|---------|
| `src/lib/auth-client.ts` | BetterAuth client with anonymous and magic link plugins |
| `src/lib/auth-server.ts` | Server-side auth helpers (`isAuthenticated`, `fetchAuthQuery`, etc.) for use in Server Components |
| `src/app/auth/signin/page.tsx` | Dedicated Sign In Page for permanent account upgrade |
| `src/app/auth/verify/page.tsx` | Magic Link Verification Page |
| `src/app/api/auth/[...all]/route.ts` | Next.js API route handler |
| `src/components/auth/auth-provider.tsx` | React context for auth state, and `whenAuth` for waiting on it |
| `src/hooks/useEnsureSession.ts` | The session every guest way in goes through (see [Guest flow](#first-time-user-joining-a-room-guest)) |
| `src/lib/auth-waiters.ts` | Promises on the changing auth state, held by the auth provider |

## Data Model

### users (Global Identity)

```typescript
{
  _id: Id<"users">,
  authUserId: string,    // BetterAuth ID (unique)
  name: string,          // Display name (persists across rooms)
  email?: string,        // Email from OAuth or magic link
  avatarUrl?: string,    // Google profile picture URL
  accountType?: "anonymous" | "permanent", // left unset for a guest; "permanent" for an account
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

Every Convex mutation enforces authorization with a guard from `convex/model/auth.ts`. Handlers call the guard and never re-implement its checks inline. Never trust a client-supplied `userId` or `authUserId` without a guard that verifies it names the caller.

### Auth Helpers (`convex/model/auth.ts`)

| Helper | Returns | Use when... |
|--------|---------|-------------|
| `requireAuth(ctx)` | auth identity (`subject` = authUserId) | You only need the caller signed in. Works in actions too: it only reads `ctx.auth` |
| `requireAuthAs(ctx, authUserId)` | auth identity | The mutation still takes the caller's own `authUserId` (older browsers send it). Throws unless the caller is signed in as that id |
| `requireAuthUser(ctx)` | `{ identity, user }` | You need the caller's `users` row |
| `getOptionalAuthUser(ctx)` | `user \| null` | Queries that should degrade gracefully for unauthenticated users |
| `requireRoomMember(ctx, roomId)` | `{ identity, user, membership, room }` | **Room attendance**: the caller is in the room. For a write open to anyone in it. Returns the room it checked, so the handler never reads it again |
| `requireRoomReader(ctx, roomId)` | `{ identity, user }` | **Room access** (ADR-0009): a read-only query on room-owned data. Passes a room member and nobody else (there are no Teams since ADR-0026), reading only the caller and their membership; returns neither the room nor a membership |
| `requireActingUser(ctx, roomId, userId, message?)` | `{ identity, user, membership, room }` | **Acting-user guard**: the mutation takes a client-supplied `userId`. Authenticated, a room member, and the caller *is* `userId`; `message` is what it throws on the mismatch |
| `requireCan(ctx, roomId, spec, targetUserId?)` | `{ identity, user, membership, room, target? }` | **Permission guard**: the mutation is gated by a permission category or a relationship verb. Throws the resolved decision's message on denial |
| `requireCanForUser(ctx, user, roomId, spec, targetUserId?)` | `{ user, membership, room, target? }` | The same permission guard for a caller that resolved the user outside `ctx.auth`, such as an action (the Jira integration) calling in through an internal query |

`spec` names what the caller asks to do: `{ kind: "category", category }` (`issueManagement`, `gameFlow`, `stageFlow`, `retroSettings`, ...) or `{ kind: "relationship", verb }`, where `verb` is `remove`, `promote`, `demote`, `transfer`, `changePerms` or `delete`. `remove`, `promote` and `demote` need `targetUserId`: the guard loads the target's membership so the permission decision can weigh the target's role. A category from the other ceremony throws (ADR-0013). Identity rules (self-transfer, the authoritative `ownerId`) are not the guard's; they stay in the handler, after it.

`requireCan` and `requireCanForUser` share one IO assembly, so both reach the same decision and throw the same messages. `resolveRoomAction` is that assembly returning the decision instead of throwing, for a caller whose denial depends on the target (someone else's retro sticky).

### Which guard to use

- **Room-scoped mutations that take a `userId`** (votes, canvas, timer, presence, `users.edit`, `users.leave`): `requireActingUser`. It is the one place the authenticated + member + acting-as-`userId` check lives; never rebuild it from `requireRoomMember` and a `user._id` comparison.
- **Room-scoped mutations gated by a permission** (issues, game flow, room settings, roles, retro steps and settings, action items, `users.remove`): `requireCan` with the category or relationship verb. An action context that already resolved the user uses `requireCanForUser`.
- **Room-scoped mutations open to everyone in the room** (writing and moving retro stickies): `requireRoomMember`.
- **Mutations that take the caller's own `authUserId`** (`users.join`, `users.ensureGlobalUser`): `requireAuthAs`.
- **Global mutations acting on own data** (`editGlobalUser`, `deleteUser`): `requireAuth` or `requireAuthUser`.
- **Read-only queries on room-owned data** (canvas nodes, issue exports, the Jira mapping and issue links, the retro board and its action items): Use `requireRoomReader`. It answers "may you read this room?" rather than "are you in it?"; today both admit exactly the room's members, but the reader guard's return type carries no membership, so a read never leans on attendance (ADR-0009). Nor does it carry the room: a guard's reads join the read set of every query that takes it, so a query that needs the room reads it itself (the retro board), and a room patch, such as the activity clock every poker vote moves, re-runs only those. Every new query on room contents picks `requireRoomReader` or `requireRoomMember` deliberately; one that takes neither is a bug.
- **Queries**: Use `getOptionalAuthUser` for graceful degradation, or derive `currentUserId` from `ctx.auth.getUserIdentity()` server-side (see `rooms.get` for the pattern).

### Example: room-scoped mutation with userId (acting-user guard)

```typescript
import { requireActingUser } from "./model/auth";

export const pickCard = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
    cardLabel: v.string(),
  },
  handler: async (ctx, args) => {
    await requireActingUser(ctx, args.roomId, args.userId, "Cannot vote as another user");
    await VotingRound.castVote(ctx, args);
  },
});
```

### Example: permission-gated mutation (permission guard)

```typescript
import { requireCan } from "./model/auth";

export const create = mutation({
  args: { roomId: v.id("rooms"), title: v.string() },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "issueManagement" });
    const admission = await Issues.admitIssue(ctx, args);
    return admission.issueId;
  },
});
```

### Example: acting on another member (relationship verb with a target)

`users.remove` takes someone out of the room. The guard loads the target's membership and decides on both roles:

```typescript
export const remove = mutation({
  args: { userId: v.id("users"), roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "relationship", verb: "remove" }, args.userId);
    await Users.leaveRoom(ctx, args.userId, args.roomId);
  },
});
```

### Example: mutation with issueId only (no roomId arg)

Look up the parent record to get the roomId, then guard on it:

```typescript
export const updateTitle = mutation({
  args: { issueId: v.id("issues"), title: v.string() },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get("issues", args.issueId);
    if (!issue) throw new Error("Issue not found");
    await requireCan(ctx, issue.roomId, { kind: "category", category: "issueManagement" });
    await Issues.updateIssueTitle(ctx, args);
  },
});
```

## User Creation on Sign-In (databaseHooks)

BetterAuth `databaseHooks` in `convex/auth.ts` ensure a Convex `users` record exists for every permanent account:

```
databaseHooks.user.create.after:
  - Anonymous users → skipped (a guest's row comes from users.join or users.ensureGlobalUser;
    see the guest flow below)
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
2. The auth provider's isAuthenticated (Convex's, from useConvexAuth) is false → JoinRoomDialog shown
3. User enters a name and clicks Join
4. JoinRoomDialog calls ensureSession({ createUser: false }) (useEnsureSession):
   a. Waits until BetterAuth's session and Convex's auth state have both loaded (isSessionPending and isLoading false)
   b. No session → authClient.signIn.anonymous() creates the guest's session (cookie set)
   c. Waits until Convex has the session's token (isAuthenticated true)
   d. Writes no users row: the join writes it with the typed name
   Either wait taking longer than 10 s fails with "Failed to create session. Please try again."
5. users.join mutation (requireAuthAs: the caller must be signed in as the authUserId it sends):
   - Makes the guest's users row with the typed name (findOrCreateGlobalUser), accountType left unset
   - Creates the room membership (model/memberships.ts)
6. getMyMembership query updates → RoomCanvas (or RetroCanvas for a retro) renders
```

Every guest way in goes through `useEnsureSession` (`src/hooks/useEnsureSession.ts`): joining a room from its link (above), "Continue as guest" on the sign-in page, and creating a poker room or a retro. It works in this order:

- **It waits until BetterAuth's session and Convex's auth state have both loaded** before deciding whether there is a session. With the server-rendered token (`initialToken` in `src/app/layout.tsx`) Convex can load while BetterAuth's session is still on its way, and signing in anonymously over a live session is a BetterAuth 400 for a guest and a new guest for a permanent account.
- **It waits until Convex has the token** after signing in. A fresh session reaches BetterAuth before Convex, and the server takes no write from a caller it can't identify: `users.join` and `users.ensureGlobalUser` both take `requireAuthAs`.
- **Only then does it write the users row.** Every caller but the join passes the default `createUser: true`, and the hook calls `users.ensureGlobalUser` with a generated guest name. That makes a row only when the caller has none; an existing row keeps its name. It runs on every call, not only for a fresh session, so a guest whose first row write (or join) failed still gets a row, which creating a room needs.
- **The waits are the auth provider's** (`whenAuth`, see [Auth Provider Context](#auth-provider-context)), not the calling component's, so they finish even when the page unmounts the caller meanwhile. The room page swaps out the join dialog while Convex takes the new session.

A guest's users row has no `accountType`: `model/users.ts` can't tell from a mutation whether the session is anonymous, so the BetterAuth session's `isAnonymous` is what the frontend goes by. An account link, or a permanent account's first sign-in, sets `"permanent"`.

### Account Link (Guest → Permanent Account)

```
1. A guest in /room/abc123 clicks "Create account"
2. Redirected to /auth/signin?from=/room/abc123
3. Signs in with Google or Magic Link
4. BetterAuth creates permanent user and fires onLinkAccount hook
5. Backend hook internal.users.linkAnonymousAccount executes
   (model/accountLifecycle.ts `linkAccount`):
   - Finds the guest's users row by the old authUserId (none: nothing to carry)
   - With no permanent account yet, the guest's own row becomes permanent and
     keeps everything; otherwise every module folds the guest's rows into the
     account (its `UserRows.fold`) and the guest row is deleted:
   - Rooms the guest owned go to the account, owner role included
   - Memberships, votes and canvas nodes move across; where both accounts are
     in a room, one membership stays with the more senior role, and the
     account holds the owner role in every room it owns and is in
   - Retro stickies and action items move across; where both voted in a retro,
     the account keeps one vote per topic up to the vote budget, its own first,
     and the guest's other votes are refunded
   - Every retro the account now owns is retained (kept past the 5-day sweep)
   - The guest's integration connections move across; where the account already
     has its own connection to a provider, it keeps that one and the guest's is
     disconnected (room mappings removed, webhooks deregistered)
   - Updates accountType to "permanent", assigns email & avatarUrl
6. Redirected back to /room/abc123
```

## Auth Provider Context

The auth provider (`src/components/auth/auth-provider.tsx`) takes auth state from Convex (`useConvexAuth()`, which waits for token validation) and `authUserId` and `isAnonymous` from the BetterAuth session. It queries `users.getGlobalUser` for `email` and `accountType` once Convex has the session (never on `/demo`, ADR-0003).

```typescript
interface AuthContextType {
  authUserId: string | null;    // BetterAuth ID (sent to join/ensureGlobalUser, which check it names the caller)
  isAnonymous: boolean;         // Whether the session is anonymous (from BetterAuth)
  isLoading: boolean;           // Auth loading state (from Convex: waits for token validation)
  isAuthenticated: boolean;     // Whether Convex has validated the token
  email: string | null;         // User email for permanent accounts; never a guest's
  accountType: "anonymous" | "permanent" | null;
  whenAuth: WhenAuth;           // Waits for the auth state to reach a condition
}

interface AuthSnapshot {
  authUserId: string | null;    // From BetterAuth's session: null means no session only once it has loaded
  isSessionPending: boolean;    // Whether BetterAuth's session is still loading
  isLoading: boolean;           // From Convex, as in AuthContextType
  isAuthenticated: boolean;     // From Convex, as in AuthContextType
}

type WhenAuth = (ready: (state: AuthSnapshot) => boolean, timeoutMs: number) => Promise<AuthSnapshot>;
```

`accountType` is the users row's, falling back to `"permanent"` when the session isn't anonymous. A guest's row leaves it unset, so for a guest it is `null`; tell a guest by `isAnonymous`.

`whenAuth(ready, timeoutMs)` resolves with the first auth state `ready` accepts (at once if the current one does, else on the update that makes it hold) and rejects after `timeoutMs`. The provider holds the waiters (`createAuthWaiters` in `src/lib/auth-waiters.ts`) and feeds them every change of `authUserId`, `isSessionPending`, `isLoading` and `isAuthenticated`. It sits at the root, so a wait outlives the component that started it. Outside an `AuthProvider`, `whenAuth` rejects.

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
| `RESEND_API_KEY` | Resend key for the magic-link email, the only email AgileKit sends (`convex/email.ts`) |
| `EMAIL_FROM_ADDRESS` | From address for the magic-link email (defaults to `AgileKit <noreply@agilekit.app>`) |

## Session Configuration

- **Expiry**: 1 year (`60 * 60 * 24 * 365` seconds)
- **Refresh**: Weekly (`60 * 60 * 24 * 7` seconds)
- **Storage**: HTTP-only cookie
