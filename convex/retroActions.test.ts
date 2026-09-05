/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { DEFAULT_RETRO_PERMISSIONS } from "./permissions";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";
import { FORMER_MEMBER, UNOWNED_ACTION } from "./retroCopy";
import { MAX_REVIEW_ROWS } from "./model/retroActions";
import * as Users from "./model/users";

// Action items (spec §13, ADR-0017): a short text with at most one named
// owner, an optional date and an optional source topic, living in exactly
// one retro and carried over by staying open. Creation is never refused;
// the owner may always edit, complete, drop or reopen their own; anyone
// `actionManagement` allows may do so to another's, assign, and delete.

const modules = import.meta.glob("./**/*.*s");

const seedUser = (t: T, authUserId: string, accountType?: "anonymous" | "permanent") =>
  seedNamedUser(t, authUserId, authUserId, accountType);
const as = (t: T, subject: string) => t.withIdentity({ subject });

async function retroRow(t: T, roomId: Id<"rooms">) {
  return (await t.run((ctx) =>
    ctx.db
      .query("retros")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .unique()
  ))!;
}

/** The refusal's code, or undefined for a plain error. */
async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return "resolved";
  } catch (error) {
    return error instanceof ConvexError ? (error.data as { code: string }).code : undefined;
  }
}

const createRetro = (t: T, subject: string, args: { teamId?: Id<"teams">; name?: string } = {}) =>
  as(t, subject).mutation(api.retro.create, {
    name: args.name ?? "R",
    formatName: DEFAULT_RETRO_FORMAT.name,
    ...(args.teamId ? { teamId: args.teamId } : {}),
  });

const joinRoom = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/**
 * A teamless retro at `collect` with an owner and a guest (anonymous) who
 * attends, and the stage ids by kind.
 */
async function seedRetro(t: T) {
  const ownerId = await seedUser(t, "owner");
  const guestId = await seedUser(t, "guest", "anonymous");
  const roomId = await createRetro(t, "owner");
  await joinRoom(t, roomId, "guest");
  const retro = await retroRow(t, roomId);
  const byKind = (kind: string) => retro.stages.find((s) => s.kind === kind)!;
  const advance = (kind: string) =>
    as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: byKind(kind).id });
  const create = (who: string, text = "Do the thing", extra: Record<string, unknown> = {}) =>
    as(t, who).mutation(api.retro.createAction, { roomId, text, ...extra });
  return { roomId, ownerId, guestId, retro, byKind, advance, create };
}

/** A Team with an admin and a member, both permanent accounts. */
async function seedTeam(t: T) {
  const adminId = await seedUser(t, "admin", "permanent");
  const memberId = await seedUser(t, "member", "permanent");
  const teamId = await as(t, "admin").mutation(api.teams.create, { name: "Acme" });
  const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
  await as(t, "member").mutation(api.teams.joinByInvite, { inviteToken: team.inviteToken });
  return { teamId, adminId, memberId };
}

const row = (t: T, id: Id<"retroActions">) => t.run((ctx) => ctx.db.get(id));

describe("creating an action item (spec §13)", () => {
  it("any attendee creates one in every stage, unowned, open, named by its creator", async () => {
    const t = convexTest(schema, modules);
    const { roomId, guestId, retro, advance, create } = await seedRetro(t);

    for (const stage of retro.stages) {
      await advance(stage.kind);
      const id = await create("guest", `In ${stage.kind}`);
      const action = (await row(t, id))!;
      expect(action).toMatchObject({
        roomId,
        text: `In ${stage.kind}`,
        status: "open",
        createdBy: guestId,
      });
      expect(action.ownerId).toBeUndefined();
      expect(action.teamId).toBeUndefined();
      expect(action.note).toBeUndefined();
      expect(action.externalRef).toBeUndefined();
      expect(action.createdAt).toBe(action.updatedAt);
    }
  });
});

