import { MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import * as AccountLifecycle from "./accountLifecycle";
import { findUser, requireCaller, sessionAccountType, type Caller } from "./caller";
import * as Memberships from "./memberships";
import * as Ownership from "./ownership";
import * as Rooms from "./rooms";
import { requireValid } from "./refusal";
import { PERSON_NAME } from "../constants";

/**
 * People: the app's `users` rows, one per person, each linked to an auth
 * identity (BetterAuth's user id). Who is calling, and so which row is
 * theirs, is caller.ts's; the row is made here, on the caller's first room
 * write or by the auth hooks, and this is the only place a row turns
 * permanent (usersRow.test.ts fails otherwise). Which rooms a person is in is
 * memberships.ts's; how an account ends, deleted or folded into another, is
 * accountLifecycle.ts's. Every name a users row gets passes the person-name
 * rule (constants.ts) here: one a person typed is refused when it breaks the
 * rule; one a sign-in provider gives, or the one a row made before the rule
 * already holds, is fitted to it.
 */

export interface JoinRoomArgs {
  roomId: Id<"rooms">;
  name: string;
  isSpectator?: boolean;
}

export interface EditUserArgs {
  name?: string;
  isSpectator?: boolean;
}

/**
 * The caller's users row, made when they have none. The global ways in
 * (creating a poker room or a retro, joining a room, renaming yourself) come
 * through here, so a signed-in person's first room write makes their row,
 * whatever the browser did first. A new row is of the kind the session's
 * token says (caller.ts): a permanent account's has the token's email and the
 * name its provider gave, anyone else's a guest name. A row the token says is
 * a permanent account's, but which isn't yet (a deleted account came back as
 * a guest's before the server made rows), turns permanent. `name` is one the
 * person sent, joining a room or renaming themselves: the row is made with
 * it, or takes it (see sentName). Throws "Not authenticated".
 */
export async function findOrMakeUser(ctx: MutationCtx, typedName?: string): Promise<Doc<"users">> {
  const caller = await requireCaller(ctx);
  const { user } = caller;
  const name = typedName === undefined ? undefined : sentName(user, typedName);
  if (!user) return await makeUser(ctx, caller, name);
  const turnsPermanent = sessionAccountType(caller) === "permanent" && user.accountType !== "permanent";
  const renamed = name !== undefined && name !== user.name;
  if (!turnsPermanent && !renamed) return user;
  if (turnsPermanent) await turnPermanent(ctx, user._id, { email: caller.identity.email });
  if (renamed) await ctx.db.patch("users", user._id, { name });
  return (await ctx.db.get("users", user._id))!;
}

/**
 * A name the caller sent for their row. One they typed is refused when it
 * breaks the person-name rule. The one their row already holds, sent back as
 * the room page's automatic join does, is fitted to the rule instead: a row
 * made before the rule can hold a longer one, and its owner never typed it
 * here.
 */
function sentName(user: Doc<"users"> | null, sent: string): string | undefined {
  if (user && sent === user.name) return PERSON_NAME.fit(sent) || undefined;
  return requireValid(PERSON_NAME, sent);
}

/** A new users row for the caller, of the kind their session's token says. */
async function makeUser(ctx: MutationCtx, caller: Caller, name?: string): Promise<Doc<"users">> {
  const { subject, email } = caller.identity;
  const accountType = sessionAccountType(caller);
  if (accountType === "permanent" && email) {
    const named = name ?? (providerName(caller.identity.name ?? "", email) || guestName());
    return await insertAccount(ctx, subject, { email, name: named });
  }
  const userId = await ctx.db.insert("users", {
    authUserId: subject,
    name: name ?? guestName(),
    ...(accountType ? { accountType } : {}),
    createdAt: Date.now(),
  });
  return (await ctx.db.get("users", userId))!;
}

/** A permanent account's new row: its email, its avatar when the provider gives one, and its name. */
async function insertAccount(
  ctx: MutationCtx,
  authUserId: string,
  account: { email: string; name: string; avatarUrl?: string }
): Promise<Doc<"users">> {
  const userId = await ctx.db.insert("users", {
    authUserId,
    name: account.name,
    email: account.email,
    ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
    accountType: "permanent",
    createdAt: Date.now(),
  });
  return (await ctx.db.get("users", userId))!;
}

/** A guest's name until they choose one, such as "Guest 4829". */
function guestName(): string {
  return `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * The row becomes a permanent account's, with the account's email, and its
 * avatar when the provider gives one: the only place a row turns permanent.
 * The rooms it owns are kept from now on wherever a permanent owner keeps
 * them (ADR-0029).
 */
async function turnPermanent(
  ctx: MutationCtx,
  userId: Id<"users">,
  account: { email?: string; avatarUrl?: string }
): Promise<void> {
  await ctx.db.patch("users", userId, {
    accountType: "permanent",
    ...(account.email ? { email: account.email } : {}),
    ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
  });
  await Ownership.ownerTurnedPermanent(ctx, userId);
}

/**
 * Joins the caller to a room under the name they typed, making their users
 * row on the way when this is their first room write.
 */
export async function joinRoom(ctx: MutationCtx, args: JoinRoomArgs): Promise<Id<"users">> {
  const user = await findOrMakeUser(ctx, args.name);
  const room = await ctx.db.get("rooms", args.roomId);
  if (!room) throw new Error("Room not found");
  await Memberships.join(ctx, room, user, { isSpectator: args.isSpectator });
  return user._id;
}

/**
 * Updates a member's name (their global one) and whether they sit out as a
 * spectator in this room. The handler's room-scoped step hands over the room
 * and the member's membership.
 */
export async function editUser(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  membership: Doc<"roomMemberships">,
  args: EditUserArgs
): Promise<void> {
  const name = args.name === undefined ? undefined : requireValid(PERSON_NAME, args.name);

  if (name !== undefined) {
    await ctx.db.patch("users", membership.userId, { name });
  }
  if (args.isSpectator !== undefined) {
    await Memberships.setSpectator(ctx, room, membership, args.isSpectator);
  } else {
    await Rooms.updateRoomActivity(ctx, room);
  }
}

/**
 * The name a sign-in provider gives an account, fitted to the person-name
 * rule: its display name, or the email's local part when it has none, as
 * an account made by magic link has none.
 */
function providerName(name: string, email: string): string {
  return PERSON_NAME.fit(name) || PERSON_NAME.fit(email.split("@")[0]);
}

/**
 * A permanent account was just made in BetterAuth (Google OAuth, magic link;
 * its create hook skips guests): the account's users row, with the email,
 * avatar and name the provider gives. A row it already has turns permanent.
 */
export async function ensureGlobalUserFromAuth(
  ctx: MutationCtx,
  args: {
    authUserId: string;
    name: string;
    email: string;
    avatarUrl?: string;
  }
): Promise<void> {
  const existingUser = await findUser(ctx, args.authUserId);
  if (existingUser) {
    await turnPermanent(ctx, existingUser._id, args);
    return;
  }

  await insertAccount(ctx, args.authUserId, {
    email: args.email,
    name: providerName(args.name, args.email),
    avatarUrl: args.avatarUrl,
  });
}

/**
 * Syncs avatar URL from auth provider to the global user record
 */
export async function syncGlobalUserAvatar(
  ctx: MutationCtx,
  authUserId: string,
  avatarUrl: string
): Promise<void> {
  const user = await findUser(ctx, authUserId);
  if (user && user.avatarUrl !== avatarUrl) {
    await ctx.db.patch("users", user._id, { avatarUrl });
  }
}

/**
 * A guest signed in to a permanent account: everything the guest had becomes
 * the account's (accountLifecycle.ts), and the account's row turns permanent.
 * A fresh sign-in with no guest row has nothing to carry: the account's user
 * row is made by the auth hook, or on its first room write.
 */
export async function linkAnonymousToPermanent(
  ctx: MutationCtx,
  args: {
    oldAuthUserId: string;
    newAuthUserId: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  }
): Promise<void> {
  const guest = await findUser(ctx, args.oldAuthUserId);
  if (!guest) return;
  const account = await findUser(ctx, args.newAuthUserId);
  const userId = await AccountLifecycle.linkAccount(ctx, guest, account, {
    newAuthUserId: args.newAuthUserId,
    name: PERSON_NAME.fit(args.name ?? "") || undefined,
  });
  await turnPermanent(ctx, userId, args);
}
