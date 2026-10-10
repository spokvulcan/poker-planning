import { MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import * as AccountLifecycle from "./accountLifecycle";
import { findUser } from "./caller";
import * as Memberships from "./memberships";
import * as Rooms from "./rooms";
import { requireValid } from "./refusal";
import { PERSON_NAME } from "../constants";

/**
 * People: the app's `users` rows, one per person, each linked to an auth
 * identity (BetterAuth's user id). Who is calling, and so which row is
 * theirs, is caller.ts's. Which rooms a person is in is memberships.ts's;
 * how an account ends, deleted or folded into another, is
 * accountLifecycle.ts's. Every name a users row gets passes the person-name
 * rule (constants.ts) here: one a person typed is refused when it breaks the
 * rule, one a sign-in provider gives is fitted to it.
 */

export interface JoinRoomArgs {
  roomId: Id<"rooms">;
  name: string;
  isSpectator?: boolean;
  authUserId: string;
}

export interface EditUserArgs {
  userId: Id<"users">;
  roomId: Id<"rooms">;
  name?: string;
  isSpectator?: boolean;
}

/**
 * Finds or creates a global user by authUserId
 */
export async function findOrCreateGlobalUser(
  ctx: MutationCtx,
  args: { authUserId: string; name: string }
): Promise<Id<"users">> {
  const name = requireValid(PERSON_NAME, args.name);
  const existingUser = await findUser(ctx, args.authUserId);
  if (existingUser) {
    // Update name if changed
    if (existingUser.name !== name) {
      await ctx.db.patch("users", existingUser._id, { name });
    }
    return existingUser._id;
  }

  // Don't set accountType here — we can't reliably determine it from a mutation
  // context. The BetterAuth session (isAnonymous) is the authoritative source
  // for the frontend. Linking an account sets "permanent" on upgrade.
  return await ctx.db.insert("users", {
    authUserId: args.authUserId,
    name,
    createdAt: Date.now(),
  });
}

/**
 * Joins a person to a room by auth identity, making their user row on the
 * way when this is their first room.
 */
export async function joinRoom(ctx: MutationCtx, args: JoinRoomArgs): Promise<Id<"users">> {
  const room = await ctx.db.get("rooms", args.roomId);
  if (!room) throw new Error("Room not found");
  const userId = await findOrCreateGlobalUser(ctx, {
    authUserId: args.authUserId,
    name: args.name,
  });
  const user = (await ctx.db.get("users", userId))!;
  await Memberships.join(ctx, room, user, { isSpectator: args.isSpectator });
  return userId;
}

/**
 * Updates a member's name (their global one) and whether they sit out as a
 * spectator in this room.
 */
export async function editUser(ctx: MutationCtx, args: EditUserArgs): Promise<void> {
  const name = args.name === undefined ? undefined : requireValid(PERSON_NAME, args.name);
  const [user, room] = await Promise.all([ctx.db.get("users", args.userId), ctx.db.get("rooms", args.roomId)]);
  if (!user) throw new Error("User not found");
  if (!room) throw new Error("Room not found");
  if (!(await Memberships.getMembership(ctx, room._id, user._id))) throw new Error("User not in room");

  if (name !== undefined) {
    await ctx.db.patch("users", args.userId, { name });
  }
  if (args.isSpectator !== undefined) {
    await Memberships.setSpectator(ctx, room, args.userId, args.isSpectator);
  } else {
    await Rooms.updateRoomActivity(ctx, room);
  }
}

/**
 * Takes a person out of a room: they leave, or someone removes them.
 */
export async function leaveRoom(ctx: MutationCtx, userId: Id<"users">, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get("rooms", roomId);
  if (room) await Memberships.leave(ctx, room, userId);
}

/**
 * Updates the caller's global name; throws for a caller with no user row yet
 */
export async function updateGlobalUserName(
  ctx: MutationCtx,
  user: Doc<"users"> | null,
  name: string
): Promise<void> {
  const kept = requireValid(PERSON_NAME, name);
  if (!user) {
    throw new Error("User not found");
  }
  await ctx.db.patch("users", user._id, { name: kept });
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
 * Creates or updates a global user record from auth provider data.
 * Called from databaseHooks when a permanent (non-anonymous) user is created in BetterAuth.
 * Unlike findOrCreateGlobalUser (used at room-join time), this sets
 * email, avatarUrl, and accountType="permanent".
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
    // User already exists (e.g., created by a race with joinRoom).
    // Patch in permanent account details that findOrCreateGlobalUser doesn't set.
    await ctx.db.patch("users", existingUser._id, {
      email: args.email,
      accountType: "permanent" as const,
      ...(args.avatarUrl ? { avatarUrl: args.avatarUrl } : {}),
    });
    return;
  }

  await ctx.db.insert("users", {
    authUserId: args.authUserId,
    name: providerName(args.name, args.email),
    email: args.email,
    avatarUrl: args.avatarUrl,
    accountType: "permanent" as const,
    createdAt: Date.now(),
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
 * the account's. A fresh sign-in with no guest row has nothing to carry: the
 * account's user row is made when it first joins a room.
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
  await AccountLifecycle.linkAccount(ctx, guest, account, {
    ...args,
    name: PERSON_NAME.fit(args.name ?? "") || undefined,
  });
}