describe("ownership (spec §13)", () => {
  it("an owner must attend the retro, anonymous accounts included; a stranger cannot own", async () => {
    const t = convexTest(schema, modules);
    const { guestId, create } = await seedRetro(t);
    const strangerId = await seedUser(t, "stranger");

    const id = await create("owner", "Owned", { ownerId: guestId });
    expect((await row(t, id))!.ownerId).toBe(guestId);

    expect(await codeOf(create("owner", "Stray", { ownerId: strangerId }))).toBe("forbidden");
  });

  it("assign and unassign are actionManagement acts with no accept step", async () => {
    const t = convexTest(schema, modules);
    const { roomId, ownerId, guestId, create } = await seedRetro(t);
    const id = await create("owner");

    // Default `everyone`: the guest hands it to the owner, then to nobody.
    await as(t, "guest").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId });
    expect((await row(t, id))!.ownerId).toBe(ownerId);
    await as(t, "guest").mutation(api.retro.assignAction, { roomId, actionId: id });
    expect((await row(t, id))!.ownerId).toBeUndefined();

    // Under `facilitators`, a participant cannot assign, not even to themself.
    await t.run((ctx) =>
      ctx.db.patch(roomId, { permissions: { ...DEFAULT_RETRO_PERMISSIONS, actionManagement: "facilitators" } })
    );
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId: guestId }))
    ).toBe("forbidden");
    await as(t, "owner").mutation(api.retro.assignAction, { roomId, actionId: id, ownerId: guestId });
    expect((await row(t, id))!.ownerId).toBe(guestId);
  });
});

describe("actionManagement versus owner rights (spec §4.2, §13)", () => {
  async function seedFacilitatorsOnly(t: T) {
    const seeded = await seedRetro(t);
    await t.run((ctx) =>
      ctx.db.patch(seeded.roomId, {
        permissions: { ...DEFAULT_RETRO_PERMISSIONS, actionManagement: "facilitators" },
      })
    );
    return seeded;
  }

  it("the owner may always edit, complete, drop and reopen their own item", async () => {
    const t = convexTest(schema, modules);
    const { roomId, guestId, create } = await seedFacilitatorsOnly(t);
    const id = await create("owner", "Mine", { ownerId: guestId });
    const me = as(t, "guest");

    await me.mutation(api.retro.updateAction, { roomId, actionId: id, text: "Edited", dueAt: 5 });
    expect((await row(t, id))!).toMatchObject({ text: "Edited", dueAt: 5 });
    await me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "done" });
    expect((await row(t, id))!.status).toBe("done");
    await me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "open" });
    expect((await row(t, id))!.status).toBe("open");
    await me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "dropped" });
    expect((await row(t, id))!.status).toBe("dropped");
  });

  it("a participant without the category cannot edit, change or delete another's item, nor delete their own", async () => {
    const t = convexTest(schema, modules);
    const { roomId, guestId, create } = await seedFacilitatorsOnly(t);
    const theirs = await create("owner", "Theirs");
    const mine = await create("owner", "Mine", { ownerId: guestId });
    const me = as(t, "guest");

    expect(await codeOf(me.mutation(api.retro.updateAction, { roomId, actionId: theirs, text: "x" }))).toBe("forbidden");
    expect(await codeOf(me.mutation(api.retro.setActionStatus, { roomId, actionId: theirs, status: "done" }))).toBe("forbidden");
    expect(await codeOf(me.mutation(api.retro.deleteAction, { roomId, actionId: theirs }))).toBe("forbidden");
    // Delete is a separate `actionManagement` act, even on one's own (ADR-0017).
    expect(await codeOf(me.mutation(api.retro.deleteAction, { roomId, actionId: mine }))).toBe("forbidden");
    expect(await row(t, mine)).not.toBeNull();

    // The facilitator-level owner may do all of it.
    await as(t, "owner").mutation(api.retro.setActionStatus, { roomId, actionId: mine, status: "done" });
    await as(t, "owner").mutation(api.retro.deleteAction, { roomId, actionId: theirs });
    expect(await row(t, theirs)).toBeNull();
  });

  it("an unknown or foreign action is missing; a non-member is refused", async () => {
    const t = convexTest(schema, modules);
    const { roomId, create } = await seedRetro(t);
    const id = await create("owner");
    const otherRoom = await createRetro(t, "owner", { name: "Other" });
    await seedUser(t, "stranger");

    expect(await codeOf(as(t, "owner").mutation(api.retro.deleteAction, { roomId: otherRoom, actionId: id }))).toBe("missing");
    await expect(as(t, "stranger").mutation(api.retro.createAction, { roomId, text: "x" })).rejects.toThrow();
  });
});

