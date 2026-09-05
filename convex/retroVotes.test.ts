/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";
import * as Users from "./model/users";

// Dots (spec §11, §9, §8.2, ADR-0016): one row per dot on a topic, scoped to
// the stage entry that collected it. The budget is a count of the voter's
// rows for the entry; `maxPerTopic` caps one topic. Any entry may carry a
// budget, so the only `stage` refusal is an entry without one. The tally is
// per viewer: aggregate counts when the entry shows them, own dots always,
// and never a voter.

const modules = import.meta.glob("./**/*.*s");

const seedUser = (t: T, authUserId: string) => seedNamedUser(t, authUserId, authUserId);
const as = (t: T, subject: string) => t.withIdentity({ subject });

async function retroRow(t: T, roomId: Id<"rooms">) {
  return (await t.run((ctx) =>
    ctx.db
      .query("retros")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .unique()
  ))!;
}

async function cardsOf(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("retroCards")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

async function votesOf(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("retroVotes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

async function clustersOf(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("retroClusters")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

async function userId(t: T, authUserId: string): Promise<Id<"users">> {
  return (await t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .unique()
  ))!._id;
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

/**
 * An owner and a participant in a fresh teamless retro with three cards,
 * advanced to the seeded `vote` entry (budget 5, no per-topic cap) unless
 * told otherwise.
 */
async function seedRetro(t: T, opts: { attribution?: "named" | "anonymous"; advance?: boolean } = {}) {
  await seedUser(t, "owner");
  await seedUser(t, "guest");
  const roomId = await as(t, "owner").mutation(api.retro.create, {
    name: "R",
    formatName: DEFAULT_RETRO_FORMAT.name,
  });
  await as(t, "guest").mutation(api.users.join, { roomId, name: "G", authUserId: "guest" });
  let retro = await retroRow(t, roomId);
  if (opts.attribution === "anonymous") {
    await t.run((ctx) => ctx.db.patch(retro._id, { attribution: "anonymous" }));
  }
  const promptId = retro.format.prompts[0].id;
  const write = (who: string, clientId: string) =>
    as(t, who).mutation(api.retro.createCard, { roomId, clientId, text: clientId, promptId, position: { x: 0, y: 0 } });
  await write("owner", "o1");
  await write("owner", "o2");
  await write("guest", "g1");
  const vote = retro.stages.find((s) => s.kind === "vote")!;
  if (opts.advance !== false) {
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: vote.id });
  }
  retro = await retroRow(t, roomId);
  const cards = await cardsOf(t, roomId);
  const cardId = (clientId: string) => cards.find((c) => c.clientId === clientId)!._id;
  const onCard = (clientId: string) => ({ kind: "card" as const, id: cardId(clientId) });
  return { roomId, retro, stages: retro.stages, vote, promptId, cardId, onCard };
}

async function patchStage(t: T, roomId: Id<"rooms">, stageId: string, patch: Record<string, unknown>) {
  const retro = await retroRow(t, roomId);
  await t.run((ctx) =>
    ctx.db.patch(retro._id, {
      stages: retro.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)),
    })
  );
}

