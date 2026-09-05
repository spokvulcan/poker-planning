/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// The discussion walk (spec §12, ADR-0023): entering a `discuss` entry
// snapshots an order the team steps through; a person, never a sort, edits
// it afterwards. Coverage counts the walk; a card written after the
// snapshot is late until raised or grouped into the walk.

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
 * An owner and a participant in a fresh teamless retro at `collect`, with
 * a helper to write a card at a chosen creation instant so ties never
 * depend on the clock.
 */
async function seedRetro(t: T) {
  await seedUser(t, "owner");
  await seedUser(t, "guest");
  const roomId = await as(t, "owner").mutation(api.retro.create, {
    name: "R",
    formatName: DEFAULT_RETRO_FORMAT.name,
  });
  await as(t, "guest").mutation(api.users.join, { roomId, name: "G", authUserId: "guest" });
  const retro = await retroRow(t, roomId);
  const promptId = retro.format.prompts[0].id;
  const byKind = (kind: string) => retro.stages.find((s) => s.kind === kind)!;
  /** Write a card as `who`, stamped as created and committed at `at`. */
  const write = async (who: string, clientId: string, at: number) => {
    const { cardId } = await as(t, who).mutation(api.retro.createCard, {
      roomId,
      clientId,
      text: clientId,
      promptId,
      position: { x: 0, y: 0 },
    });
    await t.run((ctx) => ctx.db.patch(cardId, { createdAt: at, committedAt: at }));
    return cardId;
  };
  const group = async (clientIds: string[], at: number) => {
    const clusterId = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds });
    await t.run((ctx) => ctx.db.patch(clusterId, { createdAt: at }));
    return clusterId;
  };
  const advance = (stageId: string) => as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stageId });
  const dot = (who: string, target: { kind: "card"; id: Id<"retroCards"> } | { kind: "cluster"; id: Id<"retroClusters"> }) =>
    as(t, who).mutation(api.retro.placeDot, { roomId, target });
  const walk = async () => (await retroRow(t, roomId)).walk;
  return { roomId, retro, stages: retro.stages, byKind, promptId, write, group, advance, dot, walk };
}

const card = (id: Id<"retroCards">) => ({ kind: "card" as const, id });
const cluster = (id: Id<"retroClusters">) => ({ kind: "cluster" as const, id });

describe("the snapshot on entering discuss (spec §12.1)", () => {
  it("with no dots anywhere, walks every topic in creation order and stamps snapshotAt", async () => {
    const t = convexTest(schema, modules);
    const { write, group, advance, byKind, walk } = await seedRetro(t);
    const c1 = await write("owner", "c1", 1_000);
    const c2 = await write("guest", "c2", 3_000);
    const c3 = await write("owner", "c3", 2_000);
    const m1 = await write("guest", "m1", 500);
    await write("guest", "m2", 600);
    // A cluster is one topic, created after its members; its members are none.
    const k = await group(["m1", "m2"], 2_500);
    void m1;

    const before = Date.now();
    await advance(byKind("discuss").id);

    const snapshot = (await walk())!;
    expect(snapshot.stageEntryId).toBe(byKind("discuss").id);
    expect(snapshot.snapshotAt).toBeGreaterThanOrEqual(before);
    expect(snapshot.order).toEqual([card(c1), card(c3), cluster(k), card(c2)]);
    expect(snapshot.cursor).toBe(0);
    expect(snapshot.covered).toEqual([]);
  });
});

