/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { hashEditKey } from "./model/editKeys";
import * as Retro from "./model/retro";
import * as Rooms from "./model/rooms";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// Anonymous attribution (ADR-0012, spec §8.1, §8.2, §4.3, §9, §14): an
// anonymous card stores no author, only the hash of an edit key returned
// once; "mine" is the presented keys; the ratchet flips a named retro to
// anonymous in its first batch and strips every author across batches,
// once, irreversibly, by the owner alone.

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

async function userId(t: T, authUserId: string): Promise<Id<"users">> {
  return (await t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .unique()
  ))!._id;
}

/** An owner and a participant in a fresh teamless retro, anonymous when asked. */
async function seedRetro(t: T, attribution: "named" | "anonymous" = "anonymous") {
  await seedUser(t, "owner");
  await seedUser(t, "guest");
  const roomId = await as(t, "owner").mutation(api.retro.create, {
    name: "R",
    formatName: DEFAULT_RETRO_FORMAT.name,
  });
  await as(t, "guest").mutation(api.users.join, { roomId, name: "G", authUserId: "guest" });
  let retro = await retroRow(t, roomId);
  if (attribution === "anonymous") {
    await t.run((ctx) => ctx.db.patch(retro._id, { attribution }));
    retro = await retroRow(t, roomId);
  }
  return { roomId, stages: retro.stages, promptId: retro.format.prompts[0].id };
}

const POS = { x: 10, y: 20 };

async function write(t: T, who: string, roomId: Id<"rooms">, promptId: string, clientId: string, text = "hello") {
  return as(t, who).mutation(api.retro.createCard, { roomId, clientId, text, promptId, position: POS });
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

/** Drains `runAfter(0)` continuations (the room-cascade shape) on real timers. */
async function drainScheduled(t: T): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await t.finishInProgressScheduledFunctions();
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    if (!jobs.some((j) => j.state.kind === "pending")) return;
  }
  throw new Error("scheduled functions did not drain");
}

async function pendingStrips(t: T) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((j) => j.name.includes("stripCardAuthorsChunk") && j.state.kind === "pending");
}

describe("an anonymous card (ADR-0012, spec §8.1)", () => {
  it("stores only the key's hash, never an author, and returns the plaintext once", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);

    const result = await write(t, "guest", roomId, promptId, "c1", "  candid  ");

    expect(typeof result.editKey).toBe("string");
    expect(result.editKey!.length).toBeGreaterThanOrEqual(32);
    const [card] = await cardsOf(t, roomId);
    expect(card._id).toBe(result.cardId);
    expect(card.text).toBe("candid");
    expect(card.authorId).toBeUndefined();
    expect(card.editKeyHash).toBe(await hashEditKey(result.editKey!));
    expect(card.editKeyHash).not.toBe(result.editKey);
    // The plaintext is nowhere in the row.
    expect(JSON.stringify(card)).not.toContain(result.editKey);
  });

  it("a named card has exactly the author; an anonymous one exactly the hash; keys differ per card", async () => {
    const t = convexTest(schema, modules);
    const named = await seedRetro(t, "named");
    const namedResult = await write(t, "guest", named.roomId, named.promptId, "n1");
    expect(namedResult.editKey).toBeUndefined();
    const [namedCard] = await cardsOf(t, named.roomId);
    expect(namedCard.authorId).toBe(await userId(t, "guest"));
    expect(namedCard.editKeyHash).toBeUndefined();

    const retro = await retroRow(t, named.roomId);
    await t.run((ctx) => ctx.db.patch(retro._id, { attribution: "anonymous" }));
    const a = await write(t, "guest", named.roomId, named.promptId, "a1");
    const b = await write(t, "guest", named.roomId, named.promptId, "a2");
    expect(a.editKey).not.toBe(b.editKey);
    for (const card of (await cardsOf(t, named.roomId)).filter((c) => c.clientId !== "n1")) {
      expect(card.authorId).toBeUndefined();
      expect(typeof card.editKeyHash).toBe("string");
    }
  });

  it("a retried create returns the row without a second key", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    const first = await write(t, "guest", roomId, promptId, "c1", "one");
    const again = await write(t, "guest", roomId, promptId, "c1", "two");
    expect(again.cardId).toBe(first.cardId);
    expect(again.editKey).toBeUndefined();
    expect(await cardsOf(t, roomId)).toHaveLength(1);
  });
});

