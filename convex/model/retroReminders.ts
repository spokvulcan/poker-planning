import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { EmailRecipient } from "./retroNudge";
import { FORMER_MEMBER } from "../retroCopy";

/**
 * The reminders (spec §16.3, ADR-0020): the emails an action item sends
 * its owner. *Owner assigned* goes out once per assignment by someone
 * else, scheduled with `runAfter(0)` and never deduped. *Due today* goes
 * out once, at a fixed hour on the due date, scheduled with `runAt`; the
 * job id sits in `reminderJobId`, and every change to the date, owner or
 * status cancels it and reschedules only while the commitment stands.
 * No overdue email, ever. The send action re-reads the item when it
 * fires and resolves the owner through the channel's send-time filter,
 * so a gone, closed or unowned item, a deleted room, a teamless retro or
 * an owner who opted out, lost their address, left the Team or deleted
 * their account gets nothing. Nothing here bumps room activity: the act
 * that changed the item already did, and the send is a read.
 */

export type ReminderKind = "ownerAssigned" | "dueToday";

/**
 * The hour of the due-date send, in UTC (a documented v1 constant, spec
 * §16.3): no timezone is stored anywhere, so the date is read as a UTC
 * calendar date and the email goes out at 08:00 UTC that morning.
 */
export const DUE_TODAY_HOUR_UTC = 8;

/** The instant the due-today reminder fires for a `dueAt`: 08:00 UTC on its UTC calendar date. */
export function dueTodayInstant(dueAt: number): number {
  const date = new Date(dueAt);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), DUE_TODAY_HOUR_UTC);
}

/** The job the assignment schedules; the item is re-read when it fires. */
export interface OwnerAssignedJob {
  kind: "ownerAssigned";
  actionId: Id<"retroActions">;
  /** The owner this assignment named; a later reassignment makes the job moot. */
  ownerId: Id<"users">;
  senderId: Id<"users">;
}

export interface DueTodayJob {
  kind: "dueToday";
  actionId: Id<"retroActions">;
}

export type ReminderJob = OwnerAssignedJob | DueTodayJob;

/**
 * After every write to an item (create, edit, status, assign): the row is
 * read back and both reminders brought in step with it. `before` is the
 * row as it was, absent for a new one.
 */
export async function afterWrite(
  ctx: MutationCtx,
  args: { actionId: Id<"retroActions">; before?: Doc<"retroActions">; actorId: Id<"users"> }
): Promise<void> {
  const action = await ctx.db.get(args.actionId);
  if (!action) return;
  await noteAssignment(ctx, action, args.before?.ownerId, args.actorId);
  await reconcileDueReminder(ctx, action, args.before);
}

/**
 * Owner assigned: when the owner changed to someone other than the actor,
 * schedule one send. Self-assignment, unassignment and re-stating the
 * current owner set nothing new and send nothing. Whether that person
 * has an address is the send's concern, not the mutation's.
 */
async function noteAssignment(
  ctx: MutationCtx,
  action: Doc<"retroActions">,
  previousOwnerId: Id<"users"> | undefined,
  actorId: Id<"users">
): Promise<void> {
  if (action.ownerId === undefined || action.ownerId === previousOwnerId || action.ownerId === actorId) {
    return;
  }
  const job: OwnerAssignedJob = {
    kind: "ownerAssigned",
    actionId: action._id,
    ownerId: action.ownerId,
    senderId: actorId,
  };
  await ctx.scheduler.runAfter(0, internal.email.sendReminder, job);
}

/** Whether a write moved one of the three fields the due-date job hangs on. */
function commitmentChanged(before: Doc<"retroActions">, after: Doc<"retroActions">): boolean {
  return before.dueAt !== after.dueAt || before.ownerId !== after.ownerId || before.status !== after.status;
}

/**
 * Due today: when the date, owner or status changed since `before` (or
 * the row is new), cancel the stored job and schedule anew only if the
 * item is still `open`, owned, and the instant is ahead. A past instant
 * schedules nothing.
 */