describe("the snapshot's scope when a vote entry ran (spec §12.1, ADR-0023)", () => {
  it("walks only the topics with dots, votes descending, ties by creation, a member's dot counting for its cluster", async () => {
    const t = convexTest(schema, modules);
    const { write, group, advance, byKind, walk, dot } = await seedRetro(t);
    const c1 = await write("owner", "c1", 1_000);
    const c2 = await write("guest", "c2", 2_000);
    const c3 = await write("owner", "c3", 3_000);
    await write("guest", "c4", 4_000);
    const m1 = await write("guest", "m1", 500);
    await write("guest", "m2", 600);
    const k = await group(["m1", "m2"], 700);
    await advance(byKind("vote").id);
    // c1: one dot. c2 and c3: two each, c2 created first. k: one on the chip
    // and one on a member, two. c4: none, so outside the walk.
    await dot("owner", card(c1));
    await dot("owner", card(c2));
    await dot("guest", card(c2));
    await dot("owner", card(c3));
    await dot("guest", card(c3));
    await dot("owner", cluster(k));
    await dot("guest", card(m1));

    await advance(byKind("discuss").id);

    expect((await walk())!.order).toEqual([cluster(k), card(c2), card(c3), card(c1)]);
  });

  it("reads the nearest earlier vote entry that has any dots, skipping an empty one between", async () => {
    const t = convexTest(schema, modules);
    const { roomId, write, advance, byKind, walk, dot } = await seedRetro(t);
    const c1 = await write("owner", "c1", 1_000);
    const c2 = await write("guest", "c2", 2_000);
    // A second vote entry right before discuss, which nobody uses.
    const discussIndex = (await retroRow(t, roomId)).stages.findIndex((s) => s.kind === "discuss");
    await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "vote", index: discussIndex });
    await advance(byKind("vote").id);
    await dot("owner", card(c2));

    await advance(byKind("discuss").id);

    expect((await walk())!.order).toEqual([card(c2)]);
    void c1;
  });

  it("with two vote entries both used, the later one sets the order", async () => {
    const t = convexTest(schema, modules);
    const { roomId, write, advance, byKind, walk, dot } = await seedRetro(t);
    const c1 = await write("owner", "c1", 1_000);
    const c2 = await write("guest", "c2", 2_000);
    const discussIndex = (await retroRow(t, roomId)).stages.findIndex((s) => s.kind === "discuss");
    const secondVote = await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "vote", index: discussIndex });
    await advance(byKind("vote").id);
    await dot("owner", card(c1));
    await advance(secondVote);
    await dot("owner", card(c2));

    await advance(byKind("discuss").id);

    expect((await walk())!.order).toEqual([card(c2)]);
  });
});

describe("the walk is keyed to its entry (spec §12.1)", () => {
  it("re-entry after a rewind keeps order, cursor and covered; a second discuss entry gets its own", async () => {
    const t = convexTest(schema, modules);
    const { roomId, write, advance, byKind, walk } = await seedRetro(t);
    const c1 = await write("owner", "c1", 1_000);
    await advance(byKind("discuss").id);
    const first = (await walk())!;
    // The team has walked a little.
    const retro = await retroRow(t, roomId);
    await t.run((ctx) => ctx.db.patch(retro._id, { walk: { ...first, cursor: 0, covered: [c1] } }));
    await write("guest", "c2", 2_000);

    await advance(byKind("group").id);
    await advance(byKind("discuss").id);
    expect(await walk()).toEqual({ ...first, covered: [c1] });

    const second = await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "discuss" });
    await advance(second);
    const fresh = (await walk())!;
    expect(fresh.stageEntryId).toBe(second);
    expect(fresh.order).toHaveLength(2);
    expect(fresh.covered).toEqual([]);
  });
});

/** A retro walked into discuss with three loose cards in the order and one written late. */
async function seedWalk(t: T) {
  const seeded = await seedRetro(t);
  const { write, advance, byKind } = seeded;
  const c1 = await write("owner", "c1", 1_000);
  const c2 = await write("guest", "c2", 2_000);
  const c3 = await write("owner", "c3", 3_000);
  await advance(byKind("discuss").id);
  const snapshotAt = (await seeded.walk())!.snapshotAt;
  const late = await write("guest", "late", snapshotAt + 1_000);
  return { ...seeded, c1, c2, c3, late, snapshotAt };
}