describe("the three states and the note (spec §13)", () => {
  it("open → done | dropped → open, all reversible; the note is written only on leaving open and cleared on reopening", async () => {
    const t = convexTest(schema, modules);
    const { roomId, create } = await seedRetro(t);
    const id = await create("owner");
    const me = as(t, "owner");

    await me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "done", note: "Shipped it" });
    expect((await row(t, id))!).toMatchObject({ status: "done", note: "Shipped it" });
    // Done to dropped is not leaving open: no note may ride along, the old one stays.
    expect(
      await codeOf(me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "dropped", note: "meh" }))
    ).toBe("forbidden");
    await me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "dropped" });
    expect((await row(t, id))!).toMatchObject({ status: "dropped", note: "Shipped it" });
    await me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "open" });
    expect((await row(t, id))!.status).toBe("open");
    expect((await row(t, id))!.note).toBeUndefined();
    expect(
      await codeOf(me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "open", note: "x" }))
    ).toBe("forbidden");
    await me.mutation(api.retro.setActionStatus, { roomId, actionId: id, status: "dropped", note: "Not worth it" });
    expect((await row(t, id))!).toMatchObject({ status: "dropped", note: "Not worth it" });
  });

  it("text is trimmed, required and bounded; a source must be a live topic of the room", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro, create } = await seedRetro(t);
    expect(await codeOf(create("owner", "   "))).toBe("forbidden");
    expect(await codeOf(create("owner", "x".repeat(501)))).toBe("forbidden");
    const id = await create("owner", "  padded  ");
    expect((await row(t, id))!.text).toBe("padded");

    const { cardId } = await as(t, "owner").mutation(api.retro.createCard, {
      roomId,
      clientId: "c1",
      text: "A card",
      promptId: retro.format.prompts[0].id,
      position: { x: 0, y: 0 },
    });
    const sourced = await create("owner", "From the card", { source: { kind: "card", id: cardId } });
    expect((await row(t, sourced))!.source).toEqual({ kind: "card", id: cardId });
    await as(t, "owner").mutation(api.retro.deleteCard, { roomId, clientId: "c1" });
    expect(await codeOf(create("owner", "Gone", { source: { kind: "card", id: cardId } }))).toBe("missing");
  });
});

