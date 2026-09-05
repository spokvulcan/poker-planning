/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { NUDGE_WINDOW_MS } from "./model/retroNudge";
import type { T } from "./analytics.seeds";

// The nudge (spec §16.2, ADR-0020): a human act by a `stageFlow` holder on
// a team retro while the shared pointer is in `collect`, at most once a
// day per retro. The mutation records intent (`lastNudge`) and schedules
// the send; the action resolves recipients at send time and never touches
// the room.

const modules = import.meta.glob("./**/*.*s");

const as = (t: T, subject: string) => t.withIdentity({ subject });

const seedUser = (t: T, subject: string, email?: string) =>
  t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId: subject,
      name: subject,
      createdAt: Date.now(),
      accountType: "permanent",
      ...(email !== undefined ? { email } : {}),
    })
  );

async function joinTeam(t: T, teamId: Id<"teams">, subject: string) {
  const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
  await as(t, subject).mutation(api.teams.joinByInvite, { inviteToken: team.inviteToken });
}

/**
 * A Team of four permanent accounts with addresses — admin, and members
 * sam, kim, lee — and a retro by admin (owner, so `stageFlow`). Only the
 * creator has joined the room; that is the point of a nudge.
 */
async function seedTeamRetro(
  t: T,
  opts: { attribution?: "named" | "anonymous"; teamless?: boolean; emailTeam?: boolean } = {}
) {
  const users = {
    admin: await seedUser(t, "admin", "admin@example.com"),
    sam: await seedUser(t, "sam", "sam@example.com"),
    kim: await seedUser(t, "kim", "kim@example.com"),
    lee: await seedUser(t, "lee", "lee@example.com"),
  };
  const teamId = await as(t, "admin").mutation(api.teams.create, { name: "Acme Squad" });
  for (const subject of ["sam", "kim", "lee"]) await joinTeam(t, teamId, subject);
  if (opts.attribution) {
    const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
    await as(t, "admin").mutation(api.teams.updateRetroDefaults, {
      teamId,
      retroDefaults: { ...team.retroDefaults, attribution: opts.attribution },
    });
  }
  const roomId = await as(t, "admin").mutation(api.retro.create, {
    name: "Sprint 12",
    formatName: DEFAULT_RETRO_FORMAT.name,
    ...(opts.teamless ? {} : { teamId }),
    ...(opts.emailTeam !== undefined ? { emailTeam: opts.emailTeam } : {}),
  });
  await holdSends(t);
  return { teamId, roomId, users };
}

const retroRow = (t: T, roomId: Id<"rooms">) =>
  t.run((ctx) =>
    ctx.db
      .query("retros")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .unique()
  );

const scheduledSends = (t: T) =>
  t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs.filter((j) => j.name.endsWith(":send"));
  });

/**
 * Take the scheduled send off the clock so the test drives it by hand:
 * convex-test fires a runAfter(0) through a real timer, which would race
 * the state a test changes "between click and delivery".
 */
async function holdSends(t: T) {
  await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    for (const job of jobs) {
      if (job.name.endsWith(":send") && job.state.kind === "pending") await ctx.scheduler.cancel(job._id);
    }
  });
}

async function press(t: T, subject: string, roomId: Id<"rooms">) {
  await as(t, subject).mutation(api.retro.nudge, { roomId });
  await holdSends(t);
}

async function joinRoom(t: T, roomId: Id<"rooms">, subject: string) {
  await as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });
}

async function writeCard(t: T, roomId: Id<"rooms">, subject: string, text: string) {
  const retro = (await retroRow(t, roomId))!;
  return as(t, subject).mutation(api.retro.createCard, {
    roomId,
    clientId: `${subject}-${text}`,
    text,
    promptId: retro.format.prompts[0].id,
    position: { x: 0, y: 0 },
  });
}

/** Every Resend call made so far, parsed. */
type Sent = { to: string; subject: string; html: string; reply_to?: string; headers?: Record<string, string> };
const fetchMock = vi.fn<typeof fetch>();
function sent(): Sent[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Sent);
}

