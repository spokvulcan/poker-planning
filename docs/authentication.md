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
| `convex/model/accountLifecycle.ts` | Deleting an account and linking a guest to an account, through every module's `UserRows`; a deleted account's BetterAuth sign-in goes with it |
| `convex/model/caller.ts` | Who is calling: the one place the signed-in identity is read and the caller's `users` row looked up (`getCaller`, `requireCaller`, `requireUser`), and whether the session behind it is gone (`sessionEnded`) |
| `convex/model/auth.ts` | Auth guards: the room-scoped step (`requireRoomWrite`), the permission guard's one way in, and room access (`requireRoomReader`) |
| `convex/email.ts` | Internal action that sends the Magic Link email via Resend (the only email AgileKit sends) |

### Frontend (Next.js)

| File | Purpose |
|------|---------|
| `src/lib/auth-client.ts` | BetterAuth client with anonymous and magic link plugins |
| `src/lib/auth-server.ts` | BetterAuth's server helpers through Convex (`getToken`, `isAuthenticated`, `fetchAuthQuery`, etc.): route handlers use them; a server render asks `getServerSession` instead |
| `src/lib/server-session.ts` | `getServerSession`, the one way a server render asks who is signed in (see [Server-Side Auth](#server-side-auth-nextjs)) |
| `src/proxy.ts` | Puts the page's path on every dashboard request (`PAGE_PATH_HEADER`, `src/lib/page-path.ts`), so the dashboard's gate sends a visitor to sign in coming back to the page |
| `src/app/(app)/layout.tsx` | The app shell, for every page but `/demo`: fetches the session's token on the server and mounts BetterAuth and the auth provider (`src/components/providers.tsx`) |
| `src/app/(app)/auth/signin/page.tsx` | Dedicated Sign In Page for permanent account upgrade |
| `src/app/(app)/auth/verify/page.tsx` | Magic Link Verification Page |
| `src/app/api/auth/[...all]/route.ts` | Next.js API route handler |
| `src/components/auth/auth-provider.tsx` | React context for the viewer (who is looking, as `users.getViewer` answers, and whether Convex has confirmed their session) and `whenAuth` for waiting on auth state; `use-caller-query.ts` reads as the viewer |
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

Every Convex mutation enforces authorization with a guard from `convex/model/auth.ts`. Handlers call the guard and never re-implement its checks inline. Who is calling comes from the session, never from a `userId` or `authUserId` the client sends: the writes that still accept the caller's own id ignore it, and presence's heartbeat, the one handler that compares one, checks it against the caller the room-scoped step seats.

### Who is calling (`convex/model/caller.ts`)

One module answers who is calling. It is the only code that reads the signed-in identity (`ctx.auth`) or looks a `users` row up by `authUserId` (`convex/caller.test.ts` fails otherwise). Every guard below resolves the caller through it, and so does every query, mutation or action that needs the caller. It only reads: the users model makes the row (see [The caller's users row](#the-callers-users-row-convexmodelusersts)).

| Function | Returns | Use when... |
|----------|---------|-------------|
| `getCaller(ctx)` | `{ identity, user } \| null` | Queries that should degrade gracefully: `null` when nobody is signed in, and `user` is `null` while the caller has no `users` row (a new guest before their first room) |
| `requireCaller(ctx)` | `{ identity, user }` | The caller must be signed in, with or without a `users` row. Throws "Not authenticated" |
| `requireUser(ctx)` | `{ identity, user }` | You need the caller's `users` row. Throws "Not authenticated", or "User not found" while they have none |
| `sessionAccountType(caller)` | `"anonymous" \| "permanent" \| undefined` | You need the kind of account the caller has (making their row does): their session's token says so in BetterAuth's `isAnonymous` claim, whatever kind their `users` row has; `undefined` for a token without the claim |
| `isGuest(caller)` | `boolean` | You need to know whether the caller is a guest (signing out does): `sessionAccountType` is `"anonymous"` |
| `sessionEnded(ctx, caller)` | `boolean` | You are about to make the caller something that outlives their session (their users row): whether the session their token names is gone from BetterAuth's tables, signed out or deleted with its account. A token outlives its session; a token that names none counts as live |
| `findUser(ctx, authUserId)` | `user \| null` | Code that is told who the person is rather than asking: BetterAuth's hooks |

`identity.subject` is the BetterAuth user id, the row's `authUserId`. The first three work in any function context: an action has no database of its own, so it reads the row through one internal query (`users.userByAuthId`).

The token carries every field of BetterAuth's user but its id and image (the Convex plugin's JWT payload), so `isAnonymous`, `email` and `name` reach `identity` as claims; the `sessionId` claim beside them is what `@convex-dev/better-auth`'s own `getAuthUser` reads.

### The caller's users row (`convex/model/users.ts`)

The server makes a signed-in caller's `users` row, never the browser. The global ways in (`rooms.create`, `retro.create`, `users.join`, `users.editGlobalUser`, and `users.ensureGlobalUser`, which only older browsers call) take `findOrMakeUser(ctx, name?)`: it returns the caller's row, making it when they have none, so a person's first room write makes their row whatever the browser did first. A new row is of the kind the session's token says: a permanent account's has the token's email and the name its provider gave (fitted to the person-name rule, or the email's local part when there is none); a guest's is `"anonymous"`, with a guest name such as "Guest 4829". `name` is one the person typed (joining a room, renaming themselves): the row is made with it, or takes it, and it is refused when it breaks the person-name rule. The name the row already holds, which the room page's automatic join sends back, is fitted to the rule instead: a row made before the rule can hold a longer one. A token without the `isAnonymous` claim makes a row of no kind, as rows were made before. A row is made only while the session the token names exists (`sessionEnded`): a token outlives its session by up to fifteen minutes, so a device whose account was deleted on another, or a guest's other tab after they signed out, makes none and is refused "Not authenticated" (ADR-0033).

The users model is also the only place a row turns permanent (the lint fails otherwise: `eslint.config.mjs`): on an account link, from the auth hook, and on a room write by a permanent account whose row isn't permanent yet (a deleted account that came back with a guest's row before the server made rows). Each time, every retro the account owns is retained (ADR-0029). Queries and actions can't write, so they only look the caller up, and a signed-in caller has no row until their first room write.

### Auth Helpers (`convex/model/auth.ts`)

| Helper | Returns | Use when... |
|--------|---------|-------------|
| `requireRoomWrite(ctx, address, spec?)` | `{ user, membership, room }`, the `target` a relationship verb names, and the addressed entity | **The room-scoped step** a room write starts with. `address` is the room, or the one issue, sticky or action item the write acts on (`{ issue: issueId }`, handed back as `issue`), whose own room the write lands in. The caller must be in that room (**room attendance**, checked by the step's own `requireRoomMember`, which nothing else takes); a `spec` adds the permission guard, whose one way in this is. The caller is whoever is signed in: the step compares no `userId` a client sends. Returns the room it checked, so the handler never reads it again |
| `requireRoomReader(ctx, roomId)` | `{ identity, user }` | **Room access** (ADR-0009): a public query addressed to a room. Passes a room member and nobody else (there are no Teams since ADR-0026), reading only the caller and their membership; returns neither the room nor a membership |

`spec` names what the caller asks to do: `{ kind: "category", category }` (`issueManagement`, `gameFlow`, `stageFlow`, `retroSettings`, ...) or a relationship verb. A verb that acts on another member names them: `{ kind: "relationship", verb, target }`, where `verb` is `remove`, `promote`, `demote` or `transfer`; the step loads their membership (refusing one who isn't in the room), the permission decision weighs their role for the first three, and the step hands it back as `target`, typed as there. `changePerms` and `delete` act on the room alone: `{ kind: "relationship", verb }`. A category from the other ceremony throws (ADR-0013). Identity rules (self-transfer, the authoritative `ownerId`) are not the guard's; they stay with the write, after it (`Roles.transferOwnership`).

`resolveRoomAction` is the step's IO assembly returning the decision instead of throwing, for a caller whose denial depends on the target (someone else's retro sticky).

A guard's refusal is a coded refusal (`refusal()` in `convex/model/refusal.ts`), a `ConvexError` whose message the browser shows as written, because production redacts a plain Error's message (ADR-0031): a denied decision is `forbidden` with the resolved decision's message, a caller outside the room is `forbidden`, and a category from the other ceremony, or an issue, sticky or action item a write is addressed by that is gone, is `missing`. Not being signed in, a missing room or target, and a presence heartbeat naming someone other than the caller still throw plain Errors: they are caller errors, not refusals.

### Which guard to use

- **Room writes on the room-scoped step** (every room write but joining a room: the canvas, the retro's timer, the round clock's timebox and pause (game flow) and showing or hiding its nodes (room settings), votes, the round's transitions, issues, roles and permissions, room settings and the Jira mapping, `users.edit`, `users.leave` and `users.remove`, the retro's, and presence's heartbeat, which also keeps the round clock's attendance): `requireRoomWrite`, with the permission spec where the write is gated by one, and none where everyone in the room may write (the canvas, the retro's timer, a vote, a member's own edit or leave, writing and moving retro stickies). The handler takes the room, the caller and the entity it acts on from the step and never works them out itself, and hands the model the rows it loaded; the `userId` these writes still accept from old browsers is ignored.
- **Presence's heartbeat**, which names its user, takes the step and then checks that `userId` against the caller the step seats, throwing "Cannot heartbeat as another user" on a mismatch. The presence component lists whoever a heartbeat names, and the presence hook finds itself in that list by the id it sends, so the heartbeat checks the id where every other write ignores it: it is the one handler that compares a client-supplied `userId`.
- **An action's room writes** (the Jira import): the step, in the internal mutations the action runs (`ctx.runMutation`). Convex runs a query or mutation an action calls under the action's own identity, so the step seats the action's caller as it seats a browser's, and the permission guard has no second way in. An action that must be refused before it calls out runs a mutation that takes the step and writes nothing: the import's `verifyCanManageIssues`, before Jira is asked anything, a token refresh included; each issue it then admits takes the step again, so an import stops admitting as soon as its caller may no longer manage the room's issues. A function the scheduler runs has no caller (Convex runs it with no identity), so only an action a person called can take the step.
- **Global ways in, which make the caller's row** (`rooms.create`, `retro.create`, `users.join`, `users.editGlobalUser`, `users.ensureGlobalUser`): `findOrMakeUser` from the users model, not a guard. `users.join` and `users.ensureGlobalUser` still accept the `authUserId` older browsers send, and ignore it.
- **Global mutations acting on own data** (`deleteUser`): `requireCaller` or `requireUser`. `signOut` takes `getCaller` instead: with nobody signed in it has nothing to delete, and must not keep the browser from clearing its session.
- **Public queries addressed to a room** (one that takes a room id, or the id of an issue, sticky or action item, each of which is in a room: canvas nodes, the issues, the issue exports, the round clock, the Jira mapping and issue links, the retro board and its action items): `requireRoomReader`. It answers "may you read this room?" rather than "are you in it?"; today both admit exactly the room's members, but the reader guard's return type carries no membership, so a read never leans on attendance (ADR-0009). Nor does it carry the room: a guard's reads join the read set of every query that takes it, so a query that needs the room reads it itself (the retro board), and a room patch, such as the activity clock every poker vote moves, re-runs only those. That is why the poker board reads the issue being voted on by the id its copy of the room names (`issues.get`), not through `issues.getCurrent`, which reads the room's row and stays for older browsers. The only exceptions are the room's public shell, read before the caller is in the room: `rooms.get` (the room and its roster, which joining by link shows), `users.getMyMembership` (whether the caller has a seat, which the room page asks to choose between the room and the join dialog) and `presence.list` (who has it open). The browser subscribes to room contents only once the caller is seated: the room page draws the board only for a member.
- **Both rules, held**: `convex/requireRoomWrite.test.ts` reads every module (all of `convex/` but tests, seeds and generated code). It fails on a write addressed to a room, public or internal, that doesn't take the step or works out the caller or the room itself, but for joining and the server's own writes (the countdown's auto-reveal, a room ending's steps, and an estimate push a reveal queued before the estimate push decided pushes, none of which has a caller); and on a public query addressed to a room that doesn't take `requireRoomReader`, but for the shell.
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

### Example: presence, which checks the userId it is sent

```typescript
import { requireRoomWrite } from "./model/auth";

export const heartbeat = mutation({
  args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    const { user } = await requireRoomWrite(ctx, roomId as Id<"rooms">);
    if (user._id !== userId) {
      throw new Error("Cannot heartbeat as another user");
    }
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
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "issueManagement" });
    const admission = await Issues.admitIssue(ctx, { room, title: args.title });
    return admission.issueId;
  },
});
```

### Example: acting on another member (relationship verb with a target)

`users.remove` takes someone out of the room. The verb names the member it acts on, the step loads their membership, the guard decides on both roles, and the handler takes the target from the step, typed as there:

```typescript
export const remove = mutation({
  args: { userId: v.id("users"), roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room, target } = await requireRoomWrite(ctx, args.roomId, {
      kind: "relationship",
      verb: "remove",
      target: args.userId,
    });
    await Memberships.leave(ctx, room, target);
  },
});
```

### Example: an action's room write

The Jira import is an action: it calls Jira, which a mutation can't. Its room writes are internal mutations it runs, each on the step, which seats the action's own caller:

```typescript
export const importIssues = action({
  args: { roomId: v.id("rooms"), jiraIssueKeys: v.array(v.string()) },
  handler: async (ctx, { roomId, jiraIssueKeys }) => {
    // The step, before anything is asked of Jira (it writes nothing).
    await ctx.runMutation(internal.integrations.jira.verifyCanManageIssues, { roomId });
    // ...read each key from Jira, then admit it, each admission on the step again:
    await ctx.runMutation(internal.integrations.jira.admitIssue, { roomId, title, link });
  },
});

export const admitIssue = internalMutation({
  args: { roomId: v.id("rooms"), title: v.string(), link: linkValidator },
  handler: async (ctx, { roomId, ...issue }) => {
    const { room } = await requireRoomWrite(ctx, roomId, { kind: "category", category: "issueManagement" });
    return await Issues.admitIssue(ctx, { room, ...issue });
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

This makes a new account's `users` record exist right after its first sign-in, before it joins any room. The hook runs only when BetterAuth creates its user. Delete account deletes BetterAuth's user too (ADR-0033), so signing back in with the same email makes a new account, whose row the hook makes. An account deleted before that kept its BetterAuth user: when it signs back in, its row is made again on its first room write, permanent from its token, until `migrations:deleteLeftoverSignIns` deletes the leftover sign-in.

## Server-Side Auth (Next.js)

A server render asks who is signed in through `getServerSession()` (`src/lib/server-session.ts`), and through nothing else, so no page waits on Convex longer than it allows or fails when Convex can't be reached. It gives one answer per request (React's `cache`), which the app shell and a page's gate share. It answers one of three:

- `{ status: "none" }`: nobody is signed in. A request with no session cookie gets this with no network at all; one whose cookie Convex no longer knows, once Convex says so.
- `{ status: "unknown" }`: Convex didn't give the session's token within `SERVER_AUTH_WAIT_MS` (2.5 s), or couldn't be reached. The page renders all the same, and the browser fetches the session itself.
- `{ status: "token", token }`: the session's token, with which Convex authenticates the first render.

The app shell's layout hands the token and the viewer read with it to the auth provider (see [Auth Provider Context](#auth-provider-context)). A page that is an account's own gates on the same answer, as the dashboard's layout (`src/app/(app)/dashboard/layout.tsx`) does: it redirects only when there is no session, and leaves an unknown one to the browser's gate.

```typescript
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { PAGE_PATH_HEADER } from "@/lib/page-path";
import { signInHref } from "@/components/auth/account";

// In a server layout or page:
const session = await getServerSession();
if (session.status === "none") {
  redirect(signInHref((await headers()).get(PAGE_PATH_HEADER) ?? "/dashboard"));
}
```

Sign in comes back to the page the person asked for, from the server as from the browser: `signInHref` of the page's path. Next gives a layout no pathname, so the proxy (`src/proxy.ts`) puts it on every dashboard request, at no cost in network; a gate on pages outside `/dashboard` adds them to the proxy's matcher. The server's redirect spares a visitor the page altogether, which the browser's gate alone would draw before sending them on. The browser's gate (`useAccountPage` in `src/components/dashboard/dashboard-layout.tsx`) sends on a visitor the server couldn't tell, once the browser knows, and one who signs out while on the page. `src/app/shells.test.tsx` serves a dashboard page with Convex unreachable and to a visitor with no session cookie.

Never gate a page on `isAuthenticated()` from `src/lib/auth-server.ts`: it fetches the token for a visitor with no session cookie too, waits for as long as Convex takes, and throws when Convex can't be reached, failing the page. Its helpers are for route handlers (`src/app/api/`), which answer a request rather than render a page.

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
2. The auth provider's viewer is a visitor (Convex says nobody is signed in) → JoinRoomDialog shown
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
     room it owns is handed off (ADR-0029), every module lets go of what
     it keeps about them (ADR-0030), and its BetterAuth sign-in goes, row
     or no row (ADR-0033)
   - A permanent account is kept for when the person signs back in
   - With nobody signed in (Convex has no token, a missing or expired one,
     while BetterAuth's session lives on) there is nothing to delete
3. authClient.signOut() clears the BetterAuth session, or only the browser's
   cookies when step 2 has already deleted it. When step 2 fails, the
   session is kept and the person can try again
```

The server tells a guest by the session's token (`isGuest`, see [Who is calling](#who-is-calling-convexmodelcallerts)), never by the browser's `isAnonymous`, which reads false while the session loads, nor by the `users` row's `accountType`, which a row can lack. Delete account (the Account tab, `useDeleteAccount`) stays its own act: `users.deleteUser` deletes the caller's account whatever its kind, then signs them out as above. Older browsers still call `users.deleteUser` to sign a guest out.

Deleting an account deletes its sign-in in the same transaction (ADR-0033): BetterAuth's user, with its email, name and image, every account, with the tokens a provider gave, and every session, so no device stays signed in. The sign-out that follows finds nothing left for `users.signOut` to delete, and BetterAuth's sign-out finds the session already gone and clears the cookies. Another device keeps its token for up to fifteen minutes, and BetterAuth's cookie cache can hand it fresh ones for five more, but its room writes find no users row and make none: it is refused until its token lapses, and is then signed out. Signing back in with the same email makes a new account.

## Auth Provider Context

The auth provider (`src/components/auth/auth-provider.tsx`) takes auth state from Convex (`useConvexAuth()`, which waits for token validation) and holds the app's one subscription to Convex's answer about the person signed in (`users.getViewer`, once Convex has the session), which it hands out as the viewer. BetterAuth's session only feeds the waits (`whenAuth`). Only the app shell mounts it: `/demo` sits in its own route group, whose shell has no auth at all (ADR-0003).

```typescript
interface AuthContextType {
  viewer: Viewer;               // Who is looking, and whether Convex has confirmed their session
  whenAuth: WhenAuth;           // Waits for the auth state to reach a condition
}

type Viewer =
  | { status: "loading" }       // Convex's auth state or its answer hasn't come yet
  | { status: "visitor" }       // Nobody is signed in
  | {
      status: "signedIn";
      name: string | null;      // The users row's, as are the avatar and email: null while there is none
      avatarUrl: string | null; // (a permanent account's token names it, and gives its email)
      email: string | null;
      isPermanent: boolean;     // Whether the account is permanent, as the session's token says
      confirmed: boolean;       // Whether Convex has confirmed the session in this browser
    };

interface AuthSnapshot {
  authUserId: string | null;    // From BetterAuth's session: null means no session only once it has loaded
  isSessionPending: boolean;    // Whether BetterAuth's session is still loading
  isLoading: boolean;           // Convex's auth state, for the sign-in's waits only
  isAuthenticated: boolean;
}

type WhenAuth = (ready: (state: AuthSnapshot) => boolean, timeoutMs: number) => Promise<AuthSnapshot>;
```

The viewer is the frontend's one answer to who is looking (its type and `accountKind` are in `src/components/auth/viewer.ts`), and Convex's auth state is the provider's alone to read: a page asks the viewer, never Convex's booleans (`auth-provider.test.tsx` holds every other module off `useConvexAuth`). It answers two questions. Who the page shows: the user menus (UserMenu, NavUser, both opening `ViewerMenu` in `src/components/user-menu/viewer-menu.tsx`) and the room's join gate take the name and avatar from it and never subscribe to a row themselves, and whatever tells a permanent account apart (the Account tab, the retention note on `/retro/new`, the sign-in page's guest button) goes by `accountKind(viewer)`. And when a page may read as the viewer: a read whose answer depends on who is calling (their membership, their history) goes through `useCallerQuery` (`src/components/auth/use-caller-query.ts`), which opens once the viewer is `confirmed` and answers undefined until then, so a page never takes a read made before Convex knew the session for its answer. A visitor is the viewer's status, which the dashboard redirects on.

What the viewer says of the person is Convex's answer, `users.getViewer`, which `callerView` in `convex/model/caller.ts` works out as the server goes by: the kind of account from the session's token (`sessionAccountType`), falling back to the row's kind only for a token without the claim, and never from BetterAuth's `isAnonymous` in the browser, which reads false while the session loads. A signed-in caller has no row until their first room write makes it (a guest who only continued as one, or a deleted account that came back) and is ready all the same: a guest with no name, avatar or email, whom the menus show as "Guest" with Sign in and the join gate asks for a name; a permanent account named by its token, and kept as one. `users.getGlobalUser`, the row whole, stays for tabs opened before the viewer asked `getViewer`.

The first paint already knows the viewer. The app shell's layout reads it on the server (`getServerViewer` in `src/components/auth/server-viewer.ts`: no read when there is no token, else one read of `users.getViewer` with the token the request already fetched) and hands it to the provider, which shows it, unconfirmed, until Convex first answers in the browser (confirming it as soon as Convex has the session) and goes by Convex alone after. So a refresh draws the menus, or Sign in, at once, the same on the server and in the browser, while reads made as the viewer wait for Convex; the menus show a skeleton only when the server couldn't read the viewer or Convex is checking a session that changed. `getServerViewer` and the provider are the only modules that ask who is signed in (`auth-provider.test.tsx` holds them to that).

What the viewer is offered of their account is one list, `src/components/auth/account.ts`, which the account menus (`ViewerMenu`), the command menu, the navbar and the dashboard's sidebar all draw from: the signed-in person's places by one set of names (`PLACES`), Sign in for anyone without a permanent account (a guest included, once the viewer is known), and the one way back from the sign-in page, `signInHref(path)`. The sign-in page takes its `from` through `returnPath`, which keeps only a page on this site: `//host` and `/\host` resolve to another site and send the person home instead. A dashboard page is an account's own: the server sends a visitor who asks for one to sign in ([Server-Side Auth](#server-side-auth-nextjs)), and the dashboard's layout in the browser sends one the server couldn't tell, once it knows, and one who becomes a visitor on it (signing out, here or in another tab), each coming back to the page.

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