describe("retro.placeDot and removeDot (spec §11)", () => {
  it("a dot is one row on the entry with the voter always stored; remove deletes one", async () => {
    const t = convexTest(schema, modules);
    const { roomId, vote, onCard } = await seedRetro(t);
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    const rows = await votesOf(t, roomId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.stageEntryId).toBe(vote.id);
      expect(row.voterId).toBe(await userId(t, "guest"));
      expect(row.target).toEqual(onCard("o1"));
    }
    await as(t, "guest").mutation(api.retro.removeDot, { roomId, target: onCard("o1") });
    expect(await votesOf(t, roomId)).toHaveLength(1);
    // Nothing to remove is `missing`; another voter's dot is not yours to remove.
    await as(t, "guest").mutation(api.retro.removeDot, { roomId, target: onCard("o1") });
    expect(await codeOf(as(t, "owner").mutation(api.retro.removeDot, { roomId, target: onCard("o1") }))).toBe("missing");
    expect(await codeOf(as(t, "guest").mutation(api.retro.removeDot, { roomId, target: onCard("o1") }))).toBe("missing");
  });

  it("the budget is the voter's rows for the entry: the sixth dot is `budget`, whatever the topic", async () => {
    const t = convexTest(schema, modules);
    const { roomId, onCard } = await seedRetro(t);
    const me = as(t, "guest");
    for (const clientId of ["o1", "o1", "o2", "g1", "g1"]) {
      await me.mutation(api.retro.placeDot, { roomId, target: onCard(clientId) });
    }
    expect(await codeOf(me.mutation(api.retro.placeDot, { roomId, target: onCard("o2") }))).toBe("budget");
    // Another voter has their own budget.
    await as(t, "owner").mutation(api.retro.placeDot, { roomId, target: onCard("o2") });
    // Removing one frees one.
    await me.mutation(api.retro.removeDot, { roomId, target: onCard("g1") });
    await me.mutation(api.retro.placeDot, { roomId, target: onCard("o2") });
    expect((await votesOf(t, roomId)).length).toBe(6);
  });

  it("maxPerTopic caps one topic for one voter with `budget`, under the budget", async () => {
    const t = convexTest(schema, modules);
    const { roomId, vote, onCard } = await seedRetro(t);
    await patchStage(t, roomId, vote.id, { maxPerTopic: 1 });
    const me = as(t, "guest");
    await me.mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    expect(await codeOf(me.mutation(api.retro.placeDot, { roomId, target: onCard("o1") }))).toBe("budget");
    await me.mutation(api.retro.placeDot, { roomId, target: onCard("o2") });
    await as(t, "owner").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    expect((await votesOf(t, roomId)).length).toBe(3);
  });

  it("an entry without a budget refuses with `stage`; any entry with one takes dots (ADR-0010)", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages, onCard } = await seedRetro(t, { advance: false });
    const me = as(t, "guest");
    expect(await codeOf(me.mutation(api.retro.placeDot, { roomId, target: onCard("o1") }))).toBe("stage");
    expect(await codeOf(me.mutation(api.retro.removeDot, { roomId, target: onCard("o1") }))).toBe("stage");
    // A budget on the collect entry: the kind is never the test.
    await patchStage(t, roomId, stages[0].id, { voteBudget: 2 });
    await me.mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    await me.mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    expect(await codeOf(me.mutation(api.retro.placeDot, { roomId, target: onCard("o2") }))).toBe("budget");
    expect((await votesOf(t, roomId)).every((r) => r.stageEntryId === stages[0].id)).toBe(true);
    // Close carries a budget too, when given one.
    const close = stages.find((s) => s.kind === "close")!;
    await patchStage(t, roomId, close.id, { voteBudget: 1 });
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: close.id });
    await me.mutation(api.retro.placeDot, { roomId, target: onCard("g1") });
    await me.mutation(api.retro.removeDot, { roomId, target: onCard("g1") });
  });

  it("a second vote entry starts a fresh budget; the first entry's dots stay", async () => {
    const t = convexTest(schema, modules);
    const { roomId, vote, onCard } = await seedRetro(t);
    const me = as(t, "guest");
    for (let i = 0; i < 5; i++) await me.mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    expect(await codeOf(me.mutation(api.retro.placeDot, { roomId, target: onCard("o1") }))).toBe("budget");

    const second = await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "vote" });
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: second });
    await me.mutation(api.retro.placeDot, { roomId, target: onCard("o2") });
    const rows = await votesOf(t, roomId);
    expect(rows.filter((r) => r.stageEntryId === vote.id)).toHaveLength(5);
    expect(rows.filter((r) => r.stageEntryId === second)).toHaveLength(1);
  });

  it("refuses an unknown or foreign target with `missing`, and a non-member with a guard error", async () => {
    const t = convexTest(schema, modules);
    const { roomId, onCard } = await seedRetro(t);
    await seedUser(t, "stranger");
    const otherRoom = await as(t, "stranger").mutation(api.retro.create, { name: "O", formatName: DEFAULT_RETRO_FORMAT.name });
    const otherCluster = await t.run((ctx) =>
      ctx.db.insert("retroClusters", { roomId: otherRoom, name: "Elsewhere", createdAt: Date.now() })
    );
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.placeDot, { roomId, target: { kind: "cluster", id: otherCluster } }))
    ).toBe("missing");
    expect(await codeOf(as(t, "stranger").mutation(api.retro.placeDot, { roomId, target: onCard("o1") }))).toBeUndefined();
  });
});