describe("retro.raise (spec §12.2, ADR-0023)", () => {
  it("inserts the topic right after the cursor, and is a no-op for one already in the order", async () => {
    const t = convexTest(schema, modules);
    const { roomId, c1, c2, c3, late, walk } = await seedWalk(t);
    const retro = await retroRow(t, roomId);
    await t.run((ctx) => ctx.db.patch(retro._id, { walk: { ...retro.walk!, cursor: 1 } }));

    await as(t, "owner").mutation(api.retro.raise, { roomId, topicRef: card(late) });
    expect((await walk())!.order).toEqual([card(c1), card(c2), card(late), card(c3)]);

    await as(t, "owner").mutation(api.retro.raise, { roomId, topicRef: card(c1) });
    expect((await walk())!.order).toEqual([card(c1), card(c2), card(late), card(c3)]);
  });

  it("is refused with stage outside a discuss entry with a walk, forbidden for a participant, missing for a gone topic", async () => {
    const t = convexTest(schema, modules);
    const { roomId, late, byKind, advance, walk } = await seedWalk(t);
    const before = (await walk())!.order;

    expect(await codeOf(as(t, "guest").mutation(api.retro.raise, { roomId, topicRef: card(late) }))).toBe("forbidden");
    await advance(byKind("group").id);
    expect(await codeOf(as(t, "owner").mutation(api.retro.raise, { roomId, topicRef: card(late) }))).toBe("stage");
    await advance(byKind("discuss").id);
    await as(t, "guest").mutation(api.retro.deleteCard, { roomId, clientId: "late" });
    expect(await codeOf(as(t, "owner").mutation(api.retro.raise, { roomId, topicRef: card(late) }))).toBe("missing");
    expect((await walk())!.order).toEqual(before);
  });

  it("is refused with stage in a discuss entry the walk is not keyed to", async () => {
    const t = convexTest(schema, modules);
    const { roomId, late } = await seedWalk(t);
    const retro = await retroRow(t, roomId);
    await t.run((ctx) => ctx.db.patch(retro._id, { walk: { ...retro.walk!, stageEntryId: "other" } }));
    expect(await codeOf(as(t, "owner").mutation(api.retro.raise, { roomId, topicRef: card(late) }))).toBe("stage");
  });
});

describe("retro.setWalkCursor and retro.markCovered (spec §12.2)", () => {
  it("move the cursor within the order and tick or untick a topic, stageFlow only, in discuss only", async () => {
    const t = convexTest(schema, modules);
    const { roomId, c2, byKind, advance, walk } = await seedWalk(t);
    const me = as(t, "owner");

    await me.mutation(api.retro.setWalkCursor, { roomId, index: 2 });
    expect((await walk())!.cursor).toBe(2);
    expect(await codeOf(me.mutation(api.retro.setWalkCursor, { roomId, index: 3 }))).toBe("missing");
    expect(await codeOf(me.mutation(api.retro.setWalkCursor, { roomId, index: -1 }))).toBe("missing");
    expect(await codeOf(as(t, "guest").mutation(api.retro.setWalkCursor, { roomId, index: 0 }))).toBe("forbidden");

    await me.mutation(api.retro.markCovered, { roomId, topicId: c2, covered: true });
    await me.mutation(api.retro.markCovered, { roomId, topicId: c2, covered: true });
    expect((await walk())!.covered).toEqual([c2]);
    await me.mutation(api.retro.markCovered, { roomId, topicId: c2, covered: false });
    expect((await walk())!.covered).toEqual([]);
    expect(await codeOf(me.mutation(api.retro.markCovered, { roomId, topicId: "nope", covered: true }))).toBe("missing");
    expect(await codeOf(as(t, "guest").mutation(api.retro.markCovered, { roomId, topicId: c2, covered: true }))).toBe("forbidden");

    await advance(byKind("close").id);
    expect(await codeOf(me.mutation(api.retro.setWalkCursor, { roomId, index: 0 }))).toBe("stage");
    expect(await codeOf(me.mutation(api.retro.markCovered, { roomId, topicId: c2, covered: true }))).toBe("stage");
    expect((await walk())!.cursor).toBe(2);
  });
});

describe("the order after the snapshot (spec §12.2)", () => {
  it("is unchanged by dots cast during discuss and by a cluster formed mid-walk, whose members' entries stay", async () => {
    const t = convexTest(schema, modules);
    const { roomId, c1, c2, c3, late, walk, byKind } = await seedWalk(t);
    const before = (await walk())!.order;
    // A budget on the discuss entry (any entry may carry one, spec §11).
    const retro = await retroRow(t, roomId);
    await t.run((ctx) =>
      ctx.db.patch(retro._id, { stages: retro.stages.map((s) => (s.id === byKind("discuss").id ? { ...s, voteBudget: 3 } : s)) })
    );
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: card(late) });
    await as(t, "guest").mutation(api.retro.placeDot, { roomId, target: card(c3) });
    expect((await walk())!.order).toEqual(before);

    const k = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["c1", "c2"] });
    expect((await walk())!.order).toEqual([card(c1), card(c2), card(c3)]);

    const board = await as(t, "owner").query(api.retro.board, { roomId });
    // The new cluster is outside the walk and raisable; its members' entries stay.
    expect(board.walk!.entries.map((e) => e.ref)).toEqual([card(c1), card(c2), card(c3)]);
    expect(board.walk!.total).toBe(3);
    expect(board.walk!.outside.find((o) => o.ref.id === k)).toMatchObject({ ref: cluster(k), late: false });
  });
});

