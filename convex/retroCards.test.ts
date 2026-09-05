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

// Cards on the board (spec §8.1, §8.3, §9; ADR-0012 named half, ADR-0015,
// ADR-0022): writing, own-card rights, `cardManagement` on another's card,
// `clientId` dedupe, the silhouette projection by the shared pointer, and
// the four refusal codes on their paths. No stage ever forbids a card act.
// The anonymous half (edit keys, the ratchet) is retroAttribution.test.ts.

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

/** An owner and a participant in a fresh teamless (named) retro. */
async function seedRetro(t: T) {
  await seedUser(t, "owner");
  await seedUser(t, "guest");
  const roomId = await as(t, "owner").mutation(api.retro.create, {
    name: "R",
    formatName: DEFAULT_RETRO_FORMAT.name,
  });
  await as(t, "guest").mutation(api.users.join, { roomId, name: "G", authUserId: "guest" });
  const retro = await retroRow(t, roomId);
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

describe("retro.createCard", () => {
  it("writes a card with the caller as author and the three stamps equal", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);

    const { cardId, editKey } = await write(t, "guest", roomId, promptId, "c1", "  keep the demo  ");

    expect(editKey).toBeUndefined();
    const [card] = await cardsOf(t, roomId);
    expect(card._id).toBe(cardId);
    expect(card).toMatchObject({
      clientId: "c1",
      text: "keep the demo",
      promptId,
      position: POS,
      authorId: await userId(t, "guest"),
    });
    expect(card.editKeyHash).toBeUndefined();
    expect(card.createdAt).toBe(card.committedAt);
    expect(card.updatedAt).toBe(card.createdAt);
  });

  it("a retried create with the same clientId returns the existing row and inserts nothing", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);

    const first = await write(t, "guest", roomId, promptId, "c1", "one");
    const again = await write(t, "guest", roomId, promptId, "c1", "changed");

    expect(again).toEqual(first);
    const cards = await cardsOf(t, roomId);
    expect(cards).toHaveLength(1);
    expect(cards[0].text).toBe("one");
  });

  it("refuses an unknown prompt with `missing`, blank text with `forbidden`, and a non-member with a guard error", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    await seedUser(t, "stranger");

    expect(await codeOf(write(t, "guest", roomId, "nope", "c1"))).toBe("missing");
    expect(await codeOf(write(t, "guest", roomId, promptId, "c2", "   "))).toBe("forbidden");
    await expect(write(t, "stranger", roomId, promptId, "c3")).rejects.toThrow("Not a member");
    expect(await cardsOf(t, roomId)).toHaveLength(0);
  });
});

