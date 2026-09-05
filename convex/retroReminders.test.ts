/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { DUE_TODAY_HOUR_UTC, dueTodayInstant } from "./model/retroReminders";
import type { T } from "./analytics.seeds";

// The reminders (spec §16.3, ADR-0020): an action item emails its owner
// once per assignment by someone else, and once at 08:00 UTC on its due
// date. The assignment schedules a `runAfter(0)` send; the date schedules
// a `runAt` job whose id sits in `reminderJobId`, cancelled and rescheduled
// by every change to the date, owner or status. The send action re-reads
// the item and never touches the room.

const modules = import.meta.glob("./**/*.*s");

const as = (t: T, subject: string) => t.withIdentity({ subject });

const seedUser = (t: T, subject: string, opts: { email?: string; anonymous?: boolean } = {}) =>
  t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId: subject,
      name: subject,
      createdAt: Date.now(),
      accountType: opts.anonymous ? "anonymous" : "permanent",
      ...(opts.email !== undefined ? { email: opts.email } : {}),
    })
  );

async function joinTeam(t: T, teamId: Id<"teams">, subject: string) {
  const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
  await as(t, subject).mutation(api.teams.joinByInvite, { inviteToken: team.inviteToken });
}

const joinRoom = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/**
 * A Team of three permanent accounts with addresses — admin (the retro's
 * owner) and members sam and kim — plus an anonymous guest; a retro by
 * admin that sam, kim and the guest attend.
 */
async function seedTeamRetro(t: T, opts: { teamless?: boolean } = {}) {
  const users = {
    admin: await seedUser(t, "admin", { email: "admin@example.com" }),
    sam: await seedUser(t, "sam", { email: "sam@example.com" }),
    kim: await seedUser(t, "kim", { email: "kim@example.com" }),
    guest: await seedUser(t, "guest", { anonymous: true }),
  };
  const teamId = await as(t, "admin").mutation(api.teams.create, { name: "Acme Squad" });
  for (const subject of ["sam", "kim"]) await joinTeam(t, teamId, subject);
  const roomId = await as(t, "admin").mutation(api.retro.create, {
    name: "Sprint 12",
    formatName: DEFAULT_RETRO_FORMAT.name,
    ...(opts.teamless ? {} : { teamId }),
  });
  for (const subject of ["sam", "kim", "guest"]) await joinRoom(t, roomId, subject);
  return { teamId, roomId, users };
}

/** A `_scheduled_functions` row for `email:sendReminder`. */
type ScheduledReminder = {
  _id: Id<"_scheduled_functions">;
  scheduledTime: number;
  state: { kind: string };
  args: unknown[];
};

/** Every reminder job ever scheduled, oldest first, whatever its state. */
const reminderJobs = (t: T): Promise<ScheduledReminder[]> =>
  t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs.filter((j) => j.name === "email:sendReminder") as ScheduledReminder[];
  });

/** Wait for a real-timer job to run and settle; the due-date job needs an instant only just ahead. */
async function drainScheduled(t: T): Promise<void> {
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await t.finishInProgressScheduledFunctions();
    const jobs = await reminderJobs(t);
    if (!jobs.some((j) => j.state.kind === "pending" || j.state.kind === "inProgress")) return;
  }
  throw new Error("scheduled reminders did not drain");
}

const jobsOfKind = async (t: T, kind: "ownerAssigned" | "dueToday") =>
  (await reminderJobs(t)).filter((j) => (j.args[0] as { kind: string }).kind === kind);

/**
 * Take the `runAfter(0)` assignment sends off the clock so a test drives
 * them by hand (convex-test fires them through a real timer). The due-date
 * jobs are days ahead and stay as they are, so their state can be read.
 */
async function holdAssignmentSends(t: T) {
  await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    for (const job of jobs) {
      const kind = (job.args[0] as { kind?: string } | undefined)?.kind;
      if (job.name === "email:sendReminder" && kind === "ownerAssigned" && job.state.kind === "pending") {
        await ctx.scheduler.cancel(job._id);
      }
    }
  });
}

const row = (t: T, id: Id<"retroActions">) => t.run((ctx) => ctx.db.get(id));

const jobState = (t: T, id: Id<"_scheduled_functions">) =>
  t.run(async (ctx) => (await ctx.db.system.get(id))!.state.kind);

