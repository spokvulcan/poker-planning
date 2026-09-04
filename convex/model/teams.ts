import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  DEFAULT_RETRO_PERMISSIONS,
  accountTypeOf,
  type RetroDefaults,
  type TeamRole,
} from "../permissions";
import {
  INVITE_LINK_INVALID,
  LAST_ADMIN_MESSAGE,
  LEAVE_INSTEAD,
  MAX_TEAM_NAME_LENGTH,
  SIGN_IN_TO_CREATE,
  TARGET_NOT_A_TEAM_MEMBER,
  TEAM_NAME_EMPTY,
  TEAM_NAME_TOO_LONG,
  signInToJoin,
} from "../teamCopy";

/**
 * The Team (ADR-0008): the permanent visibility boundary that owns retro
 * history. This module holds every rule about a Team's life — creation, the
 * invite link, roles, the last-admin invariant, removal, deletion — behind
 * the guard in ./auth (`requireTeamRole`), which the API layer runs first.
 */

export type { RetroDefaults, TeamRole };

/** The bundle a new Team starts with (spec §5). */
export function initialRetroDefaults(): RetroDefaults {
  return {
    attribution: "named",
    joinPolicy: "anyone",
    permissions: { ...DEFAULT_RETRO_PERMISSIONS },
  };
}

export function validateTeamName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error(TEAM_NAME_EMPTY);
  }
  if (trimmed.length > MAX_TEAM_NAME_LENGTH) {
    throw new Error(TEAM_NAME_TOO_LONG);
  }
  return trimmed;
}

/**
 * A fresh invite token: 24 random bytes, URL-safe base64. Rotation writes a
 * new one, which is what invalidates the old link — there is no revocation
 * list to keep.
 */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The one rule about who may hold a Team membership: a permanent account.
 * `accountTypeOf` treats an undefined row value as anonymous (spec §4.4).
 */
function requirePermanentAccount(user: Doc<"users">, message: string): void {
  if (accountTypeOf(user) !== "permanent") {
    throw new Error(message);
  }
}

export async function getTeamMembership(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  userId: Id<"users">
): Promise<Doc<"teamMemberships"> | null> {
  return ctx.db
    .query("teamMemberships")
    .withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
    .first();
}

/**
 * Creates a Team; the creator becomes its first admin.
 */
export async function createTeam(
  ctx: MutationCtx,
  args: { user: Doc<"users">; name: string }
): Promise<Id<"teams">> {
  requirePermanentAccount(args.user, SIGN_IN_TO_CREATE);
  const now = Date.now();
  const teamId = await ctx.db.insert("teams", {
    name: validateTeamName(args.name),
    inviteToken: generateInviteToken(),
    retroDefaults: initialRetroDefaults(),
    createdAt: now,
  });
  await ctx.db.insert("teamMemberships", {
    teamId,
    userId: args.user._id,
    role: "admin",
    joinedAt: now,
  });
  return teamId;
}

/** The team behind an invite token, or null when no live token matches. */
export async function getTeamByInviteToken(
  ctx: QueryCtx,
  inviteToken: string
): Promise<Doc<"teams"> | null> {
  return ctx.db
    .query("teams")
    .withIndex("by_invite_token", (q) => q.eq("inviteToken", inviteToken))
    .first();
}

/**
 * Consumes the invite link: a permanent account becomes a `member` (an
 * existing member stays as they are). This is the only writer of a team
 * membership other than creation; joining a team's retro never comes here.
 */
export async function joinByInvite(
  ctx: MutationCtx,
  args: { user: Doc<"users">; inviteToken: string }
): Promise<Id<"teams">> {
  const team = await getTeamByInviteToken(ctx, args.inviteToken);
  if (!team) {
    throw new Error(INVITE_LINK_INVALID);
  }
  requirePermanentAccount(args.user, signInToJoin(team.name));
  const existing = await getTeamMembership(ctx, team._id, args.user._id);
  if (existing) {
    return team._id;
  }
  await ctx.db.insert("teamMemberships", {
    teamId: team._id,
    userId: args.user._id,
    role: "member",
    joinedAt: Date.now(),
  });
  return team._id;
}