describe("the board and mine in an anonymous retro (spec §9)", () => {
  it("the board carries no author for anyone, names no writer, and mine is the presented keys", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages, promptId } = await seedRetro(t);
    const { editKey } = await write(t, "guest", roomId, promptId, "g1", "guest's");
    await write(t, "owner", roomId, promptId, "o1", "owner's");

    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[1].id });
    const board = await as(t, "guest").query(api.retro.board, { roomId });
    expect(board.writers).toEqual([]);
    for (const card of board.cards) {
      expect("authorId" in card).toBe(false);
      expect("editKeyHash" in card).toBe(false);
      expect("text" in card).toBe(true);
    }
    expect(await as(t, "owner").query(api.retro.board, { roomId })).toEqual(board);

    const mine = await as(t, "guest").query(api.retro.mine, { roomId, editKeys: [editKey!] });
    expect(mine.map((c) => c.clientId)).toEqual(["g1"]);
    expect(mine[0].text).toBe("guest's");
    expect("authorId" in mine[0]).toBe(false);
    expect("editKeyHash" in mine[0]).toBe(false);

    expect(await as(t, "guest").query(api.retro.mine, { roomId })).toEqual([]);
    expect(await as(t, "guest").query(api.retro.mine, { roomId, editKeys: ["wrong"] })).toEqual([]);
    // Keys are the capability: whoever presents one reads the card as theirs.
    expect((await as(t, "owner").query(api.retro.mine, { roomId, editKeys: [editKey!] })).map((c) => c.clientId)).toEqual(["g1"]);
  });

  it("the ADR-0015 projection cases hold in anonymous mode", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages, promptId } = await seedRetro(t);
    const { editKey } = await write(t, "guest", roomId, promptId, "g1", "guest's");
    await write(t, "owner", roomId, promptId, "o1", "owner's");
    const byClient = (cards: { clientId: string }[], clientId: string) =>
      cards.find((c) => c.clientId === clientId)! as Record<string, unknown>;
    const boardFor = (who: string) => as(t, who).query(api.retro.board, { roomId });

    // Hidden collect: silhouettes for everyone, the owner (facilitator) included.
    for (const who of ["guest", "owner"]) {
      const board = await boardFor(who);
      for (const card of board.cards) {
        expect(Object.keys(card).sort()).toEqual(["_id", "clientId", "position", "promptId"]);
      }
    }
    // Own text comes through the key alone.
    const mine = await as(t, "guest").query(api.retro.mine, { roomId, editKeys: [editKey!] });
    expect(mine[0].text).toBe("guest's");

    // The in-place toggle reveals without an advance, and hides again.
    await as(t, "owner").mutation(api.retro.setCardsVisible, { roomId, stageId: stages[0].id, value: "visible" });
    expect(byClient((await boardFor("guest")).cards, "o1").text).toBe("owner's");
    await as(t, "owner").mutation(api.retro.setCardsVisible, { roomId, stageId: stages[0].id, value: "hidden" });
    expect("text" in byClient((await boardFor("guest")).cards, "o1")).toBe(false);

    // Advance reveals every card, with no author; rewind hides again.
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[1].id });
    let board = await boardFor("guest");
    expect(byClient(board.cards, "o1")).toMatchObject({ text: "owner's" });
    expect("authorId" in byClient(board.cards, "o1")).toBe(false);
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[0].id });
    board = await boardFor("guest");
    expect("text" in byClient(board.cards, "o1")).toBe(false);

    // A second collect entry later in the list hides again.
    const second = await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "collect", index: 2 });
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[1].id });
    expect("text" in byClient((await boardFor("guest")).cards, "o1")).toBe(true);
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: second });
    expect("text" in byClient((await boardFor("guest")).cards, "o1")).toBe(false);
  });
});