/** Every Resend call made so far, parsed. */
type Sent = { to: string; subject: string; html: string; reply_to?: string; headers?: Record<string, string> };
const fetchMock = vi.fn<typeof fetch>();
function sent(): Sent[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Sent);
}

// 2026-09-05 12:00 UTC: "today" for every due-date test below.
const NOW = Date.UTC(2026, 8, 5, 12);
const TOMORROW_AFTERNOON = Date.UTC(2026, 8, 6, 15, 30);
const TOMORROW_REMINDER = Date.UTC(2026, 8, 6, DUE_TODAY_HOUR_UTC);
const IN_THREE_DAYS = Date.UTC(2026, 8, 8, 9);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.RESEND_API_KEY = "re_test";
  process.env.UNSUBSCRIBE_SECRET = "test-unsubscribe-secret";
  process.env.SITE_URL = "https://agilekit.test";
  process.env.CONVEX_SITE_URL = "https://deployment.convex.site";
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("dueTodayInstant — 08:00 UTC on the UTC calendar date", () => {
  it("lands on the same UTC date whatever the hour of dueAt", () => {
    expect(DUE_TODAY_HOUR_UTC).toBe(8);
    expect(dueTodayInstant(Date.UTC(2026, 8, 10, 23, 30))).toBe(Date.UTC(2026, 8, 10, 8));
    expect(dueTodayInstant(Date.UTC(2026, 8, 10, 0, 0))).toBe(Date.UTC(2026, 8, 10, 8));
    expect(dueTodayInstant(Date.UTC(2026, 8, 10, 8))).toBe(Date.UTC(2026, 8, 10, 8));
  });
});

describe("owner assigned — one send per assignment by someone else", () => {
  it("assigning another person schedules one send naming the item, the owner and the assigner", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    const id = await as(t, "admin").mutation(api.retro.createAction, { roomId, text: "Fix the build" });

    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId: users.sam });
    await holdAssignmentSends(t);

    const jobs = await jobsOfKind(t, "ownerAssigned");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toEqual({ kind: "ownerAssigned", actionId: id, ownerId: users.sam, senderId: users.admin });
    expect(jobs[0].scheduledTime).toBeLessThanOrEqual(Date.now());
  });

  it("creating an item already owned by someone else counts as an assignment", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    const id = await as(t, "admin").mutation(api.retro.createAction, { roomId, text: "Fix", ownerId: users.sam });
    await holdAssignmentSends(t);
    const jobs = await jobsOfKind(t, "ownerAssigned");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({ actionId: id, ownerId: users.sam, senderId: users.admin });
  });

  it("self-assignment, unassignment and re-stating the same owner schedule nothing", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    const own = await as(t, "admin").mutation(api.retro.createAction, { roomId, text: "Mine", ownerId: users.admin });
    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: own, ownerId: users.admin });
    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: own });
    expect(await jobsOfKind(t, "ownerAssigned")).toHaveLength(0);

    const theirs = await as(t, "admin").mutation(api.retro.createAction, { roomId, text: "Theirs", ownerId: users.sam });
    await holdAssignmentSends(t);
    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: theirs, ownerId: users.sam });
    await holdAssignmentSends(t);
    expect(await jobsOfKind(t, "ownerAssigned")).toHaveLength(1);
  });

  it("reassigning away and back sends again: no stored dedupe", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    const id = await as(t, "admin").mutation(api.retro.createAction, { roomId, text: "Fix" });
    for (const ownerId of [users.sam, users.kim, users.sam]) {
      await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId });
      await holdAssignmentSends(t);
    }
    const owners = (await jobsOfKind(t, "ownerAssigned")).map((j) => (j.args[0] as { ownerId: string }).ownerId);
    expect(owners).toEqual([users.sam, users.kim, users.sam]);
  });
});