describe("retro.tally (spec §9, §8.2)", () => {
  it("hides the counts on the vote entry, always shows own dots, and carries the entry's budget", async () => {
    const t = convexTest(schema, modules);
    const { roomId, onCard, cardId } = await seedRetro(t);
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    await as(t, "owner").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });

    const guest = await as(t, "guest").query(api.retro.tally, { roomId });
    expect(guest.visible).toBe(false);
    expect(guest.counts).toEqual({});
    expect(guest.mine).toEqual({ [cardId("o1")]: 2 });
    expect(guest.spent).toBe(2);
    expect(guest.budget).toBe(5);
    expect(guest.maxPerTopic).toBeUndefined();

    const owner = await as(t, "owner").query(api.retro.tally, { roomId });
    expect(owner.counts).toEqual({});
    expect(owner.mine).toEqual({ [cardId("o1")]: 1 });
    expect(owner.spent).toBe(1);
  });

  it("shows the counts once the entry does, and after advance; the entry's own rows only", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages, vote, onCard, cardId } = await seedRetro(t);
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    await as(t, "owner").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    await as(t, "owner").mutation(api.retro.placeDot, { roomId, target: onCard("g1") });

    await patchStage(t, roomId, vote.id, { tallyVisible: "visible" });
    let guest = await as(t, "guest").query(api.retro.tally, { roomId });
    expect(guest.visible).toBe(true);
    expect(guest.counts).toEqual({ [cardId("o1")]: 2, [cardId("g1")]: 1 });
    expect(guest.mine).toEqual({ [cardId("o1")]: 1 });

    // The discuss entry shows the vote entry's tally: the last entry with dots.
    const discuss = stages.find((s) => s.kind === "discuss")!;
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: discuss.id });
    guest = await as(t, "guest").query(api.retro.tally, { roomId });
    expect(guest.visible).toBe(true);
    expect(guest.counts).toEqual({ [cardId("o1")]: 2, [cardId("g1")]: 1 });
    expect(guest.budget).toBeUndefined();
  });

  it("a cluster's tally is its own dots plus its members'", async () => {
    const t = convexTest(schema, modules);
    const { roomId, vote, onCard, cardId } = await seedRetro(t);
    await patchStage(t, roomId, vote.id, { tallyVisible: "visible" });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    const clusterId = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["o1", "o2"] });
    await as(t, "owner").mutation(api.retro.placeDot, { roomId, target: { kind: "cluster", id: clusterId } });
    await as(t, "owner").mutation(api.retro.placeDot, { roomId, target: onCard("o2") });

    const guest = await as(t, "guest").query(api.retro.tally, { roomId });
    expect(guest.counts[clusterId]).toBe(3);
    expect(guest.counts[cardId("o1")]).toBe(1);
    expect(guest.counts[cardId("o2")]).toBe(1);
    // Own dots stay where they were placed: a dot on a member is removed from the member.
    expect(guest.mine).toEqual({ [cardId("o1")]: 1 });
    const owner = await as(t, "owner").query(api.retro.tally, { roomId });
    expect(owner.mine).toEqual({ [clusterId]: 1, [cardId("o2")]: 1 });
  });

  it("in an anonymous retro the voter is stored and never read; the ratchet leaves it", async () => {
    const t = convexTest(schema, modules);
    const { roomId, vote, onCard, cardId } = await seedRetro(t, { attribution: "anonymous" });
    await patchStage(t, roomId, vote.id, { tallyVisible: "visible" });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    const guestId = await userId(t, "guest");
    expect((await votesOf(t, roomId))[0].voterId).toBe(guestId);

    const owner = await as(t, "owner").query(api.retro.tally, { roomId });
    expect(owner.counts).toEqual({ [cardId("o1")]: 1 });
    expect(owner.mine).toEqual({});
    expect(JSON.stringify(owner)).not.toContain(guestId);
    const guest = await as(t, "guest").query(api.retro.tally, { roomId });
    expect(guest.mine).toEqual({ [cardId("o1")]: 1 });
    expect(JSON.stringify(guest)).not.toContain(guestId);

    // A named retro ratcheted after voting keeps every voter (spec §8.2).
    const named = await seedRetro(t);
    await as(t, "guest").mutation(api.retro.placeDot, { roomId: named.roomId, target: named.onCard("g1") });
    await as(t, "owner").mutation(api.retro.ratchet, { roomId: named.roomId });
    expect((await retroRow(t, named.roomId)).attribution).toBe("anonymous");
    expect((await votesOf(t, named.roomId)).map((r) => r.voterId)).toEqual([guestId]);
  });
});