describe("own-card rights by edit key (spec §8.1, §4.2)", () => {
  it("the key edits, moves and deletes; a wrong or missing key is `forbidden` for a participant", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    const { editKey } = await write(t, "guest", roomId, promptId, "g1", "mine");

    expect(
      await codeOf(as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId: "g1", text: "x" }))
    ).toBe("forbidden");
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId: "g1", text: "x", editKey: "wrong" }))
    ).toBe("forbidden");
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.deleteCard, { roomId, clientId: "g1", editKey: "wrong" }))
    ).toBe("forbidden");
    expect(
      await codeOf(
        as(t, "guest").mutation(api.retro.moveCards, {
          roomId,
          moves: [{ clientId: "g1", position: { x: 1, y: 1 }, editKey: "wrong" }],
        })
      )
    ).toBe("forbidden");
    let [card] = await cardsOf(t, roomId);
    expect(card).toMatchObject({ text: "mine", position: POS });

    await as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId: "g1", text: "edited", editKey });
    await as(t, "guest").mutation(api.retro.moveCards, {
      roomId,
      moves: [{ clientId: "g1", position: { x: 5, y: 6 }, editKey }],
    });
    [card] = await cardsOf(t, roomId);
    expect(card).toMatchObject({ text: "edited", position: { x: 5, y: 6 } });
    expect(card.authorId).toBeUndefined();
    expect(card.editKeyHash).toBe(await hashEditKey(editKey!));

    await as(t, "guest").mutation(api.retro.deleteCard, { roomId, clientId: "g1", editKey });
    expect(await cardsOf(t, roomId)).toHaveLength(0);
  });

  it("a batch mixing an owned and an unowned card is refused whole; a cardManagement holder needs no key", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    const { editKey } = await write(t, "guest", roomId, promptId, "g1", "guest's");
    await write(t, "owner", roomId, promptId, "o1", "owner's");

    expect(
      await codeOf(
        as(t, "guest").mutation(api.retro.moveCards, {
          roomId,
          moves: [
            { clientId: "g1", position: { x: 1, y: 1 }, editKey },
            { clientId: "o1", position: { x: 2, y: 2 } },
          ],
        })
      )
    ).toBe("forbidden");
    for (const card of await cardsOf(t, roomId)) expect(card.position).toEqual(POS);

    await as(t, "owner").mutation(api.retro.updateCard, { roomId, clientId: "g1", text: "tidied" });
    await as(t, "owner").mutation(api.retro.moveCards, {
      roomId,
      moves: [
        { clientId: "g1", position: { x: 1, y: 1 } },
        { clientId: "o1", position: { x: 2, y: 2 } },
      ],
    });
    const cards = await cardsOf(t, roomId);
    expect(cards.find((c) => c.clientId === "g1")).toMatchObject({ text: "tidied", position: { x: 1, y: 1 } });
    await as(t, "owner").mutation(api.retro.deleteCard, { roomId, clientId: "g1" });
    expect((await cardsOf(t, roomId)).map((c) => c.clientId)).toEqual(["o1"]);
  });
});

