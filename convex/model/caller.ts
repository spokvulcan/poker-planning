import type { UserIdentity } from "convex/server";
import { internal } from "../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/**
 * Who is calling: the signed-in identity and the person's `users` row. This
 * is the one place either is read. Every guard (model/auth.ts), and every
 * query, mutation or action that needs the caller, resolves them here, and
 * nothing else looks a person up by their auth id (caller.test.ts fails
 * otherwise). It only reads: a row is made when a person joins or creates a
 * room, or by the auth hooks (model/users.ts). Each function works in any
 * function context; an action, which has no database of its own, reads the
 * row through one internal query.
 */

/**
 * The person a call comes from: their identity (BetterAuth's token, whose
 * `subject` is the row's `authUserId`) and their users row, null until one is
 * made (a new guest has none until they first join or create a room).
 */
export interface Caller {
  identity: UserIdentity;
  user: Doc<"users"> | null;
}

type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

/** Who is calling, or null when nobody is signed in. */
export async function getCaller(ctx: AnyCtx): Promise<Caller | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return { identity, user: await rowOf(ctx, identity.subject) };
}

/** Who is calling; throws "Not authenticated" when nobody is signed in. */
export async function requireCaller(ctx: AnyCtx): Promise<Caller> {
  const caller = await getCaller(ctx);
  if (!caller) throw new Error("Not authenticated");
  return caller;
}

/**
 * Who is calling, with their users row: throws "Not authenticated", or
 * "User not found" while they have no row.
 */
export async function requireUser(
  ctx: AnyCtx
): Promise<Caller & { user: Doc<"users"> }> {
  const { identity, user } = await requireCaller(ctx);
  if (!user) throw new Error("User not found");
  return { identity, user };
}

/**
 * Whether the caller is a guest, as their session's token says: BetterAuth
 * puts its user's fields in the token, `isAnonymous` among them, true for a
 * guest and false for a permanent account. Only a token that says so makes a
 * guest; the users row's kind isn't asked (a row can lack one).
 */
export function isGuest(caller: Caller): boolean {
  return caller.identity.isAnonymous === true;
}

/**
 * The users row of the person signed in as `authUserId`, or null: for code
 * that is told who the person is rather than asking (BetterAuth's hooks, a
 * join that names its own id).
 */
export async function findUser(
  ctx: QueryCtx,
  authUserId: string
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .first();
}

/** An action has no database of its own: it reads the row through an internal query. */
async function rowOf(ctx: AnyCtx, authUserId: string): Promise<Doc<"users"> | null> {
  if ("db" in ctx) return await findUser(ctx, authUserId);
  return await ctx.runQuery(internal.users.userByAuthId, { authUserId });
}