describe("dots under grouping (spec §10.3, ADR-0016)", () => {
  it("merge re-points the cluster's dots; dissolve asks first and then deletes them", async () => {
    const t = convexTest(schema, modules);
    const { roomId, onCard } = await seedRetro(t);
    const owner = as(t, "owner");
    const a = await owner.mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    const b = await owner.mutation(api.retro.formCluster, { roomId, clientIds: ["o2"] });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: { kind: "cluster", id: a } });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: { kind: "cluster", id: b } });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("g1") });

    await owner.mutation(api.retro.mergeClusters, { roomId, from: a, into: b });
    let rows = await votesOf(t, roomId);
    expect(rows.filter((r) => r.target.kind === "cluster").map((r) => r.target.id)).toEqual([b, b]);

    // Dissolve without consent: nothing changes, the count comes back.
    expect(await owner.mutation(api.retro.dissolveCluster, { roomId, clusterId: b })).toEqual({ dissolved: false, votes: 2 });
    expect(await clustersOf(t, roomId)).toHaveLength(1);
    expect(await votesOf(t, roomId)).toHaveLength(3);
    expect(await owner.mutation(api.retro.dissolveCluster, { roomId, clusterId: b, removeVotes: true })).toEqual({ dissolved: true });
    expect(await clustersOf(t, roomId)).toHaveLength(0);
    rows = await votesOf(t, roomId);
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toEqual(onCard("g1"));
    // A cluster without dots dissolves at once.
    const c = await owner.mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    expect(await owner.mutation(api.retro.dissolveCluster, { roomId, clusterId: c })).toEqual({ dissolved: true });
  });

  it("a cluster emptied by a membership change keeps its row and loses its dots, freeing the budget", async () => {
    const t = convexTest(schema, modules);
    const { roomId, onCard, cardId } = await seedRetro(t);
    const a = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: { kind: "cluster", id: a } });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    await as(t, "guest").mutation(api.retro.removeFromCluster, { roomId, clientIds: ["o1"] });
    expect(await clustersOf(t, roomId)).toHaveLength(1);
    const rows = await votesOf(t, roomId);
    expect(rows.map((r) => r.target)).toEqual([onCard("o1")]);
    const guest = await as(t, "guest").query(api.retro.tally, { roomId });
    expect(guest.spent).toBe(1);
    expect(guest.mine).toEqual({ [cardId("o1")]: 1 });
  });

  it("dissolving with dots is still `cardManagement`, refused before any count is told", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const a = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: { kind: "cluster", id: a } });
    expect(await codeOf(as(t, "guest").mutation(api.retro.dissolveCluster, { roomId, clusterId: a }))).toBe("forbidden");
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.dissolveCluster, { roomId, clusterId: a, removeVotes: true }))
    ).toBe("forbidden");
    expect(await votesOf(t, roomId)).toHaveLength(1);
  });
});

describe("account linking (spec §13, §15.2)", () => {
  it("linking an anonymous account to a permanent one re-points its dots", async () => {
    const t = convexTest(schema, modules);
    const { roomId, onCard } = await seedRetro(t);
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: onCard("o1") });
    const anonymousId = await userId(t, "guest");
    // The permanent account the guest signs in as.
    const permanentId = await seedNamedUser(t, "perm", "P", "permanent");
    await t.run((ctx) =>
      Users.linkAnonymousToPermanent(ctx, { oldAuthUserId: "guest", newAuthUserId: "perm", email: "p@example.com" })
    );
    const rows = await votesOf(t, roomId);
    expect(rows.map((r) => r.voterId)).toEqual([permanentId]);
    expect(await t.run((ctx) => ctx.db.get(anonymousId))).toBeNull();
  });
});