describe("due today — scheduled at 08:00 UTC on the due date", () => {
  async function seedOwnedItem(t: T, extra: { dueAt?: number } = {}) {
    const seeded = await seedTeamRetro(t);
    const id = await as(t, "admin").mutation(api.retro.createAction, {
      roomId: seeded.roomId,
      text: "Fix the build",
      ownerId: seeded.users.sam,
      ...extra,
    });
    await holdAssignmentSends(t);
    return { ...seeded, id };
  }

  it("a due date on an open, owned item schedules one job at 08:00 UTC of that date and stores its id", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedOwnedItem(t);
    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, dueAt: TOMORROW_AFTERNOON });

    const jobs = await jobsOfKind(t, "dueToday");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].scheduledTime).toBe(TOMORROW_REMINDER);
    expect(jobs[0].state.kind).toBe("pending");
    expect(jobs[0].args[0]).toEqual({ kind: "dueToday", actionId: id });
    expect((await row(t, id))!.reminderJobId).toBe(jobs[0]._id);
  });

  it("a date given at creation schedules the same way", async () => {
    const t = convexTest(schema, modules);
    const { id } = await seedOwnedItem(t, { dueAt: TOMORROW_AFTERNOON });
    const jobs = await jobsOfKind(t, "dueToday");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].scheduledTime).toBe(TOMORROW_REMINDER);
    expect((await row(t, id))!.reminderJobId).toBe(jobs[0]._id);
  });

  it("a past instant schedules nothing: a date earlier today, or before today", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedOwnedItem(t);
    // NOW is 12:00 UTC today; 08:00 today has passed.
    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, dueAt: Date.UTC(2026, 8, 5, 18) });
    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, dueAt: Date.UTC(2026, 8, 1) });
    expect(await jobsOfKind(t, "dueToday")).toHaveLength(0);
    expect((await row(t, id))!.reminderJobId).toBeUndefined();
  });

  it("an unowned item with a date schedules nothing until it is owned", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    const id = await as(t, "admin").mutation(api.retro.createAction, { roomId, text: "Fix", dueAt: TOMORROW_AFTERNOON });
    expect(await jobsOfKind(t, "dueToday")).toHaveLength(0);
    expect((await row(t, id))!.reminderJobId).toBeUndefined();

    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId: users.sam });
    await holdAssignmentSends(t);
    const jobs = await jobsOfKind(t, "dueToday");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].scheduledTime).toBe(TOMORROW_REMINDER);
    expect((await row(t, id))!.reminderJobId).toBe(jobs[0]._id);
  });

  it("changing the date cancels the job and schedules a new one at the new instant", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedOwnedItem(t, { dueAt: TOMORROW_AFTERNOON });
    const first = (await row(t, id))!.reminderJobId!;

    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, dueAt: IN_THREE_DAYS });

    expect(await jobState(t, first)).toBe("canceled");
    const second = (await row(t, id))!.reminderJobId!;
    expect(second).not.toBe(first);
    const jobs = await jobsOfKind(t, "dueToday");
    expect(jobs.find((j) => j._id === second)).toMatchObject({
      scheduledTime: Date.UTC(2026, 8, 8, DUE_TODAY_HOUR_UTC),
      state: { kind: "pending" },
    });
  });

  it("clearing the date, or moving it into the past, cancels the job and schedules nothing", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedOwnedItem(t, { dueAt: TOMORROW_AFTERNOON });
    const first = (await row(t, id))!.reminderJobId!;
    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, dueAt: null });
    expect(await jobState(t, first)).toBe("canceled");
    expect((await row(t, id))!.reminderJobId).toBeUndefined();

    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, dueAt: TOMORROW_AFTERNOON });
    const second = (await row(t, id))!.reminderJobId!;
    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, dueAt: Date.UTC(2026, 8, 1) });
    expect(await jobState(t, second)).toBe("canceled");
    expect((await row(t, id))!.reminderJobId).toBeUndefined();
  });

  it("changing the owner reschedules; unassigning cancels", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users, id } = await seedOwnedItem(t, { dueAt: TOMORROW_AFTERNOON });
    const first = (await row(t, id))!.reminderJobId!;

    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId: users.kim });
    await holdAssignmentSends(t);
    expect(await jobState(t, first)).toBe("canceled");
    const second = (await row(t, id))!.reminderJobId!;
    expect(second).not.toBe(first);
    expect(await jobState(t, second)).toBe("pending");

    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: id });
    expect(await jobState(t, second)).toBe("canceled");
    expect((await row(t, id))!.reminderJobId).toBeUndefined();
  });

  it("completing or dropping cancels; reopening reschedules", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedOwnedItem(t, { dueAt: TOMORROW_AFTERNOON });
    const first = (await row(t, id))!.reminderJobId!;

    await as(t, "sam").mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "done" });
    expect(await jobState(t, first)).toBe("canceled");
    expect((await row(t, id))!.reminderJobId).toBeUndefined();

    await as(t, "sam").mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "open" });
    const second = (await row(t, id))!.reminderJobId!;
    expect(await jobState(t, second)).toBe("pending");

    await as(t, "sam").mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "dropped" });
    expect(await jobState(t, second)).toBe("canceled");
    expect((await row(t, id))!.reminderJobId).toBeUndefined();
  });

  it("an edit that touches only the text leaves the job as it is", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedOwnedItem(t, { dueAt: TOMORROW_AFTERNOON });
    const first = (await row(t, id))!.reminderJobId!;
    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, text: "Fix the build, properly" });
    expect((await row(t, id))!.reminderJobId).toBe(first);
    expect(await jobState(t, first)).toBe("pending");
    expect(await jobsOfKind(t, "dueToday")).toHaveLength(1);
  });

  it("deleting the item cancels its job", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedOwnedItem(t, { dueAt: TOMORROW_AFTERNOON });
    const first = (await row(t, id))!.reminderJobId!;
    await as(t, "admin").mutation(api.retro.deleteAction, { roomId, actionId: id });
    expect(await row(t, id)).toBeNull();
    expect(await jobState(t, first)).toBe("canceled");
  });

  it("once the job has run, a later change leaves that job as it is and schedules the next", async () => {
    const t = convexTest(schema, modules);
    // Just before 08:00 on the due date, so the job's timer is a few hundred ms away.
    vi.setSystemTime(TOMORROW_REMINDER - 400);
    const { roomId, id } = await seedOwnedItem(t, { dueAt: TOMORROW_AFTERNOON });
    const first = (await row(t, id))!.reminderJobId!;

    await drainScheduled(t);
    expect(await jobState(t, first)).toBe("success");
    expect(sent().map((m) => [m.to, m.subject])).toEqual([["sam@example.com", "Your action item is due today"]]);

    vi.setSystemTime(TOMORROW_REMINDER + 60_000);
    await as(t, "sam").mutation(api.retro.updateAction, { roomId, actionId: id, dueAt: IN_THREE_DAYS });

    expect(await jobState(t, first)).toBe("success");
    const second = (await row(t, id))!.reminderJobId!;
    expect(second).not.toBe(first);
    expect(await jobState(t, second)).toBe("pending");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("email.sendReminder — what fires, to whom, and what it says", () => {
  async function seedAssigned(t: T, opts: { teamless?: boolean; dueAt?: number } = {}) {
    const seeded = await seedTeamRetro(t, { teamless: opts.teamless });
    const id = await as(t, "admin").mutation(api.retro.createAction, {
      roomId: seeded.roomId,
      text: "Fix the flaky build <script>",
      ownerId: seeded.users.sam,
      ...(opts.dueAt !== undefined ? { dueAt: opts.dueAt } : {}),
    });
    await holdAssignmentSends(t);
    const [assignment] = await jobsOfKind(t, "ownerAssigned");
    return { ...seeded, id, assignmentArgs: assignment.args[0] as never };
  }

  const fireDueToday = (t: T, actionId: Id<"retroActions">) =>
    t.action(internal.email.sendReminder, { kind: "dueToday", actionId });

  it("owner assigned: one email to the owner with the text, the assigner, the due date and the link; no reply-to", async () => {
    const t = convexTest(schema, modules);
    const { roomId, assignmentArgs } = await seedAssigned(t, { dueAt: TOMORROW_AFTERNOON });

    await t.action(internal.email.sendReminder, assignmentArgs);

    const messages = sent();
    expect(messages).toHaveLength(1);
    const [m] = messages;
    expect(m.to).toBe("sam@example.com");
    expect(m.subject).toContain("admin");
    expect(m.html).toContain("Fix the flaky build &lt;script&gt;");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("admin");
    expect(m.html).toContain("Sprint 12");
    expect(m.html).toContain("6 September 2026");
    expect(m.html).toContain(`https://agilekit.test/room/${roomId}`);
    expect(m.reply_to).toBeUndefined();
    expect(m.html).not.toContain("Reply to this email");
    expect(m.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.headers!["List-Unsubscribe"]).toMatch(/^<https:\/\/deployment\.convex\.site\/api\/unsubscribe\?token=.+>$/);
    expect(m.html).toContain("https://agilekit.test/unsubscribe?token=");
  });

  it("owner assigned: says there is no date when none is set, and never emails the assigner", async () => {
    const t = convexTest(schema, modules);
    const { assignmentArgs } = await seedAssigned(t);
    await t.action(internal.email.sendReminder, assignmentArgs);
    const [m] = sent();
    expect(m.to).toBe("sam@example.com");
    expect(m.html).not.toContain("Due ");
    expect(sent().map((x) => x.to)).not.toContain("admin@example.com");
  });

  it("owner assigned: sends nothing when the owner has changed since, or the item is gone", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users, id, assignmentArgs } = await seedAssigned(t);
    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId: users.kim });
    await holdAssignmentSends(t);
    await t.action(internal.email.sendReminder, assignmentArgs);
    await as(t, "admin").mutation(api.retro.deleteAction, { roomId, actionId: id });
    await t.action(internal.email.sendReminder, assignmentArgs);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("due today: one email to the owner with the text, the retro and the link; no reply-to", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedAssigned(t, { dueAt: TOMORROW_AFTERNOON });
    vi.setSystemTime(TOMORROW_REMINDER);

    await fireDueToday(t, id);

    const messages = sent();
    expect(messages).toHaveLength(1);
    const [m] = messages;
    expect(m.to).toBe("sam@example.com");
    expect(m.subject.toLowerCase()).toContain("due today");
    expect(m.html).toContain("Fix the flaky build &lt;script&gt;");
    expect(m.html).toContain("Sprint 12");
    expect(m.html).toContain("Acme Squad");
    expect(m.html).toContain(`https://agilekit.test/room/${roomId}`);
    expect(m.reply_to).toBeUndefined();
    expect(m.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.html).toContain("https://agilekit.test/unsubscribe?token=");
  });

  it("due today: a job firing for a missing, closed or unowned item sends nothing", async () => {
    const t = convexTest(schema, modules);
    const { id } = await seedAssigned(t, { dueAt: TOMORROW_AFTERNOON });

    await t.run((ctx) => ctx.db.patch(id, { status: "done" }));
    await fireDueToday(t, id);
    await t.run((ctx) => ctx.db.patch(id, { status: "open", ownerId: undefined }));
    await fireDueToday(t, id);
    await t.run((ctx) => ctx.db.delete(id));
    await fireDueToday(t, id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("due today: a room deleted by the cascade, or a teamless retro, sends nothing", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id } = await seedAssigned(t, { dueAt: TOMORROW_AFTERNOON });
    await t.run((ctx) => ctx.db.delete(roomId));
    await fireDueToday(t, id);

    const t2 = convexTest(schema, modules);
    const teamless = await seedAssigned(t2, { teamless: true, dueAt: TOMORROW_AFTERNOON });
    await fireDueToday(t2, teamless.id);
    await t2.action(internal.email.sendReminder, teamless.assignmentArgs);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects the channel's send-time filter: opted out, address-less, deleted or no longer a team member", async () => {
    const t = convexTest(schema, modules);
    const { roomId, teamId, users, id } = await seedAssigned(t, { dueAt: TOMORROW_AFTERNOON });

    await as(t, "sam").mutation(api.users.setEmailOptOut, { optOut: true });
    await fireDueToday(t, id);
    await as(t, "sam").mutation(api.users.setEmailOptOut, { optOut: false });
    await as(t, "sam").mutation(api.teams.leave, { teamId });
    await fireDueToday(t, id);
    await joinTeam(t, teamId, "sam");
    await t.run((ctx) => ctx.db.patch(users.sam, { email: undefined }));
    await fireDueToday(t, id);
    await t.run((ctx) => ctx.db.delete(users.sam));
    await fireDueToday(t, id);
    expect(fetchMock).not.toHaveBeenCalled();

    // An anonymous owner has no address and gets nothing, silently.
    await as(t, "admin").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId: users.guest });
    await holdAssignmentSends(t);
    const [assignment] = (await jobsOfKind(t, "ownerAssigned")).slice(-1);
    await t.action(internal.email.sendReminder, assignment.args[0] as never);
    await fireDueToday(t, id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never patches lastActivityAt", async () => {
    const t = convexTest(schema, modules);
    const { roomId, id, assignmentArgs } = await seedAssigned(t, { dueAt: TOMORROW_AFTERNOON });
    const stale = NOW - 3 * 60 * 60 * 1000;
    await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));

    await t.action(internal.email.sendReminder, assignmentArgs);
    await fireDueToday(t, id);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await t.run((ctx) => ctx.db.get(roomId)))!.lastActivityAt).toBe(stale);
  });
});