beforeEach(() => {
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

describe("retro.nudge — who may press it, and when", () => {
  it("records lastNudge, schedules one send, and bumps activity", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    const stale = Date.now() - 2 * 60 * 60 * 1000;
    await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));

    await press(t, "admin", roomId);

    const retro = (await retroRow(t, roomId))!;
    expect(retro.lastNudge?.by).toBe(users.admin);
    expect(retro.lastNudge!.at).toBeGreaterThan(stale);
    const jobs = await scheduledSends(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toEqual({ kind: "nudge", roomId, senderId: users.admin });
    expect((await t.run((ctx) => ctx.db.get(roomId)))!.lastActivityAt).toBeGreaterThan(stale);
  });

  it("is refused with `budget` inside 24 hours, and the first lastNudge stands", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);
    await press(t, "admin", roomId);
    const first = (await retroRow(t, roomId))!.lastNudge!;

    vi.setSystemTime(Date.now() + NUDGE_WINDOW_MS - 60_000);
    await expect(as(t, "admin").mutation(api.retro.nudge, { roomId })).rejects.toMatchObject({
      data: { code: "budget" },
    });
    expect((await retroRow(t, roomId))!.lastNudge).toEqual(first);
    expect(await scheduledSends(t)).toHaveLength(1);

    vi.setSystemTime(first.at + NUDGE_WINDOW_MS + 1000);
    await press(t, "admin", roomId);
    expect((await retroRow(t, roomId))!.lastNudge!.at).toBeGreaterThan(first.at);
  });

  it("is refused with `forbidden` on a teamless retro", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, { teamless: true });
    await expect(as(t, "admin").mutation(api.retro.nudge, { roomId })).rejects.toMatchObject({
      data: { code: "forbidden" },
    });
    expect((await retroRow(t, roomId))!.lastNudge).toBeUndefined();
  });

  it("is refused with `stage` once the shared pointer has left collect", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);
    const retro = (await retroRow(t, roomId))!;
    await as(t, "admin").mutation(api.retro.advance, { roomId, toStageId: retro.stages[1].id });
    await expect(as(t, "admin").mutation(api.retro.nudge, { roomId })).rejects.toMatchObject({
      data: { code: "stage" },
    });
  });

  it("is refused for a participant without stageFlow", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);
    await joinRoom(t, roomId, "sam");
    await expect(as(t, "sam").mutation(api.retro.nudge, { roomId })).rejects.toThrow(
      "Only facilitators and the owner"
    );
    expect(await scheduledSends(t)).toHaveLength(0);
  });
});

/** Run the send action for the last scheduled job's arguments, as the scheduler would have. */
async function runSend(t: T) {
  const jobs = await scheduledSends(t);
  const job = jobs[jobs.length - 1];
  await t.action(internal.email.send, job.args[0] as never);
}

describe("email.send — recipients in both attribution modes", () => {
  it("named: every team member with no card, never the sender, never a room attendee outside the team", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);
    await seedUser(t, "guest", "guest@example.com");
    await joinRoom(t, roomId, "guest");
    await joinRoom(t, roomId, "sam");
    await writeCard(t, roomId, "sam", "We shipped");
    await writeCard(t, roomId, "admin", "Retro went long");

    await press(t, "admin", roomId);
    await runSend(t);

    expect(sent().map((m) => m.to).sort()).toEqual(["kim@example.com", "lee@example.com"]);
  });

  it("anonymous: every team member except the sender, whoever has written", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, { attribution: "anonymous" });
    await joinRoom(t, roomId, "sam");
    await writeCard(t, roomId, "sam", "We shipped");

    await press(t, "admin", roomId);
    await runSend(t);

    expect(sent().map((m) => m.to).sort()).toEqual(["kim@example.com", "lee@example.com", "sam@example.com"]);
  });

  it("one Resend call per recipient, reply-to the sender, from AgileKit", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);
    await press(t, "admin", roomId);
    await runSend(t);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("https://api.resend.com/emails");
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
      const body = JSON.parse(String(init!.body));
      expect(body.from).toBe("AgileKit <noreply@agilekit.app>");
      expect(body.reply_to).toBe("admin@example.com");
    }
  });
});