describe("own-card rights and cardManagement (spec §8.1, §4.2)", () => {
  it("the author edits, moves and deletes their own card; a participant is refused on another's with `forbidden`", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    await write(t, "owner", roomId, promptId, "o1", "owner's");
    await write(t, "guest", roomId, promptId, "g1", "guest's");

    await as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId: "g1", text: "edited" });
    await as(t, "guest").mutation(api.retro.moveCards, {
      roomId,
      moves: [{ clientId: "g1", position: { x: 99, y: 98 } }],
    });
    let cards = await cardsOf(t, roomId);
    const mine = cards.find((c) => c.clientId === "g1")!;
    expect(mine.text).toBe("edited");
    expect(mine.position).toEqual({ x: 99, y: 98 });
    expect(mine.authorId).toBe(await userId(t, "guest"));

    expect(
      await codeOf(as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId: "o1", text: "x" }))
    ).toBe("forbidden");
    expect(
      await codeOf(
        as(t, "guest").mutation(api.retro.moveCards, {
          roomId,
          moves: [{ clientId: "g1", position: POS }, { clientId: "o1", position: POS }],
        })
      )
    ).toBe("forbidden");
    expect(await codeOf(as(t, "guest").mutation(api.retro.deleteCard, { roomId, clientId: "o1" }))).toBe(
      "forbidden"
    );
    cards = await cardsOf(t, roomId);
    expect(cards.find((c) => c.clientId === "o1")).toMatchObject({ text: "owner's", position: POS });
    // A refused batch moves nothing, the caller's own card included.
    expect(cards.find((c) => c.clientId === "g1")!.position).toEqual({ x: 99, y: 98 });

    await as(t, "guest").mutation(api.retro.deleteCard, { roomId, clientId: "g1" });
    expect((await cardsOf(t, roomId)).map((c) => c.clientId)).toEqual(["o1"]);
  });

  it("a cardManagement holder touches another's card and the author never changes", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    await write(t, "guest", roomId, promptId, "g1", "guest's");
    const guestId = await userId(t, "guest");

    await as(t, "owner").mutation(api.retro.updateCard, { roomId, clientId: "g1", text: "tidied" });
    await as(t, "owner").mutation(api.retro.moveCards, {
      roomId,
      moves: [{ clientId: "g1", position: { x: 1, y: 2 } }],
    });
    const [card] = await cardsOf(t, roomId);
    expect(card).toMatchObject({ text: "tidied", position: { x: 1, y: 2 }, authorId: guestId });

    await as(t, "owner").mutation(api.retro.deleteCard, { roomId, clientId: "g1" });
    expect(await cardsOf(t, roomId)).toHaveLength(0);
  });

  it("a card the room does not carry is `missing`; blank text on edit is `forbidden`", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    await write(t, "guest", roomId, promptId, "g1");

    expect(await codeOf(as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId: "zz", text: "x" }))).toBe("missing");
    expect(await codeOf(as(t, "guest").mutation(api.retro.deleteCard, { roomId, clientId: "zz" }))).toBe("missing");
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.moveCards, { roomId, moves: [{ clientId: "zz", position: POS }] }))
    ).toBe("missing");
    expect(await codeOf(as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId: "g1", text: " " }))).toBe("forbidden");
  });

  it("a marquee drag is one batch: every card in it moves in one call", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    await write(t, "guest", roomId, promptId, "a");
    await write(t, "guest", roomId, promptId, "b");

    await as(t, "guest").mutation(api.retro.moveCards, {
      roomId,
      moves: [
        { clientId: "a", position: { x: 1, y: 1 } },
        { clientId: "b", position: { x: 2, y: 2 } },
      ],
    });
    const cards = await cardsOf(t, roomId);
    expect(cards.find((c) => c.clientId === "a")!.position).toEqual({ x: 1, y: 1 });
    expect(cards.find((c) => c.clientId === "b")!.position).toEqual({ x: 2, y: 2 });
  });
});