describe("the ratchet (ADR-0012, spec §4.3)", () => {
  /** A named retro whose cards were written by both members. */
  async function seedNamedWithCards(t: T, count: number) {
    const seeded = await seedRetro(t, "named");
    const guestId = await userId(t, "guest");
    const ownerId = await userId(t, "owner");
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        await ctx.db.insert("retroCards", {
          roomId: seeded.roomId,
          clientId: `c${i}`,
          text: `card ${i}`,
          promptId: seeded.promptId,
          position: POS,
          authorId: i % 2 === 0 ? guestId : ownerId,
          createdAt: now,
          updatedAt: now,
          committedAt: now,
        });
      }
    });
    return { ...seeded, guestId, ownerId };
  }

  it("flips the flag in the first batch, strips every card across batches, and a second ratchet is a no-op", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages, guestId } = await seedNamedWithCards(t, 1200);
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[1].id });

    await as(t, "owner").mutation(api.retro.ratchet, { roomId });

    // Before the continuation runs: the flag is flipped, no read shows an
    // author, and the rest of the strip is scheduled.
    expect((await retroRow(t, roomId)).attribution).toBe("anonymous");
    const rows = await cardsOf(t, roomId);
    expect(rows.filter((c) => c.authorId !== undefined).length).toBe(1200 - Retro.STRIP_BATCH_SIZE);
    const board = await as(t, "guest").query(api.retro.board, { roomId });
    expect(board.writers).toEqual([]);
    for (const card of board.cards) expect("authorId" in card).toBe(false);
    expect(await as(t, "guest").query(api.retro.mine, { roomId })).toEqual([]);
    expect(await pendingStrips(t)).toHaveLength(1);

    await drainScheduled(t);
    const stripped = await cardsOf(t, roomId);
    expect(stripped).toHaveLength(1200);
    for (const card of stripped) {
      expect(card.authorId).toBeUndefined();
      expect(card.editKeyHash).toBeUndefined();
    }

    await as(t, "owner").mutation(api.retro.ratchet, { roomId });
    expect(await pendingStrips(t)).toHaveLength(0);
    expect((await retroRow(t, roomId)).attribution).toBe("anonymous");
    // A stripped card is touchable only under cardManagement.
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId: "c0", text: "x" }))
    ).toBe("forbidden");
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.deleteCard, { roomId, clientId: "c0" }))
    ).toBe("forbidden");
    await as(t, "owner").mutation(api.retro.updateCard, { roomId, clientId: "c0", text: "tidied" });
    expect((await cardsOf(t, roomId)).find((c) => c.clientId === "c0")!.text).toBe("tidied");
    void guestId;
  });

  it("a small retro is stripped inside the pressing mutation with nothing scheduled", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedNamedWithCards(t, 3);
    await as(t, "owner").mutation(api.retro.ratchet, { roomId });
    expect(await pendingStrips(t)).toHaveLength(0);
    for (const card of await cardsOf(t, roomId)) expect(card.authorId).toBeUndefined();
    // New cards are keyed from here on.
    const retro = await retroRow(t, roomId);
    const { editKey } = await write(t, "guest", roomId, retro.format.prompts[0].id, "new");
    expect(typeof editKey).toBe("string");
  });

  it("the strip chunk makes progress by creation time, resumes inclusively, and reports done on a short batch", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedNamedWithCards(t, 5);
    const authored = async () => (await cardsOf(t, roomId)).filter((c) => c.authorId !== undefined).length;
    let step = await t.run((ctx) => Retro.stripCardAuthorsChunk(ctx, roomId, undefined, 2));
    expect(step.done).toBe(false);
    expect(await authored()).toBe(3);
    // Each further step resumes at the boundary instant (never past it), so
    // a step strips at least one more row until the short batch ends it.
    for (let steps = 1; !step.done; steps++) {
      const before = await authored();
      step = await t.run((ctx) => Retro.stripCardAuthorsChunk(ctx, roomId, step.after, 2));
      if (!step.done) expect(await authored()).toBeLessThan(before);
      expect(steps).toBeLessThan(10);
    }
    expect(await authored()).toBe(0);
  });

  it("a participant cannot ratchet, and a poker room has no ratchet", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedNamedWithCards(t, 2);
    await expect(as(t, "guest").mutation(api.retro.ratchet, { roomId })).rejects.toThrow("Only the owner");
    expect((await retroRow(t, roomId)).attribution).toBe("named");
    for (const card of await cardsOf(t, roomId)) expect(card.authorId).toBeDefined();

    const pokerId = await as(t, "owner").mutation(api.rooms.create, { name: "P" });
    await as(t, "owner").mutation(api.users.join, { roomId: pokerId, name: "O", authUserId: "owner" });
    expect(await codeOf(as(t, "owner").mutation(api.retro.ratchet, { roomId: pokerId }))).toBe("missing");
  });

  it("the pressing mutation bumps the activity clock once; the continuation never does (spec §14)", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedNamedWithCards(t, 1200);
    const stale = Date.now() - Rooms.RETRO_ACTIVITY_GRANULARITY_MS - 60_000;
    await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));

    await as(t, "owner").mutation(api.retro.ratchet, { roomId });
    const bumped = (await t.run((ctx) => ctx.db.get(roomId)))!.lastActivityAt;
    expect(bumped).toBeGreaterThan(stale);

    // Re-stale the clock, then run the continuation directly: it strips and leaves the clock alone.
    await t.run((ctx) => ctx.db.patch(roomId, { lastActivityAt: stale }));
    const [job] = await pendingStrips(t);
    await t.mutation(internal.maintenance.stripCardAuthorsChunk, job.args[0] as { roomId: Id<"rooms">; after?: number });
    expect((await t.run((ctx) => ctx.db.get(roomId)))!.lastActivityAt).toBe(stale);
    await drainScheduled(t);
    expect((await t.run((ctx) => ctx.db.get(roomId)))!.lastActivityAt).toBe(stale);
    expect((await cardsOf(t, roomId)).every((c) => c.authorId === undefined)).toBe(true);
  });
});
