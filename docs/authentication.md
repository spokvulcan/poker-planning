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
| `convex/model/users.ts` | Identity: user rows, names, avatars; makes the caller's row on their first room write (`findOrMakeUser`) and is the only place a row turns permanent; joining and leaving a room |
| `convex/model/memberships.ts` | Room attendance: the one writer of `roomMemberships` |
| `convex/model/ownership.ts` | Who owns a room: creation, transfer, a returning owner, the hand-off |
| `convex/model/accountLifecycle.ts` | Deleting an account and linking a guest to an account, through every module's `UserRows` |
| `convex/model/caller.ts` | Who is calling: the one place the signed-in identity is read and the caller's `users` row looked up (`getCaller`, `requireCaller`, `requireUser`) |
| `convex/model/auth.ts` | Auth guard helpers (`requireRoomMember`, `requireRoomReader`, `requireRoomWrite`, `requireActingUser`, `requireCan`, `requireCanForUser`) |
| `convex/email.ts` | Internal action that sends the Magic Link email via Resend (the only email AgileKit sends) |

### Frontend (Next.js)

| File | Purpose |
|------|---------|
| `src/lib/auth-client.ts` | BetterAuth client with anonymous and magic link plugins |
| `src/lib/auth-server.ts` | Server-side auth helpers (`isAuthenticated`, `fetchAuthQuery`, etc.) for use in Server Components |
| `src/app/(app)/layout.tsx` | The app shell, for every page but `/demo`: fetches the session's token on the server and mounts BetterAuth and the auth provider (`src/components/providers.tsx`) |
| `src/app/(app)/auth/signin/page.tsx` | Dedicated Sign In Page for permanent account upgrade |
| `src/app/(app)/auth/verify/page.tsx` | Magic Link Verification Page |
| `src/app/api/auth/[...all]/route.ts` | Next.js API route handler |
| `src/components/auth/auth-provider.tsx` | React context for auth state and the viewer (who is looking, from their users row), and `whenAuth` for waiting on it |
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
  accountType?: "anonymous" | "permanent", // as the session's token says; unset on a guest's row made before the server made rows
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

### Who is calling (`convex/model/caller.ts`)