describe("email.send — what a body says and never says", () => {
  it("names the retro, team, format, count, due date, sender and link; never card text or a non-writer", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);
    await as(t, "admin").mutation(api.retro.setCollectUntil, { roomId, collectUntil: Date.UTC(2026, 8, 30) });
    await joinRoom(t, roomId, "sam");
    await writeCard(t, roomId, "sam", "SECRET-CARD-TEXT");
    await writeCard(t, roomId, "admin", "ANOTHER-SECRET");

    await press(t, "admin", roomId);
    await runSend(t);

    const messages = sent();
    expect(messages).toHaveLength(2);
    for (const m of messages) {
      expect(m.subject).toContain("Sprint 12");
      expect(m.html).toContain("Sprint 12");
      expect(m.html).toContain("Acme Squad");
      expect(m.html).toContain(DEFAULT_RETRO_FORMAT.name);
      expect(m.html).toContain("2 cards so far");
      expect(m.html).toContain("30 September 2026");
      expect(m.html).toContain("admin");
      expect(m.html).toContain(`https://agilekit.test/room/${roomId}`);
      expect(m.html).not.toContain("SECRET-CARD-TEXT");
      expect(m.html).not.toContain("ANOTHER-SECRET");
      // Neither non-writer is named to the other, and the writer is not named either.
      expect(m.html).not.toContain("kim");
      expect(m.html).not.toContain("lee");
      expect(m.html).not.toContain("sam");
    }
  });

  it("anonymous bodies carry the same facts and no name but the sender's", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, { attribution: "anonymous" });
    await joinRoom(t, roomId, "sam");
    await writeCard(t, roomId, "sam", "SECRET-CARD-TEXT");

    await press(t, "admin", roomId);
    await runSend(t);

    for (const m of sent()) {
      expect(m.html).toContain("1 card so far");
      expect(m.html).not.toContain("SECRET-CARD-TEXT");
      expect(m.html).not.toContain("sam");
      expect(m.html).not.toContain("kim");
    }
  });
});

describe("email.send — unsubscribe headers and the magic link", () => {
  it("every nudge carries both RFC 8058 headers and a footer link for its own recipient", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    await press(t, "admin", roomId);
    await runSend(t);

    const kim = sent().find((m) => m.to === "kim@example.com")!;
    expect(kim.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const header = kim.headers!["List-Unsubscribe"];
    expect(header).toMatch(/^<https:\/\/deployment\.convex\.site\/api\/unsubscribe\?token=.+>$/);
    const token = decodeURIComponent(header.slice(header.indexOf("token=") + 6, -1));
    expect(token.startsWith(`${users.kim}.`)).toBe(true);
    expect(kim.html).toContain(`https://agilekit.test/unsubscribe?token=${encodeURIComponent(token)}`);
    // The header token really unsubscribes kim, and only kim.
    expect(await t.mutation(api.email.unsubscribe, { token })).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(users.kim)))!.emailOptOut).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(users.lee)))!.emailOptOut).toBeUndefined();
  });

  it("the magic link reaches an opted-out address and carries no unsubscribe headers", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        authUserId: "x",
        name: "X",
        email: "x@example.com",
        emailOptOut: true,
        accountType: "permanent",
        createdAt: Date.now(),
      });
      return id;
    });

    await t.action(internal.email.sendMagicLinkEmail, { to: "x@example.com", url: "https://agilekit.test/auth/magic?x=1" });

    const [m] = sent();
    expect(m.to).toBe("x@example.com");
    expect(m.subject).toBe("Sign in to AgileKit");
    expect(m.html).toContain("https://agilekit.test/auth/magic?x=1");
    expect(m.headers!["List-Unsubscribe"]).toBeUndefined();
    expect(m.headers!["List-Unsubscribe-Post"]).toBeUndefined();
    expect(m.html).not.toContain("/unsubscribe");
  });
});

describe("email.send — recipients are resolved at send time", () => {
  it("skips anyone opted out, deleted, address-less or no longer a team member, though all were in the set at click time", async () => {
    const t = convexTest(schema, modules);
    const { roomId, teamId, users } = await seedTeamRetro(t);
    const nomail = await seedUser(t, "nomail");
    await joinTeam(t, teamId, "nomail");
    const leaver = await seedUser(t, "leaver", "leaver@example.com");
    await joinTeam(t, teamId, "leaver");
    expect((await as(t, "admin").query(api.retro.nudgeStatus, { roomId }))!.recipientCount).toBe(5);

    await press(t, "admin", roomId);

    // Between click and delivery: sam opts out, kim is deleted, leaver leaves.
    await as(t, "sam").mutation(api.users.setEmailOptOut, { optOut: true });
    await t.run((ctx) => ctx.db.delete(users.kim));
    await as(t, "leaver").mutation(api.teams.leave, { teamId });
    await runSend(t);

    expect(sent().map((m) => m.to)).toEqual(["lee@example.com"]);
    void nomail;
    void leaver;
  });

  it("a send whose room is gone, or that became teamless, emails nobody and never throws", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    await press(t, "admin", roomId);
    await t.run((ctx) => ctx.db.patch(roomId, { teamId: undefined }));
    await t.action(internal.email.send, { kind: "nudge", roomId, senderId: users.admin });
    await t.run((ctx) => ctx.db.delete(roomId));
    await t.action(internal.email.send, { kind: "nudge", roomId, senderId: users.admin });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("one recipient's failure costs nobody else theirs, and is thrown at the end", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);
    await press(t, "admin", roomId);
    fetchMock.mockImplementation(async (_url, init) => {
      const { to } = JSON.parse(String(init?.body));
      return to === "kim@example.com"
        ? new Response("bounced", { status: 422 })
        : new Response("{}", { status: 200 });
    });

    await expect(runSend(t)).rejects.toThrow(/1 of 3 sends failed/);
    expect(sent().map((m) => m.to).sort()).toEqual(["kim@example.com", "lee@example.com", "sam@example.com"]);
  });

  it("says \"reply to reach them\" only when a reply-to is set", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    await t.run((ctx) => ctx.db.patch(users.admin, { email: undefined }));
    await press(t, "admin", roomId);
    await runSend(t);
    for (const m of sent()) {
      expect(m.reply_to).toBeUndefined();
      expect(m.html).not.toContain("Reply to this email");
    }
  });

  it("never patches lastActivityAt", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);
    await press(t, "admin", roomId);
    const stale = Date.now() - 3 * 60 * 60 * 1000;
    await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));

    await runSend(t);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((await t.run((ctx) => ctx.db.get(roomId)))!.lastActivityAt).toBe(stale);
  });
});