describe("retro.board's walk projection and late cards (spec §12.3)", () => {
  it("marks a card written after the snapshot and outside the order late, at every zoom level via the board", async () => {
    const t = convexTest(schema, modules);
    const { roomId, late, c1 } = await seedWalk(t);
    const board = await as(t, "owner").query(api.retro.board, { roomId });
    const byId = new Map(board.cards.map((c) => [c._id, c]));
    expect(byId.get(late)!.late).toBe(true);
    expect(byId.get(c1)!.late).toBeUndefined();
    expect(board.walk).toMatchObject({ covered: 0, total: 3, late: 1, cursor: 0 });
    expect(board.walk!.outside).toEqual([{ ref: card(late), late: true }]);
  });

  it("clears late when the topic is raised, or when the card joins an in-walk cluster", async () => {
    const t = convexTest(schema, modules);
    const { roomId, late, c1, snapshotAt, write } = await seedWalk(t);
    const late2 = await write("owner", "late2", snapshotAt + 2_000);
    const me = as(t, "owner");

    await me.mutation(api.retro.raise, { roomId, topicRef: card(late) });
    let board = await me.query(api.retro.board, { roomId });
    expect(board.cards.find((c) => c._id === late)!.late).toBeUndefined();
    expect(board.cards.find((c) => c._id === late2)!.late).toBe(true);
    expect(board.walk!.entries.map((e) => e.ref)).toEqual([card(c1), card(late), ...board.walk!.entries.slice(2).map((e) => e.ref)]);

    // c1 is in the walk; grouping late2 with it makes the cluster the topic,
    // which is outside the order (a cluster is a new topic) — so late2 stays
    // late until that cluster is raised. Raise the cluster, then late2 clears.
    const k = await me.mutation(api.retro.formCluster, { roomId, clientIds: ["c1", "late2"] });
    board = await me.query(api.retro.board, { roomId });
    expect(board.cards.find((c) => c._id === late2)!.late).toBe(true);
    await me.mutation(api.retro.raise, { roomId, topicRef: cluster(k) });
    board = await me.query(api.retro.board, { roomId });
    expect(board.cards.find((c) => c._id === late2)!.late).toBeUndefined();

    // A late card dragged into that in-walk cluster clears at once.
    const late3 = await write("guest", "late3", snapshotAt + 3_000);
    await me.mutation(api.retro.addToCluster, { roomId, clusterId: k, clientIds: ["late3"] });
    board = await me.query(api.retro.board, { roomId });
    expect(board.cards.find((c) => c._id === late3)!.late).toBeUndefined();
  });

  it("omits a dissolved cluster's dangling ref and excludes it from coverage; the denominator is the live entries", async () => {
    const t = convexTest(schema, modules);
    const { roomId, write, group, advance, byKind } = await seedRetro(t);
    await write("owner", "m1", 1_000);
    await write("owner", "m2", 1_100);
    const k = await group(["m1", "m2"], 1_200);
    const c3 = await write("guest", "c3", 2_000);
    await write("guest", "c4", 3_000);
    await advance(byKind("discuss").id);
    const me = as(t, "owner");
    await me.mutation(api.retro.markCovered, { roomId, topicId: k, covered: true });
    await me.mutation(api.retro.markCovered, { roomId, topicId: c3, covered: true });
    expect((await me.query(api.retro.board, { roomId })).walk).toMatchObject({ covered: 2, total: 3 });

    await me.mutation(api.retro.dissolveCluster, { roomId, clusterId: k });

    const board = await me.query(api.retro.board, { roomId });
    expect((await retroRow(t, roomId)).walk!.order).toHaveLength(3);
    expect(board.walk!.entries.map((e) => e.ref.id)).toEqual([c3, expect.any(String)]);
    expect(board.walk).toMatchObject({ covered: 1, total: 2 });
    // The freed members are loose topics outside the walk, not late: they were written before it.
    expect(board.walk!.outside.map((o) => o.late)).toEqual([false, false]);
  });
});