async function reconcileDueReminder(
  ctx: MutationCtx,
  action: Doc<"retroActions">,
  before?: Doc<"retroActions">
): Promise<void> {
  if (before !== undefined && !commitmentChanged(before, action)) return;
  const instant = action.dueAt !== undefined ? dueTodayInstant(action.dueAt) : undefined;
  const stands =
    action.status === "open" && action.ownerId !== undefined && instant !== undefined && instant > Date.now();
  if (action.reminderJobId === undefined && !stands) return;
  if (action.reminderJobId !== undefined) await cancelIfWaiting(ctx, action.reminderJobId);
  const job: DueTodayJob = { kind: "dueToday", actionId: action._id };
  const reminderJobId = stands ? await ctx.scheduler.runAt(instant, internal.email.sendReminder, job) : undefined;
  await ctx.db.patch(action._id, { reminderJobId });
}

/** Before the row goes: its job with it. */
export async function cancelDueReminder(ctx: MutationCtx, action: Doc<"retroActions">): Promise<void> {
  if (action.reminderJobId !== undefined) await cancelIfWaiting(ctx, action.reminderJobId);
}

/**
 * Cancel a stored job only while it has not run: the send cannot clear
 * `reminderJobId` (the action never writes), so after the day the id
 * names a finished job, which is left as the record it is.
 */
async function cancelIfWaiting(ctx: MutationCtx, jobId: Id<"_scheduled_functions">): Promise<void> {
  const job = await ctx.db.system.get(jobId);
  if (job && (job.state.kind === "pending" || job.state.kind === "inProgress")) {
    await ctx.scheduler.cancel(jobId);
  }
}

/** What both reminders say (spec §16.3): the action's own facts, its retro, the date and the link. */
interface ReminderFacts {
  actionId: Id<"retroActions">;
  roomId: Id<"rooms">;
  retroName: string;
  teamName: string;
  text: string;
  dueAt?: number;
}

export type ReminderContent =
  | (ReminderFacts & { kind: "ownerAssigned"; senderName: string })
  | (ReminderFacts & { kind: "dueToday" });

export interface ResolvedReminderSend {
  content: ReminderContent;
  recipient: EmailRecipient;
}

/**
 * Send-time resolution (spec §16.1, §16.3): the item re-read now. Null
 * when there is nothing to send: the item is gone, not `open` or unowned;
 * the assignment the job named no longer stands; the room is gone (the
 * cascade) or teamless (a teamless retro never emails anyone); or the
 * owner is deleted, address-less, opted out or not a member of the
 * retro's Team. A read only; the send action never patches the room.
 */
export async function resolveReminderSend(ctx: QueryCtx, job: ReminderJob): Promise<ResolvedReminderSend | null> {
  const action = await ctx.db.get(job.actionId);
  if (!action || action.status !== "open" || action.ownerId === undefined) return null;
  if (job.kind === "ownerAssigned" && action.ownerId !== job.ownerId) return null;
  const room = await ctx.db.get(action.roomId);
  if (!room || room.teamId === undefined) return null;
  const [team, owner, membership] = await Promise.all([
    ctx.db.get(room.teamId),
    ctx.db.get(action.ownerId),
    ctx.db
      .query("teamMemberships")
      .withIndex("by_team_user", (q) => q.eq("teamId", room.teamId!).eq("userId", action.ownerId!))
      .unique(),
  ]);
  if (!team || !owner || !membership) return null;
  if (owner.email === undefined || owner.emailOptOut === true) return null;
  const facts: ReminderFacts = {
    actionId: action._id,
    roomId: room._id,
    retroName: room.name,
    teamName: team.name,
    text: action.text,
    ...(action.dueAt !== undefined ? { dueAt: action.dueAt } : {}),
  };
  const recipient: EmailRecipient = { userId: owner._id, email: owner.email };
  if (job.kind === "dueToday") return { content: { ...facts, kind: "dueToday" }, recipient };
  const sender = await ctx.db.get(job.senderId);
  return { content: { ...facts, kind: "ownerAssigned", senderName: sender?.name ?? FORMER_MEMBER }, recipient };
}