describe("the silhouette projection (ADR-0015, spec §8.3, §9)", () => {
  /** Two members with a card each, the pointer at `collect` (hidden). */
  async function seedTwoCards(t: T) {
    const seeded = await seedRetro(t);
    await write(t, "owner", seeded.roomId, seeded.promptId, "o1", "owner's text");
    await write(t, "guest", seeded.roomId, seeded.promptId, "g1", "guest's text");
    return seeded;
  }

  const byClient = (cards: { clientId: string }[], clientId: string) =>
    cards.find((c) => c.clientId === clientId)! as Record<string, unknown>;

  it("in a hidden entry the board carries silhouettes for everyone, the author included; `mine` carries the text", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedTwoCards(t);

    const board = await as(t, "guest").query(api.retro.board, { roomId });
    expect(board.retro.currentStageId).toBe(board.retro.stages[0].id);
    expect(board.clusters).toEqual([]);
    expect(board.cards).toHaveLength(2);
    for (const card of board.cards) {
      expect(Object.keys(card).sort()).toEqual(["_id", "clientId", "position", "promptId"]);
      expect(card.promptId).toBe(promptId);
    }
    // Identical bytes for every viewer: the owner's read equals the guest's.
    expect(await as(t, "owner").query(api.retro.board, { roomId })).toEqual(board);

    const mine = await as(t, "guest").query(api.retro.mine, { roomId });
    expect(mine.map((c) => c.clientId)).toEqual(["g1"]);
    expect(mine[0].text).toBe("guest's text");
    expect(mine[0].authorId).toBe(await userId(t, "guest"));
    expect("editKeyHash" in mine[0]).toBe(false);
  });

  it("advancing to a visible entry reveals every card with its author; rewinding hides again", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedTwoCards(t);
    const ownerId = await userId(t, "owner");

    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[1].id });
    let board = await as(t, "guest").query(api.retro.board, { roomId });
    expect(byClient(board.cards, "o1")).toMatchObject({ text: "owner's text", authorId: ownerId });
    expect(byClient(board.cards, "g1")).toMatchObject({ text: "guest's text" });
    expect("editKeyHash" in byClient(board.cards, "o1")).toBe(false);

    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[0].id });
    board = await as(t, "guest").query(api.retro.board, { roomId });
    expect("text" in byClient(board.cards, "o1")).toBe(false);
    expect("authorId" in byClient(board.cards, "o1")).toBe(false);
  });

  it("the in-place toggle reveals and hides without an advance, and a visible collect returns text", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedTwoCards(t);

    await as(t, "owner").mutation(api.retro.setCardsVisible, { roomId, stageId: stages[0].id, value: "visible" });
    let board = await as(t, "guest").query(api.retro.board, { roomId });
    expect(byClient(board.cards, "o1").text).toBe("owner's text");

    await as(t, "owner").mutation(api.retro.setCardsVisible, { roomId, stageId: stages[0].id, value: "hidden" });
    board = await as(t, "guest").query(api.retro.board, { roomId });
    expect("text" in byClient(board.cards, "o1")).toBe(false);
  });

  it("the shared pointer governs: no client argument moves the projection, and no role peeks", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTwoCards(t);
    // The owner is the facilitator here; their board is the guest's board.
    const board = await as(t, "owner").query(api.retro.board, { roomId });
    expect("text" in byClient(board.cards, "g1")).toBe(false);
  });

  it("a second collect entry later in the list hides again", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedTwoCards(t);
    const second = await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "collect", index: 2 });
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[1].id });
    expect("text" in byClient((await as(t, "guest").query(api.retro.board, { roomId })).cards, "o1")).toBe(true);
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: second });
    expect("text" in byClient((await as(t, "guest").query(api.retro.board, { roomId })).cards, "o1")).toBe(false);
  });

  it("the board names who has written in a named retro, silhouettes or not; a stranger reads nothing", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTwoCards(t);
    await seedUser(t, "stranger");
    const board = await as(t, "guest").query(api.retro.board, { roomId });
    expect([...board.writers].sort()).toEqual([await userId(t, "owner"), await userId(t, "guest")].sort());
    await expect(as(t, "stranger").query(api.retro.board, { roomId })).rejects.toThrow("access");
    await expect(as(t, "stranger").query(api.retro.mine, { roomId })).rejects.toThrow("access");
  });
});

describe("a stage never forbids a card act (ADR-0010)", () => {
  it("create, edit, move and delete succeed with the pointer at discuss and at close", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages, promptId } = await seedRetro(t);
    for (const kind of ["discuss", "close"] as const) {
      const entry = stages.find((s) => s.kind === kind)!;
      await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: entry.id });
      const clientId = `card-${kind}`;
      await write(t, "guest", roomId, promptId, clientId);
      await as(t, "guest").mutation(api.retro.updateCard, { roomId, clientId, text: "late thought" });
      await as(t, "guest").mutation(api.retro.moveCards, { roomId, moves: [{ clientId, position: { x: 5, y: 5 } }] });
      expect((await cardsOf(t, roomId)).find((c) => c.clientId === clientId)).toMatchObject({
        text: "late thought",
        position: { x: 5, y: 5 },
      });
      await as(t, "guest").mutation(api.retro.deleteCard, { roomId, clientId });
    }
    expect(await cardsOf(t, roomId)).toHaveLength(0);
  });
});

describe("attribution (ADR-0012, named half; the anonymous half is retroAttribution.test.ts)", () => {
  it("linking an anonymous account to an existing permanent one re-points authorId", async () => {
    const t = convexTest(schema, modules);
    const { roomId, promptId } = await seedRetro(t);
    await write(t, "guest", roomId, promptId, "g1");
    const anonId = await userId(t, "guest");
    const permanentId = await seedNamedUser(t, "perm", "P", "permanent");

    await t.run((ctx) =>
      Users.linkAnonymousToPermanent(ctx, {
        oldAuthUserId: "guest",
        newAuthUserId: "perm",
        email: "p@example.com",
      })
    );

    const [card] = await cardsOf(t, roomId);
    expect(card.authorId).toBe(permanentId);
    expect(await t.run((ctx) => ctx.db.get(anonId))).toBeNull();
    const mine = await as(t, "perm").query(api.retro.mine, { roomId });
    expect(mine.map((c) => c.clientId)).toEqual(["g1"]);
  });
});