describe("the retro's actions read (spec §13): creator and owner named in both attribution modes", () => {
  it("an anonymous retro still names creator and owner, a source card renders its text and never an author", async () => {
    const t = convexTest(schema, modules);
    const { roomId, ownerId, guestId, retro, create } = await seedRetro(t);
    await as(t, "owner").mutation(api.retro.ratchet, { roomId });
    const { cardId } = await as(t, "guest").mutation(api.retro.createCard, {
      roomId,
      clientId: "c1",
      text: "The flaky build",
      promptId: retro.format.prompts[0].id,
      position: { x: 0, y: 0 },
    });
    // Leaving collect for a visible entry reveals the card (spec §8.3).
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: retro.stages[1].id });
    const id = await create("guest", "Fix the build", { ownerId, source: { kind: "card", id: cardId } });

    const read = await as(t, "owner").query(api.retro.actions, { roomId });
    expect(read.items).toHaveLength(1);
    expect(read.items[0]).toMatchObject({
      _id: id,
      text: "Fix the build",
      status: "open",
      creatorName: "guest",
      ownerId,
      ownerName: "owner",
      source: { kind: "card", id: cardId, label: "The flaky build" },
      rights: { edit: true, manage: true },
    });
    expect(JSON.stringify(read.items[0].source)).not.toContain(String(guestId));
    // The reassign picker's roster: every attendee, anonymous included.
    expect(read.rooms).toEqual([
      expect.objectContaining({
        roomId,
        name: "R",
        members: expect.arrayContaining([
          { userId: ownerId, name: "owner" },
          { userId: guestId, name: "guest" },
        ]),
      }),
    ]);
  });

  it("a missing owner or creator reads as the register's former member; unowned carries no name", async () => {
    const t = convexTest(schema, modules);
    const { roomId, guestId, create } = await seedRetro(t);
    const owned = await create("guest", "Owned", { ownerId: guestId });
    const unowned = await create("owner", "Unowned");
    await t.run((ctx) => ctx.db.delete(guestId));

    const read = await as(t, "owner").query(api.retro.actions, { roomId });
    const byId = new Map(read.items.map((item) => [item._id, item]));
    expect(byId.get(owned)).toMatchObject({ ownerName: FORMER_MEMBER, creatorName: FORMER_MEMBER });
    expect(byId.get(unowned)!.ownerId).toBeUndefined();
    expect(byId.get(unowned)!.ownerName).toBeUndefined();
    expect(UNOWNED_ACTION).toBe("Nobody owns this yet");
  });

  it("rights follow the viewer: own or the category to edit, the category to manage, neither for a Team reader", async () => {
    const t = convexTest(schema, modules);
    const { teamId, memberId } = await seedTeam(t);
    await seedUser(t, "reader", "permanent");
    const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
    await as(t, "reader").mutation(api.teams.joinByInvite, { inviteToken: team.inviteToken });
    const roomId = await createRetro(t, "admin", { teamId });
    await seedUser(t, "guest", "anonymous");
    await joinRoom(t, roomId, "guest");
    await joinRoom(t, roomId, "member");
    await t.run((ctx) =>
      ctx.db.patch(roomId, { permissions: { ...DEFAULT_RETRO_PERMISSIONS, actionManagement: "facilitators" } })
    );
    await as(t, "guest").mutation(api.retro.createAction, { roomId, text: "Mine", ownerId: memberId });
    await as(t, "guest").mutation(api.retro.createAction, { roomId, text: "Theirs" });

    const rightsFor = async (who: string) =>
      Object.fromEntries(
        (await as(t, who).query(api.retro.actions, { roomId })).items.map((i) => [i.text, i.rights])
      );
    expect(await rightsFor("admin")).toEqual({
      Mine: { edit: true, manage: true },
      Theirs: { edit: true, manage: true },
    });
    expect(await rightsFor("guest")).toEqual({
      Mine: { edit: false, manage: false },
      Theirs: { edit: false, manage: false },
    });
    expect(await rightsFor("member")).toEqual({
      Mine: { edit: true, manage: false },
      Theirs: { edit: false, manage: false },
    });
    // A Team member who never attended reads through the Team (ADR-0009) and acts on nothing.
    expect(await rightsFor("reader")).toEqual({
      Mine: { edit: false, manage: false },
      Theirs: { edit: false, manage: false },
    });
  });
});