/** Rotates the invite token; the old link stops resolving. */
export async function rotateInvite(
  ctx: MutationCtx,
  teamId: Id<"teams">
): Promise<void> {
  await ctx.db.patch(teamId, { inviteToken: generateInviteToken() });
}

export async function renameTeam(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  name: string
): Promise<void> {
  await ctx.db.patch(teamId, { name: validateTeamName(name) });
}

export async function updateRetroDefaults(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  retroDefaults: RetroDefaults
): Promise<void> {
  await ctx.db.patch(teamId, { retroDefaults });
}

async function requireTargetMembership(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  targetUserId: Id<"users">
): Promise<Doc<"teamMemberships">> {
  const target = await getTeamMembership(ctx, teamId, targetUserId);
  if (!target) {
    throw new Error(TARGET_NOT_A_TEAM_MEMBER);
  }
  return target;
}

/**
 * The last-admin invariant (ADR-0008): a Team can never be left without an
 * admin. Refuses when `membership` is an admin and no other admin exists.
 */
async function refuseIfLastAdmin(
  ctx: QueryCtx,
  membership: Doc<"teamMemberships">
): Promise<void> {
  if (membership.role !== "admin") return;
  // A Team is a handful of people; one indexed read of its roster is cheaper
  // than a role-keyed index kept for this check alone.
  const roster = await ctx.db
    .query("teamMemberships")
    .withIndex("by_team", (q) => q.eq("teamId", membership.teamId))
    .collect();
  const otherAdmin = roster.some(
    (row) => row.role === "admin" && row._id !== membership._id
  );
  if (!otherAdmin) {
    throw new Error(LAST_ADMIN_MESSAGE);
  }
}

export async function promote(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  targetUserId: Id<"users">
): Promise<void> {
  const target = await requireTargetMembership(ctx, teamId, targetUserId);
  if (target.role !== "admin") {
    await ctx.db.patch(target._id, { role: "admin" });
  }
}

export async function demote(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  targetUserId: Id<"users">
): Promise<void> {
  const target = await requireTargetMembership(ctx, teamId, targetUserId);
  if (target.role !== "admin") return;
  await refuseIfLastAdmin(ctx, target);
  await ctx.db.patch(target._id, { role: "member" });
}

/**
 * Removal is an access operation and never a content operation (ADR-0008):
 * the membership row goes, and nothing else — no room ejection, no cards.
 */
export async function removeMember(
  ctx: MutationCtx,
  args: { teamId: Id<"teams">; actorUserId: Id<"users">; targetUserId: Id<"users"> }
): Promise<void> {
  if (args.actorUserId === args.targetUserId) {
    throw new Error(LEAVE_INSTEAD);
  }
  const target = await requireTargetMembership(ctx, args.teamId, args.targetUserId);
  await ctx.db.delete(target._id);
}

/** Leave the Team; the last admin is refused. */
export async function leave(
  ctx: MutationCtx,
  membership: Doc<"teamMemberships">
): Promise<void> {
  await refuseIfLastAdmin(ctx, membership);
  await ctx.db.delete(membership._id);
}

/**
 * Memberships deleted per step of the team cascade; the registered wrapper
 * (internal.maintenance.deleteTeamChunk) reschedules itself until `done`.
 */
export const TEAM_DELETE_BATCH_SIZE = 500;

export interface TeamDeleteStep {
  /** true once the team row itself is deleted — the cascade is complete. */
  done: boolean;
  /**
   * Membership rows deleted by this step. Unlike the room cascade's count,
   * the team row itself is not included — `done` reports it.
   */
  deleted: number;
}

/**
 * One bounded step of the team cascade: a batch of memberships, then — only
 * when no full batch remains — the team row itself, last. Rooms are not
 * touched here; `deleteTeam` hands each of them to the room cascade once.
 */
export async function deleteTeamChunk(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  batchSize: number = TEAM_DELETE_BATCH_SIZE
): Promise<TeamDeleteStep> {
  const rows = await ctx.db
    .query("teamMemberships")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .take(batchSize);
  await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
  if (rows.length === batchSize) {
    return { done: false, deleted: rows.length };
  }
  if (await ctx.db.get(teamId)) {
    await ctx.db.delete(teamId);
  }
  return { done: true, deleted: rows.length };
}

