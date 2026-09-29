import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { analyticsUserRows } from "./analytics";
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
 * (ADR-0030). A module that starts keeping rows about people registers here,
 * and the completeness test (accountLifecycle.test.ts) fails until it does.
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
 * Deletes an account (a guest's sign-out included): each room it owns is
 * handed off (ADR-0029); it leaves every room, its votes and presence go,
 * its integrations disconnect; the stickies and action items it wrote stay
 * in their retros, unnamed.
 */
export async function deleteAccount(ctx: MutationCtx, user: Doc<"users">): Promise<void> {
  for (const rows of userRows()) await rows.forget(ctx, user._id);
  await ctx.db.delete("users", user._id);
}

/**
 * A guest signs in to a permanent account. When the account has no user row
 * yet, the guest's row becomes the account's. When it has one (the auth hook
 * wrote it as the account was created, or the room page joined with it first),
 * everything the guest had is folded into it, module by module, and the
 * guest's row goes. Either way the rooms it owns are kept from now on where
 * a permanent owner keeps them.
 */
export async function linkAccount(
  ctx: MutationCtx,
  guest: Doc<"users">,
  account: Doc<"users"> | null,
  details: { newAuthUserId: string; email: string; name?: string; avatarUrl?: string }
): Promise<void> {
  if (account) {
    await ctx.db.patch("users", account._id, {
      email: details.email,
      accountType: "permanent",
      avatarUrl: details.avatarUrl,
    });
    for (const rows of userRows()) await rows.fold(ctx, guest._id, account._id);
    await ctx.db.delete("users", guest._id);
  } else {
    await ctx.db.patch("users", guest._id, {
      authUserId: details.newAuthUserId,
      email: details.email,
      avatarUrl: details.avatarUrl,
      accountType: "permanent",
      // The name the person chose as a guest wins over the provider's.
      ...(details.name && !guest.name ? { name: details.name } : {}),
    });
  }
  await Ownership.ownerTurnedPermanent(ctx, (account ?? guest)._id);
}