describe("carryover: retro.reviewActions (spec §13, ADR-0017)", () => {
  /** A Team with two earlier retros and the retro under review, all by the admin. */
  async function seedHistory(t: T) {
    const { teamId, adminId, memberId } = await seedTeam(t);
    const first = await createRetro(t, "admin", { teamId, name: "First" });
    const second = await createRetro(t, "admin", { teamId, name: "Second" });
    const current = await createRetro(t, "admin", { teamId, name: "Current" });
    const at = async (roomId: Id<"rooms">, text: string, createdAt: number, status: "open" | "done" | "dropped" = "open") => {
      const id = await as(t, "admin").mutation(api.retro.createAction, { roomId, text });
      await t.run((ctx) => ctx.db.patch(id, { createdAt, status }));
      return id;
    };
    return { teamId, adminId, memberId, first, second, current, at };
  }

  it("returns the Team's open items from other retros only, oldest first, with their retro's name", async () => {
    const t = convexTest(schema, modules);
    const { first, second, current, at } = await seedHistory(t);
    await at(second, "second-late", 3_000);
    await at(first, "first-early", 1_000);
    await at(first, "first-done", 500, "done");
    await at(second, "second-dropped", 600, "dropped");
    await at(current, "own-open", 100);
    await at(first, "first-mid", 2_000);

    const read = await as(t, "admin").query(api.retro.reviewActions, { roomId: current });
    expect(read.items.map((item) => [item.text, item.roomName])).toEqual([
      ["first-early", "First"],
      ["first-mid", "First"],
      ["second-late", "Second"],
    ]);
    expect(read.rooms.map((room) => room.name).sort()).toEqual(["First", "Second"]);
  });

  it("is empty for a teamless retro", async () => {
    const t = convexTest(schema, modules);
    const { roomId, create } = await seedRetro(t);
    await create("owner", "Own");
    const read = await as(t, "owner").query(api.retro.reviewActions, { roomId });
    expect(read.items).toEqual([]);
    expect(read.rooms).toEqual([]);
  });

  it("is a Team reader's read too, and a stranger's refusal", async () => {
    const t = convexTest(schema, modules);
    const { first, current, at } = await seedHistory(t);
    await at(first, "carry", 1_000);
    await seedUser(t, "stranger", "permanent");

    const read = await as(t, "member").query(api.retro.reviewActions, { roomId: current });
    expect(read.items.map((item) => item.text)).toEqual(["carry"]);
    await expect(as(t, "stranger").query(api.retro.reviewActions, { roomId: current })).rejects.toThrow();
  });

  it("reads a bounded window of the team index", async () => {
    const t = convexTest(schema, modules);
    const { first, current, at } = await seedHistory(t);
    for (let i = 0; i < MAX_REVIEW_ROWS + 5; i++) await at(first, `a${i}`, i);
    const read = await as(t, "admin").query(api.retro.reviewActions, { roomId: current });
    expect(read.items.length).toBeLessThanOrEqual(MAX_REVIEW_ROWS);
  });

  it("an action written before its retro was adopted into the Team reaches review and the team list afterwards", async () => {
    const t = convexTest(schema, modules);
    const { teamId, first } = await seedHistory(t);
    const teamless = await createRetro(t, "admin", { name: "Loose" });
    const id = await as(t, "admin").mutation(api.retro.createAction, { roomId: teamless, text: "Early" });
    expect((await as(t, "admin").query(api.retro.reviewActions, { roomId: first })).items).toEqual([]);

    await as(t, "admin").mutation(api.retro.adoptIntoTeam, { roomId: teamless, teamId });

    expect((await as(t, "admin").query(api.retro.reviewActions, { roomId: first })).items.map((i) => i._id)).toEqual([id]);
    expect((await as(t, "admin").query(api.teams.openActions, { teamId })).items.map((i) => i._id)).toEqual([id]);
  });
});

describe("the team page's open-actions list: teams.openActions (spec §5)", () => {
  it("lists every open item across the Team's retros, oldest first, members only", async () => {
    const t = convexTest(schema, modules);
    const { teamId, memberId } = await seedTeam(t);
    const a = await createRetro(t, "admin", { teamId, name: "A" });
    const b = await createRetro(t, "member", { teamId, name: "B" });
    const late = await as(t, "member").mutation(api.retro.createAction, { roomId: b, text: "late", ownerId: memberId });
    const early = await as(t, "admin").mutation(api.retro.createAction, { roomId: a, text: "early" });
    await t.run((ctx) => ctx.db.patch(early, { createdAt: 1 }));
    const done = await as(t, "admin").mutation(api.retro.createAction, { roomId: a, text: "done" });
    await as(t, "admin").mutation(api.retro.setActionStatus, { roomId: a, actionId: done, status: "done" });
    await seedUser(t, "stranger", "permanent");

    const read = await as(t, "member").query(api.teams.openActions, { teamId });
    expect(read.items.map((item) => [item._id, item.roomName, item.rights])).toEqual([
      [early, "A", { edit: false, manage: false }],
      [late, "B", { edit: true, manage: true }],
    ]);
    await expect(as(t, "stranger").query(api.teams.openActions, { teamId })).rejects.toThrow();
  });
});