/**
 * Deletes a Team (spec §2, §5): schedules one room cascade per room the Team
 * owns (`by_team`), then runs the first membership step and schedules the
 * continuation when a full batch remains. The team row goes last, so a
 * member keeps reading the team page until their own membership row drains
 * and no room is ever left pointing at a Team with live memberships.
 *
 * Every room is scheduled from this one mutation — the rooms still exist
 * (their cascades run later) and `teamId` never changes, so a continuation
 * re-reading `by_team` would double-schedule them.
 */
export async function deleteTeam(
  ctx: MutationCtx,
  teamId: Id<"teams">
): Promise<{ roomsScheduled: number; step: TeamDeleteStep }> {
  // Unbounded on purpose: a `.take` continuation would re-read rooms whose
  // cascades are still pending and schedule them twice, and any room left
  // out would sit retained forever. A Team's rooms are its retros — tens,
  // not thousands.
  const rooms = await ctx.db
    .query("rooms")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  for (const room of rooms) {
    await ctx.scheduler.runAfter(0, internal.maintenance.deleteRoomAggregateChunk, {
      roomId: room._id,
    });
  }
  const step = await deleteTeamChunk(ctx, teamId);
  if (!step.done) {
    await ctx.scheduler.runAfter(0, internal.maintenance.deleteTeamChunk, { teamId });
  }
  return { roomsScheduled: rooms.length, step };
}

export interface TeamMemberView {
  userId: Id<"users">;
  name: string;
  avatarUrl?: string;
  role: TeamRole;
  joinedAt: number;
}

/**
 * How many of a Team's rooms the page counts. A bounded read (guidelines:
 * never `.collect().length`); the count only feeds the delete confirmation.
 * When #288 starts writing team rooms, a denormalised counter on the team
 * row is the place for this.
 */
const MAX_COUNTED_ROOMS = 1000;

export interface TeamPage {
  _id: Id<"teams">;
  name: string;
  inviteToken: string;
  retroDefaults: RetroDefaults;
  createdAt: number;
  /** The caller, so the page needs no second query to find its own row. */
  myUserId: Id<"users">;
  myRole: TeamRole;
  /** Rooms the Team owns — the `{n} retros` in the delete confirmation. */
  roomCount: number;
  members: TeamMemberView[];
}

/**
 * The team page's data for a member: the team, its members in join order
 * with their roles, the invite token and the room count. Never a room's
 * contents — those stay behind `requireRoomReader`.
 */
export async function getTeamPage(
  ctx: QueryCtx,
  team: Doc<"teams">,
  membership: Doc<"teamMemberships">
): Promise<TeamPage> {
  const [rows, rooms] = await Promise.all([
    ctx.db
      .query("teamMemberships")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect(),
    ctx.db
      .query("rooms")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .take(MAX_COUNTED_ROOMS),
  ]);
  const users = await Promise.all(rows.map((row) => ctx.db.get(row.userId)));
  const members: TeamMemberView[] = rows.map((row, i) => ({
    userId: row.userId,
    // A deleted account renders by reference (spec §19).
    name: users[i]?.name ?? "Former member",
    ...(users[i]?.avatarUrl ? { avatarUrl: users[i]!.avatarUrl } : {}),
    role: row.role,
    joinedAt: row.joinedAt,
  }));
  return {
    _id: team._id,
    name: team.name,
    inviteToken: team.inviteToken,
    retroDefaults: team.retroDefaults,
    createdAt: team.createdAt,
    myUserId: membership.userId,
    myRole: membership.role,
    roomCount: rooms.length,
    members,
  };
}

export interface MyTeam {
  _id: Id<"teams">;
  name: string;
  role: TeamRole;
}

/** The caller's Teams in join order, with their role in each. */
export async function listTeamsForUser(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<MyTeam[]> {
  const rows = await ctx.db
    .query("teamMemberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const teams = await Promise.all(rows.map((row) => ctx.db.get(row.teamId)));
  return rows.flatMap((row, i) => {
    const team = teams[i];
    // A membership whose team row is mid-cascade is not a Team to list.
    return team ? [{ _id: team._id, name: team.name, role: row.role }] : [];
  });
}
