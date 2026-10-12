import { components } from "../_generated/api";
import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { analyticsUserRows } from "./analytics";
import { isGuest, type Caller } from "./caller";
import { canvasUserRows } from "./canvas";
import { integrationUserRows } from "./integrations";
import { membershipUserRows } from "./memberships";
import * as Ownership from "./ownership";
import { presenceUserRows } from "./presence";
import { retroUserRows } from "./retro";
import { votingRoundUserRows } from "./votingRound";
import type { UserRows } from "./userRows";

/**
 * An account's two endings (CONTEXT.md: Hand-off, Account link): deleting it,
 * and a guest signing in, which folds the guest into the account. Every
 * module that keeps rows about a person says how it lets go of them
 * (model/userRows.ts); this module walks them and owns only the `users` row
 * (ADR-0030) and the sign-in the row stands for, which a deleted account
 * takes with it (ADR-0033). A module that starts keeping rows about people
 * registers here, and the completeness test (accountLifecycle.test.ts) fails
 * until it does.
 */

/**
 * Every module that keeps rows about a person. The order is load-bearing:
 * rooms are handed off while the person's memberships still say who else is
 * in them, and the memberships go before the voting round, so a guest's vote
 * folds onto the account's seat. Only the memberships walk the person's rooms;
 * what follows their seats (player nodes, votes) goes room by room with them.
 */
export function userRows(): readonly UserRows[] {
  // A function, not a constant: the modules import each other, and a list
  // built at load time could read one of them before it has finished loading.
  return [
    Ownership.ownershipUserRows,
    canvasUserRows,
    retroUserRows,
    analyticsUserRows,
    integrationUserRows,
    presenceUserRows,
    membershipUserRows,
    votingRoundUserRows,
  ];
}

/**
 * Deletes the caller's account (a guest's sign-out included): each room it
 * owns is handed off (ADR-0029); it leaves every room, its votes and presence
 * go, its integrations disconnect; the stickies and action items it wrote
 * stay in their retros, unnamed. Then its sign-in goes (ADR-0033), whether or
 * not the account had a users row yet.
 */
export async function deleteAccount(ctx: MutationCtx, { identity, user }: Caller): Promise<void> {
  if (user) {
    for (const rows of userRows()) await rows.forget(ctx, user._id);
    await ctx.db.delete("users", user._id);
  }
  await deleteSignIn(ctx, identity.subject);
}

/** Sessions or accounts deleted per call into BetterAuth's component. */
const SIGN_IN_BATCH = 100;

/**
 * Deletes a person's sign-in from BetterAuth's tables, which live in this
 * deployment (convex/auth.ts), taking what BetterAuth's own user deletion
 * takes: every session, so no device stays signed in, every account, with
 * the tokens a provider gave, then the user, with its email, name and image.
 * Besides deleting an account, only the cleanup of the sign-ins deleted
 * accounts left behind calls it (migrations.deleteLeftoverSignIns).
 */
export async function deleteSignIn(ctx: MutationCtx, authUserId: string): Promise<void> {
  for (const model of ["session", "account"] as const) {
    // Each call deletes what it reads, so the next starts from the front.
    for (;;) {
      const deleted: { isDone: boolean; count: number } = await ctx.runMutation(
        components.betterAuth.adapter.deleteMany,
        {
          input: { model, where: [{ field: "userId", value: authUserId }] },
          paginationOpts: { cursor: null, numItems: SIGN_IN_BATCH },
        }
      );
      if (deleted.isDone || deleted.count === 0) break;
    }
  }
  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: { model: "user", where: [{ field: "_id", value: authUserId }] },
  });
}

/**
 * Signing out (CONTEXT.md: Guest): a guest's account goes with its session,
 * deleted as above; a permanent account stays for when the person signs back
 * in. The session's token tells them apart (caller.ts), so nothing the
 * browser believes about the session can delete a permanent account.
 */
export async function signOut(ctx: MutationCtx, caller: Caller): Promise<void> {
  if (isGuest(caller)) await deleteAccount(ctx, caller);
}

/**
 * A guest signs in to a permanent account. When the account has no user row
 * yet, the guest's row becomes the account's. When it has one (the auth hook
 * wrote it as the account was created, or the room page joined with it first),
 * everything the guest had is folded into it, module by module, and the
 * guest's row goes. Returns the account's row, which the users model then
 * turns permanent (model/users.ts).
 */
export async function linkAccount(
  ctx: MutationCtx,
  guest: Doc<"users">,
  account: Doc<"users"> | null,
  details: { newAuthUserId: string; name?: string }
): Promise<Id<"users">> {
  if (account) {
    for (const rows of userRows()) await rows.fold(ctx, guest._id, account._id);
    await ctx.db.delete("users", guest._id);
    return account._id;
  }
  await ctx.db.patch("users", guest._id, {
    authUserId: details.newAuthUserId,
    // The name the person chose as a guest wins over the provider's.
    ...(details.name && !guest.name ? { name: details.name } : {}),
  });
  return guest._id;
}