One module answers who is calling. It is the only code that reads the signed-in identity (`ctx.auth`) or looks a `users` row up by `authUserId` (`convex/caller.test.ts` fails otherwise). Every guard below resolves the caller through it, and so does every query, mutation or action that needs the caller. It only reads: the users model makes the row (see [The caller's users row](#the-callers-users-row-convexmodelusersts)).

| Function | Returns | Use when... |
|----------|---------|-------------|
| `getCaller(ctx)` | `{ identity, user } \| null` | Queries that should degrade gracefully: `null` when nobody is signed in, and `user` is `null` while the caller has no `users` row (a new guest before their first room) |
| `requireCaller(ctx)` | `{ identity, user }` | The caller must be signed in, with or without a `users` row. Throws "Not authenticated" |
| `requireUser(ctx)` | `{ identity, user }` | You need the caller's `users` row. Throws "Not authenticated", or "User not found" while they have none |
| `sessionAccountType(caller)` | `"anonymous" \| "permanent" \| undefined` | You need the kind of account the caller has (making their row does): their session's token says so in BetterAuth's `isAnonymous` claim, whatever kind their `users` row has; `undefined` for a token without the claim |
| `isGuest(caller)` | `boolean` | You need to know whether the caller is a guest (signing out does): `sessionAccountType` is `"anonymous"` |
| `findUser(ctx, authUserId)` | `user \| null` | Code that is told who the person is rather than asking: BetterAuth's hooks |

`identity.subject` is the BetterAuth user id, the row's `authUserId`. The first three work in any function context: an action has no database of its own, so it reads the row through one internal query (`users.userByAuthId`).

The token carries every field of BetterAuth's user but its id and image (the Convex plugin's JWT payload), so `isAnonymous`, `email` and `name` reach `identity` as claims; the `sessionId` claim beside them is what `@convex-dev/better-auth`'s own `getAuthUser` reads.

### The caller's users row (`convex/model/users.ts`)

The server makes a signed-in caller's `users` row, never the browser. The global ways in (`rooms.create`, `retro.create`, `users.join`, `users.editGlobalUser`, and `users.ensureGlobalUser`, which only older browsers call) take `findOrMakeUser(ctx, name?)`: it returns the caller's row, making it when they have none, so a person's first room write makes their row whatever the browser did first. A new row is of the kind the session's token says: a permanent account's has the token's email and the name its provider gave (fitted to the person-name rule, or the email's local part when there is none); a guest's is `"anonymous"`, with a guest name such as "Guest 4829". `name` is one the person typed (joining a room, renaming themselves): the row is made with it, or takes it. A token without the `isAnonymous` claim makes a row of no kind, as rows were made before.

The users model is also the only place a row turns permanent (`convex/usersRow.test.ts` fails otherwise): on an account link, from the auth hook, and on a room write by a permanent account whose row isn't permanent yet (a deleted account that came back with a guest's row before the server made rows). Each time, every retro the account owns is retained (ADR-0029). Queries and actions can't write, so they only look the caller up, and a signed-in caller has no row until their first room write.

### Auth Helpers (`convex/model/auth.ts`)

| Helper | Returns | Use when... |
|--------|---------|-------------|
| `requireRoomMember(ctx, roomId)` | `{ identity, user, membership, room }` | **Room attendance**: the caller is in the room. The room-scoped step checks it, and a write open to anyone in the room takes the step with no `spec`. Returns the room it checked, so the handler never reads it again |
| `requireRoomReader(ctx, roomId)` | `{ identity, user }` | **Room access** (ADR-0009): a read-only query on room-owned data. Passes a room member and nobody else (there are no Teams since ADR-0026), reading only the caller and their membership; returns neither the room nor a membership |
| `requireRoomWrite(ctx, address, spec?, targetUserId?)` | `{ user, membership, room, target? }` and the addressed entity | **The room-scoped step** a room write starts with. `address` is the room, or the one issue, sticky or action item the write acts on (`{ issue: issueId }`, handed back as `issue`), whose own room the write lands in. The caller must be in that room (attendance); a `spec` adds the permission guard, as in `requireCan`. The caller is whoever is signed in: no `userId` a client sends is compared |
| `requireActingUser(ctx, roomId, userId, message?)` | `{ identity, user, membership, room }` | **Acting-user guard**: the mutation acts as a client-supplied `userId` (presence, the one left). Authenticated, a room member, and the caller *is* `userId`; `message` is what it throws on the mismatch |
| `requireCan(ctx, roomId, spec, targetUserId?)` | `{ identity, user, membership, room, target? }` | **Permission guard** on its own: the decision for a permission category or a relationship verb. Throws the resolved decision's message on denial. A room write gets the same guard from the step's `spec` |
| `requireCanForUser(ctx, user, roomId, spec, targetUserId?)` | `{ user, membership, room, target? }` | The same permission guard for a caller that resolved the user outside `ctx.auth`, such as an action (the Jira integration) calling in through an internal query |

`spec` names what the caller asks to do: `{ kind: "category", category }` (`issueManagement`, `gameFlow`, `stageFlow`, `retroSettings`, ...) or `{ kind: "relationship", verb }`, where `verb` is `remove`, `promote`, `demote`, `transfer`, `changePerms` or `delete`. `remove`, `promote` and `demote` need `targetUserId`: the guard loads the target's membership so the permission decision can weigh the target's role. A category from the other ceremony throws (ADR-0013). Identity rules (self-transfer, the authoritative `ownerId`) are not the guard's; they stay with the write, after it (`Roles.transferOwnership`).

`requireCan` and `requireCanForUser` share one IO assembly, so both reach the same decision and throw the same messages. `resolveRoomAction` is that assembly returning the decision instead of throwing, for a caller whose denial depends on the target (someone else's retro sticky).

A guard's refusal is a coded refusal (`refusal()` in `convex/model/refusal.ts`), a `ConvexError` whose message the browser shows as written, because production redacts a plain Error's message (ADR-0031): a denied decision is `forbidden` with the resolved decision's message, a caller outside the room is `forbidden`, and a category from the other ceremony, or an issue, sticky or action item a write is addressed by that is gone, is `missing`. Not being signed in, a missing room or target, and the acting-user mismatch still throw plain Errors: they are caller errors, not refusals.

### Which guard to use

- **Room writes on the room-scoped step** (every room write but joining a room and presence: the canvas, the timer, votes, the round's transitions, issues, roles and permissions, room settings and the Jira mapping, `users.edit`, `users.leave` and `users.remove`, and the retro's): `requireRoomWrite`, with the permission spec where the write is gated by one, and none where everyone in the room may write (the canvas, the timer, a vote, a member's own edit or leave, writing and moving retro stickies). The handler takes the room, the caller and the entity it acts on from the step and never works them out itself, and hands the model the rows it loaded; the `userId` these writes still accept from old browsers is ignored.
- **Room-scoped mutations that take a `userId`** (presence): `requireActingUser`. It is the one place the authenticated + member + acting-as-`userId` check lives; never rebuild it from `requireRoomMember` and a `user._id` comparison.
- **Actions gated by a permission** (the Jira import): `requireCanForUser`, through an internal query, for a caller that resolved the user outside `ctx.auth`. A room write names its permission to the step instead, which runs the same guard.
- **Global ways in, which make the caller's row** (`rooms.create`, `retro.create`, `users.join`, `users.editGlobalUser`, `users.ensureGlobalUser`): `findOrMakeUser` from the users model, not a guard. `users.join` and `users.ensureGlobalUser` still accept the `authUserId` older browsers send, and ignore it.
- **Global mutations acting on own data** (`deleteUser`): `requireCaller` or `requireUser`. `signOut` takes `getCaller` instead: with nobody signed in it has nothing to delete, and must not keep the browser from clearing its session.
- **Read-only queries on room-owned data** (canvas nodes, issue exports, the Jira mapping and issue links, the retro board and its action items): Use `requireRoomReader`. It answers "may you read this room?" rather than "are you in it?"; today both admit exactly the room's members, but the reader guard's return type carries no membership, so a read never leans on attendance (ADR-0009). Nor does it carry the room: a guard's reads join the read set of every query that takes it, so a query that needs the room reads it itself (the retro board), and a room patch, such as the activity clock every poker vote moves, re-runs only those. Every new query on room contents picks `requireRoomReader` or `requireRoomMember` deliberately; one that takes neither is a bug.
- **Queries**: Use `getCaller` for graceful degradation. It derives the caller server-side, never from a client-supplied id (see `rooms.get` for the pattern).

### Example: a room write on the room-scoped step

```typescript
import { requireRoomWrite } from "./model/auth";

export const moveNodes = mutation({
  args: {
    roomId: v.id("rooms"),
    moves: v.array(v.object({ nodeId: v.string(), position: positionValidator })),
    userId: v.optional(v.id("users")), // Ignored: the caller's own id, which old browsers still send
  },
  handler: async (ctx, args) => {
    const { room, user } = await requireRoomWrite(ctx, args.roomId);
    await Canvas.moveNodes(ctx, room, args.moves, user._id);
  },
});
```

A write addressed by the entity it acts on names that instead of a room, and gets it back loaded, with the room it is in: `const { issue, room } = await requireRoomWrite(ctx, { issue: args.issueId }, { kind: "category", category: "issueManagement" })`. One that is gone is refused as `missing`, and one from a room the caller isn't in is refused like any write to that room.

### Example: presence, which takes a userId (acting-user guard)

```typescript
import { requireActingUser } from "./model/auth";

export const heartbeat = mutation({
  args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    await requireActingUser(ctx, roomId as Id<"rooms">, userId as Id<"users">, "Cannot heartbeat as another user");
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});
```

### Example: a permission-gated write

```typescript
import { requireRoomWrite } from "./model/auth";

export const create = mutation({
  args: { roomId: v.id("rooms"), title: v.string() },
  handler: async (ctx, args) => {
    await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "issueManagement" });
    const admission = await Issues.admitIssue(ctx, args);
    return admission.issueId;
  },
});
```

### Example: acting on another member (relationship verb with a target)

`users.remove` takes someone out of the room. The step loads the target's membership, the guard decides on both roles, and the handler takes the target from the step:

```typescript
export const remove = mutation({
  args: { userId: v.id("users"), roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room, target } = await requireRoomWrite(ctx, args.roomId, { kind: "relationship", verb: "remove" }, args.userId);
    await Memberships.leave(ctx, room, target!);
  },
});
```

### Example: a write addressed by an issue (no roomId arg)

The step loads the issue and lands the write in its room:

```typescript
export const updateTitle = mutation({
  args: { issueId: v.id("issues"), title: v.string() },
  handler: async (ctx, args) => {
    const { room, issue } = await requireRoomWrite(ctx, { issue: args.issueId }, { kind: "category", category: "issueManagement" });
    await Issues.updateIssueTitle(ctx, room, issue, args.title);
  },
});
```

## User Creation on Sign-In (databaseHooks)

BetterAuth `databaseHooks` in `convex/auth.ts` make a Convex `users` record for every new permanent account:

```
databaseHooks.user.create.after:
  - Anonymous users → skipped (a guest's row is made on their first room write;
    see The caller's users row)
  - Permanent users (Google OAuth, magic link) → calls ensureGlobalUserFromAuth
    to create Convex user with name, email, avatarUrl, accountType="permanent"

databaseHooks.user.update.after:
  - Syncs avatar URL changes to existing Convex user (syncAvatarFromAuth)
```

This makes a new account's `users` record exist right after its first sign-in, before it joins any room. The hook runs only when BetterAuth creates its user: an account deleted with Delete account keeps its BetterAuth user, so when it signs back in, its row is made again on its first room write, permanent from its token.

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
2. The auth provider's viewer is a visitor (Convex's useConvexAuth says nobody is signed in) → JoinRoomDialog shown
3. User enters a name and clicks Join
4. JoinRoomDialog calls ensureSession() (useEnsureSession):
   a. Waits until BetterAuth's session and Convex's auth state have both loaded (isSessionPending and isLoading false)
   b. No session → authClient.signIn.anonymous() creates the guest's session (cookie set)
   c. Waits until Convex has the session's token (isAuthenticated true)
   Either wait taking longer than 10 s fails with "Failed to create session. Please try again."
5. users.join mutation (findOrMakeUser, for whoever the token says is calling):
   - Makes the guest's users row with the typed name, accountType "anonymous" from the token
   - Creates the room membership (model/memberships.ts)
6. getMyMembership query updates → RoomCanvas (or RetroCanvas for a retro) renders
```

Every guest way in goes through `useEnsureSession` (`src/hooks/useEnsureSession.ts`): joining a room from its link (above), "Continue as guest" on the sign-in page, and creating a poker room or a retro. It works in this order:

- **It waits until BetterAuth's session and Convex's auth state have both loaded** before deciding whether there is a session. With the server-rendered token (`initialToken` in `src/app/(app)/layout.tsx`) Convex can load while BetterAuth's session is still on its way, and signing in anonymously over a live session is a BetterAuth 400 for a guest and a new guest for a permanent account.
- **It waits until Convex has the token** after signing in. A fresh session reaches BetterAuth before Convex, and the room write that follows needs a caller the server can identify.
- **It writes nothing.** The room write that follows (creating a room, joining one) makes the caller's users row when they have none ([The caller's users row](#the-callers-users-row-convexmodelusersts)). "Continue as guest" makes no row: a guest who only continues has none until their first room write.
- **The waits are the auth provider's** (`whenAuth`, see [Auth Provider Context](#auth-provider-context)), not the calling component's, so they finish even when the page unmounts the caller meanwhile. The room page swaps out the join dialog while Convex takes the new session.

A users row's `accountType` is what the session's token said when the row was made: `"anonymous"` for a guest, `"permanent"` for an account. A guest's row made before the server made rows has none. The frontend takes the kind from the row only, and only a row that says `"permanent"` is a permanent account's ([Auth Provider Context](#auth-provider-context)). An account link turns a guest's row permanent.

### Account Link (Guest → Permanent Account)

```
1. A guest in /room/abc123 clicks "Create account"
2. Redirected to /auth/signin?from=/room/abc123
3. Signs in with Google or Magic Link
4. BetterAuth creates permanent user and fires onLinkAccount hook
5. Backend hook internal.users.linkAnonymousAccount executes
   (model/users.ts `linkAnonymousToPermanent`, folding through
   model/accountLifecycle.ts `linkAccount`):
   - Finds the guest's users row by the old authUserId (none: nothing to carry)
   - With no permanent account yet, the guest's own row becomes the account's
     and keeps everything; otherwise every module folds the guest's rows into
     the account (its `UserRows.fold`) and the guest row is deleted:
   - Rooms the guest owned go to the account, owner role included
   - Memberships, votes and canvas nodes move across; where both accounts are
     in a room, one membership stays with the more senior role, and the
     account holds the owner role in every room it owns and is in
   - Retro stickies and action items move across; where both voted in a retro,
     the account keeps one vote per topic up to the vote budget, its own first,
     and the guest's other votes are refunded
   - The guest's integration connections move across; where the account already
     has its own connection to a provider, it keeps that one and the guest's is
     disconnected (room mappings removed, webhooks deregistered)
   - The users model turns the account's row permanent, assigning email &
     avatarUrl, and every retro the account now owns is retained (kept past
     the 5-day sweep)
6. Redirected back to /room/abc123
```

### Signing Out

```
1. The person clicks Sign out in a user menu (useSignOut, the one sign-out)
2. users.signOut runs while the session still says who they are
   (model/accountLifecycle.ts `signOut`):
   - A guest's account is deleted the way Delete account deletes one: each
     room it owns is handed off (ADR-0029), and every module lets go of what
     it keeps about them (ADR-0030)
   - A permanent account is kept for when the person signs back in
   - With nobody signed in (Convex has no token, a missing or expired one,
     while BetterAuth's session lives on) there is nothing to delete
3. authClient.signOut() clears the BetterAuth session. When step 2 fails, the
   session is kept and the person can try again
```

The server tells a guest by the session's token (`isGuest`, see [Who is calling](#who-is-calling-convexmodelcallerts)), never by the browser's `isAnonymous`, which reads false while the session loads, nor by the `users` row's `accountType`, which a row can lack. Delete account (the Account tab, `useDeleteAccount`) stays its own act: `users.deleteUser` deletes the caller's account whatever its kind, then signs them out as above. Older browsers still call `users.deleteUser` to sign a guest out.

## Auth Provider Context

The auth provider (`src/components/auth/auth-provider.tsx`) takes auth state from Convex (`useConvexAuth()`, which waits for token validation) and holds the app's one subscription to the caller's users row (`users.getGlobalUser`, once Convex has the session), which it hands out as the viewer. BetterAuth's session only feeds the waits (`whenAuth`). Only the app shell mounts it: `/demo` sits in its own route group, whose shell has no auth at all (ADR-0003).

```typescript
interface AuthContextType {
  isLoading: boolean;           // Auth loading state (from Convex: waits for token validation)
  isAuthenticated: boolean;     // Whether Convex has validated the token
  viewer: Viewer;               // Who is looking, with the name, avatar and kind of account their users row has
  whenAuth: WhenAuth;           // Waits for the auth state to reach a condition
}

type Viewer =
  | { status: "loading" }       // Convex's auth state or the caller's users row hasn't answered yet
  | { status: "visitor" }       // Nobody is signed in
  | {
      status: "signedIn";
      name: string | null;      // The users row's, as are the avatar and email: null while there is none
      avatarUrl: string | null;
      email: string | null;
      isPermanent: boolean;     // Whether the row says "permanent"
    };

interface AuthSnapshot {
  authUserId: string | null;    // From BetterAuth's session: null means no session only once it has loaded
  isSessionPending: boolean;    // Whether BetterAuth's session is still loading
  isLoading: boolean;           // From Convex, as in AuthContextType
  isAuthenticated: boolean;     // From Convex, as in AuthContextType
}

type WhenAuth = (ready: (state: AuthSnapshot) => boolean, timeoutMs: number) => Promise<AuthSnapshot>;
```

The viewer is the frontend's one answer to who is looking. The user menus (UserMenu, NavUser) and the room's join gate take the name and avatar from it and never subscribe to the row themselves, and whatever tells a permanent account apart (the Account tab, the retention note on `/retro/new`, the sign-in page's guest button) goes by `isPermanent`. The account kind is the row's only: neither BetterAuth's `isAnonymous` nor its session's email stands in for the row. A signed-in caller has no row until their first room write makes it (a guest who only continued as one, or a deleted account that came back), and is ready all the same, with no name, avatar or email, and not taken for a permanent account: the menus show them as "Guest" with Sign in, and the join gate asks their name rather than joining them under one. Nor is a row with no kind (a guest's made before the server made rows) taken for one. The server goes by the session's token instead: an account's first room write makes it a permanent row, or turns its row permanent.

`whenAuth(ready, timeoutMs)` resolves with the first auth state `ready` accepts (at once if the current one does, else on the update that makes it hold) and rejects after `timeoutMs`. The provider holds the waiters (`createAuthWaiters` in `src/lib/auth-waiters.ts`) and feeds them every change of `authUserId`, `isSessionPending`, `isLoading` and `isAuthenticated`. It sits in the app shell's layout, above the page, so a wait outlives the component that started it. Outside an `AuthProvider`, `whenAuth` rejects.

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
