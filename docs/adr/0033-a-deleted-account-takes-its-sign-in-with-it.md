# A deleted account takes its sign-in with it

**Status:** accepted, 2026-10-12. Amends [ADR-0030](0030-each-module-lets-go-of-a-persons-rows.md): the account lifecycle owns the sign-in a users row stands for, as well as the row.

Delete account deleted the `users` row, and every module let go of what it kept about the person ([ADR-0030](0030-each-module-lets-go-of-a-persons-rows.md)), but BetterAuth's own records stayed: its user, with the email, name and image, the accounts holding the tokens a provider gave, and the sessions of every other device. They live in BetterAuth's component, in AgileKit's own deployment (`convex/auth.ts`), so for a magic-link account AgileKit is the sign-in provider, and the Account tab's "Your sign-in provider keeps its own record" pointed at nobody else. A device still signed in then made the users row again on its next room write, email and all.

So deleting an account deletes its sign-in, in the same transaction, once the modules have let go and the users row is gone: every session, every account, then BetterAuth's user, as BetterAuth's own user deletion does, through the component's adapter functions (`deleteSignIn` in `convex/model/accountLifecycle.ts`). A guest's sign-out deletes the guest's account the same way, so the guest's BetterAuth user goes too, row or no row. And since a token outlives its session (its own fifteen minutes, and BetterAuth's five-minute cookie cache hands a device fresh tokens after its session is gone), the users model makes a row only for a token whose session still exists (`sessionEnded` in `convex/model/caller.ts`).

## Considered Options

- **Keep BetterAuth's user, correct the copy and end the other sessions** (rejected). For a magic-link account the kept user is the email AgileKit holds, which is what Delete account is asked to remove, and signing back in would find the old user rather than start a new account.
- **Delete through BetterAuth's API (`/delete-user`)** (rejected). It has to be enabled, and it takes a session created within the last day, a password or a verification email; calling it from the mutation would also load `convex/auth.ts` and its secrets there. The component's adapter functions are what BetterAuth's own deletion calls, and they run in the mutation's transaction.
- **Remember deleted auth ids and refuse them** (rejected). A table of tombstones to sweep, covering a deletion but not a guest's other tab after signing out. BetterAuth's session table already says whether a token's session is gone.
- **Check the session on every call**, as `authComponent.getAuthUser` does (rejected). A read of BetterAuth's component in every guard, and the session in the read set of every query. Only making a row outlives a session: every other write needs the row.

## Consequences

- The browser that deleted the account signs out as before (`useSignOut`): `users.signOut` finds nothing left to delete, and BetterAuth's sign-out finds the session already gone, clears the cookies and succeeds.
- Another device's writes are refused while its token lasts: a way in that would make its row with "Not authenticated", the rest for want of a row. Once its cookie cache lapses BetterAuth gives it no new token, and it is signed out.
- Signing back in with the same email makes a new BetterAuth user, whose create hook makes a new row. An account deleted before this kept its BetterAuth user, so its row is made again on its first room write, as before, until the cleanup below deletes that user.
- A one-off cleanup (`migrations:deleteLeftoverSignIns`, with `dryRun` to count first) deletes the sign-ins left before this: a permanent BetterAuth user with no users row, and a guest's with no live session. It spares a sign-in made in the last day and a guest's with a live session, who continued as a guest and has yet to make a room write. A permanent account that came back after deleting itself, with no room write since, is signed out by it: AgileKit holds nothing of it, and signing in again makes a new account.
- A token that names no session, as convex-test's need not, counts as live. A test that needs a real session signs in through BetterAuth's own routes (`convex/signIn.seeds.ts`).
- Google keeps the grant it gave AgileKit until the person removes it from their Google account; AgileKit keeps no token to use it with. A magic link sent but never used stays in BetterAuth's verification table, email included, which is indexed by token and not by email; it signs the person up again only within its ten minutes.
- The lint (`eslint.config.mjs`) holds `model/accountLifecycle.ts` to be the only app code that writes BetterAuth's tables.