describe("retro.create — the \"it's open\" email", () => {
  it("with the box ticked on a team retro: every member except the creator, and lastNudge set", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t, { emailTeam: true });

    const retro = (await retroRow(t, roomId))!;
    expect(retro.lastNudge?.by).toBe(users.admin);
    const jobs = await scheduledSends(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toEqual({ kind: "retroOpen", roomId, senderId: users.admin });

    await runSend(t);
    expect(sent().map((m) => m.to).sort()).toEqual(["kim@example.com", "lee@example.com", "sam@example.com"]);
    for (const m of sent()) {
      expect(m.subject).toBe("Sprint 12 is open for cards");
      expect(m.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(m.headers!["List-Unsubscribe"]).toMatch(/^<https:\/\/deployment\.convex\.site\/api\/unsubscribe\?token=.+>$/);
      expect(m.html).toContain("https://agilekit.test/unsubscribe?token=");
    }
  });

  it("counts as the first nudge: a press right after is refused with `budget`", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t, { emailTeam: true });
    await expect(as(t, "admin").mutation(api.retro.nudge, { roomId })).rejects.toMatchObject({
      data: { code: "budget" },
    });
  });

  it("with the box unticked, or on a teamless retro, nothing is scheduled and lastNudge stays unset", async () => {
    const t = convexTest(schema, modules);
    const a = await seedTeamRetro(t, { emailTeam: false });
    expect((await retroRow(t, a.roomId))!.lastNudge).toBeUndefined();

    const t2 = convexTest(schema, modules);
    const b = await seedTeamRetro(t2, { teamless: true, emailTeam: true });
    expect((await retroRow(t2, b.roomId))!.lastNudge).toBeUndefined();
    expect(await scheduledSends(t2)).toHaveLength(0);
  });
});

describe("retro.nudgeStatus — what the button reads", () => {
  it("counts recipients from the viewer's seat and names the last sender; null for a teamless retro", async () => {
    const t = convexTest(schema, modules);
    const { roomId, users } = await seedTeamRetro(t);
    await joinRoom(t, roomId, "sam");
    await writeCard(t, roomId, "sam", "x");

    expect(await as(t, "admin").query(api.retro.nudgeStatus, { roomId })).toEqual({
      recipientCount: 2,
      lastNudge: null,
    });
    // sam, a participant, holds no stageFlow and is told nothing.
    await expect(as(t, "sam").query(api.retro.nudgeStatus, { roomId })).rejects.toThrow(
      "Only facilitators and the owner"
    );
    // From a facilitator's seat: admin has not written, sam is the sender.
    await as(t, "admin").mutation(api.roles.promoteFacilitator, { roomId, targetUserId: users.sam });
    expect((await as(t, "sam").query(api.retro.nudgeStatus, { roomId }))!.recipientCount).toBe(3);

    await press(t, "admin", roomId);
    const status = (await as(t, "admin").query(api.retro.nudgeStatus, { roomId }))!;
    expect(status.lastNudge).toMatchObject({ byName: "admin" });
    await t.run((ctx) => ctx.db.delete(users.admin));
    expect((await as(t, "sam").query(api.retro.nudgeStatus, { roomId }))!.lastNudge!.byName).toBe("Former member");

    const t2 = convexTest(schema, modules);
    const teamless = await seedTeamRetro(t2, { teamless: true });
    expect(await as(t2, "admin").query(api.retro.nudgeStatus, { roomId: teamless.roomId })).toBeNull();
  });
});