describe("the source link's life (spec §10.3, §13)", () => {
  async function seedTopics(t: T) {
    const seeded = await seedRetro(t);
    const { roomId, retro } = seeded;
    const write = async (clientId: string) =>
      (
        await as(t, "owner").mutation(api.retro.createCard, {
          roomId,
          clientId,
          text: clientId,
          promptId: retro.format.prompts[0].id,
          position: { x: 0, y: 0 },
        })
      ).cardId;
    return { ...seeded, write };
  }

  it("dissolving a cluster nulls matching sources and leaves the rest", async () => {
    const t = convexTest(schema, modules);
    const { roomId, write, create } = await seedTopics(t);
    const c1 = await write("c1");
    await write("c2");
    const k = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["c1", "c2"] });
    const onCluster = await create("owner", "On the cluster", { source: { kind: "cluster", id: k } });
    const onCard = await create("owner", "On the card", { source: { kind: "card", id: c1 } });

    await as(t, "owner").mutation(api.retro.dissolveCluster, { roomId, clusterId: k });

    expect((await row(t, onCluster))!.source).toBeUndefined();
    expect((await row(t, onCard))!.source).toEqual({ kind: "card", id: c1 });
  });

  it("merging re-points sources to the surviving cluster", async () => {
    const t = convexTest(schema, modules);
    const { roomId, write, create } = await seedTopics(t);
    await write("c1");
    await write("c2");
    const from = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["c1"] });
    const into = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["c2"] });
    const id = await create("owner", "Merged", { source: { kind: "cluster", id: from } });

    await as(t, "owner").mutation(api.retro.mergeClusters, { roomId, from, into });

    expect((await row(t, id))!.source).toEqual({ kind: "cluster", id: into });
  });

  it("deleting a card nulls its source", async () => {
    const t = convexTest(schema, modules);
    const { roomId, write, create } = await seedTopics(t);
    const c1 = await write("c1");
    const id = await create("owner", "On the card", { source: { kind: "card", id: c1 } });

    await as(t, "owner").mutation(api.retro.deleteCard, { roomId, clientId: "c1" });

    expect((await row(t, id))!.source).toBeUndefined();
  });
});

describe("the cascade and account linking (spec §13, §15.2)", () => {
  it("an action dies with its room, and the delete confirmation counts the open ones", async () => {
    const t = convexTest(schema, modules);
    const { roomId, create } = await seedRetro(t);
    const open = await create("owner", "open");
    const done = await create("owner", "done");
    await as(t, "owner").mutation(api.retro.setActionStatus, { roomId, actionId: done, status: "done" });
    expect(await as(t, "owner").query(api.retro.deleteCounts, { roomId })).toEqual({ cards: 0, openActions: 1 });

    await as(t, "owner").mutation(api.retro.remove, { roomId });
    await t.finishAllScheduledFunctions(() => {});

    expect(await row(t, open)).toBeNull();
    expect(await row(t, done)).toBeNull();
  });

  it("linking an anonymous account to a permanent one re-points ownerId and createdBy", async () => {
    const t = convexTest(schema, modules);
    const { guestId, create } = await seedRetro(t);
    const mine = await create("guest", "Mine", { ownerId: guestId });
    const theirs = await create("owner", "Theirs", { ownerId: guestId });
    const permanentId = await seedUser(t, "perm", "permanent");

    await t.run((ctx) =>
      Users.linkAnonymousToPermanent(ctx, { oldAuthUserId: "guest", newAuthUserId: "perm", email: "p@example.com" })
    );

    expect((await row(t, mine))!).toMatchObject({ ownerId: permanentId, createdBy: permanentId });
    expect((await row(t, theirs))!.ownerId).toBe(permanentId);
  });
});
