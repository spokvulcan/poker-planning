/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// Clusters (spec §10.3, ADR-0011, ADR-0016): a cluster is an identity, not a
// location. Forming one and changing membership is open to every attendee;
// rename, merge and dissolve are `cardManagement`. The row stores a name
// and nothing else — no position, member list or count — and no member
// ever moves. Every act is correct in every stage (ADR-0010).

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

async function clustersOf(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("retroClusters")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

const POS = { x: 10, y: 20 };

/** An owner and a participant in a fresh teamless (named) retro, with three cards. */
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
  const write = (who: string, clientId: string, position = POS) =>
    as(t, who).mutation(api.retro.createCard, { roomId, clientId, text: clientId, promptId, position });
  await write("owner", "o1", { x: 0, y: 0 });
  await write("owner", "o2", { x: 300, y: 0 });
  await write("guest", "g1", { x: 0, y: 300 });
  return { roomId, stages: retro.stages, promptId };
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

describe("retro.formCluster (spec §10.3)", () => {
  it("a participant groups another person's cards: the row is named Group {n}, members point at it, nobody moves", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const before = await cardsOf(t, roomId);

    const clusterId = await as(t, "guest").mutation(api.retro.formCluster, {
      roomId,
      clientIds: ["o1", "o2"],
    });

    const clusters = await clustersOf(t, roomId);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]._id).toBe(clusterId);
    expect(clusters[0].name).toBe("Group 1");
    // The row is a name and nothing else (ADR-0016).
    expect(Object.keys(clusters[0]).sort()).toEqual(["_creationTime", "_id", "createdAt", "name", "roomId"]);
    const after = await cardsOf(t, roomId);
    for (const card of after) {
      const was = before.find((c) => c.clientId === card.clientId)!;
      expect(card.position).toEqual(was.position);
      expect(card.clusterId).toBe(["o1", "o2"].includes(card.clientId) ? clusterId : undefined);
    }
  });

  it("names count past the highest Group {n} the room carries, so a merged-away number is never reused", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const me = as(t, "owner");
    const first = await me.mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    const second = await me.mutation(api.retro.formCluster, { roomId, clientIds: ["o2"] });
    await me.mutation(api.retro.mergeClusters, { roomId, from: first, into: second });
    const third = await me.mutation(api.retro.formCluster, { roomId, clientIds: ["g1"] });
    const clusters = await clustersOf(t, roomId);
    expect(clusters.map((c) => c.name).sort()).toEqual(["Group 2", "Group 3"]);
    expect(clusters.find((c) => c._id === third)!.name).toBe("Group 3");
  });

  it("refuses an empty selection with `forbidden`, an unknown card with `missing`, and a non-member with a guard error", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    await seedUser(t, "stranger");
    expect(await codeOf(as(t, "guest").mutation(api.retro.formCluster, { roomId, clientIds: [] }))).toBe("forbidden");
    expect(await codeOf(as(t, "guest").mutation(api.retro.formCluster, { roomId, clientIds: ["o1", "nope"] }))).toBe("missing");
    await expect(
      as(t, "stranger").mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] })
    ).rejects.toThrow("Not a member");
    expect(await clustersOf(t, roomId)).toHaveLength(0);
  });

  it("a card already in a cluster is re-pointed, and a cluster emptied that way is removed", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const me = as(t, "owner");
    const first = await me.mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    const second = await me.mutation(api.retro.formCluster, { roomId, clientIds: ["o1", "o2"] });
    const clusters = await clustersOf(t, roomId);
    expect(clusters.map((c) => c._id)).toEqual([second]);
    expect(clusters[0]._id).not.toBe(first);
    const cards = await cardsOf(t, roomId);
    expect(cards.find((c) => c.clientId === "o1")!.clusterId).toBe(second);
  });
});

describe("membership (spec §10.3): open to everyone", () => {
  it("addToCluster and removeFromCluster set and null clusterId without moving anyone; the last removal deletes the row", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const clusterId = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });

    await as(t, "guest").mutation(api.retro.addToCluster, { roomId, clusterId, clientIds: ["g1", "o2"] });
    let cards = await cardsOf(t, roomId);
    expect(cards.every((c) => c.clusterId === clusterId)).toBe(true);
    expect(cards.find((c) => c.clientId === "g1")!.position).toEqual({ x: 0, y: 300 });

    await as(t, "guest").mutation(api.retro.removeFromCluster, { roomId, clientIds: ["o1", "o2"] });
    cards = await cardsOf(t, roomId);
    expect(cards.find((c) => c.clientId === "o1")!.clusterId).toBeUndefined();
    expect(cards.find((c) => c.clientId === "g1")!.clusterId).toBe(clusterId);
    expect(await clustersOf(t, roomId)).toHaveLength(1);

    await as(t, "guest").mutation(api.retro.removeFromCluster, { roomId, clientIds: ["g1"] });
    expect(await clustersOf(t, roomId)).toHaveLength(0);
    expect((await cardsOf(t, roomId)).every((c) => c.clusterId === undefined)).toBe(true);
  });

  it("addToCluster refuses an unknown cluster or card with `missing`", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const clusterId = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    await as(t, "owner").mutation(api.retro.dissolveCluster, { roomId, clusterId });
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.addToCluster, { roomId, clusterId, clientIds: ["g1"] }))
    ).toBe("missing");
    const again = await as(t, "owner").mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    expect(
      await codeOf(as(t, "guest").mutation(api.retro.addToCluster, { roomId, clusterId: again, clientIds: ["nope"] }))
    ).toBe("missing");
  });
});

describe("rename, merge, dissolve: cardManagement (spec §4.2, §10.3)", () => {
  it("a participant at defaults is refused each with `forbidden`; the owner does all three", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const owner = as(t, "owner");
    const guest = as(t, "guest");
    const a = await guest.mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    const b = await guest.mutation(api.retro.formCluster, { roomId, clientIds: ["o2", "g1"] });

    expect(await codeOf(guest.mutation(api.retro.renameCluster, { roomId, clusterId: a, name: "Demo" }))).toBe("forbidden");
    expect(await codeOf(guest.mutation(api.retro.mergeClusters, { roomId, from: a, into: b }))).toBe("forbidden");
    expect(await codeOf(guest.mutation(api.retro.dissolveCluster, { roomId, clusterId: a }))).toBe("forbidden");
    expect(await clustersOf(t, roomId)).toHaveLength(2);

    await owner.mutation(api.retro.renameCluster, { roomId, clusterId: a, name: "  Demo  " });
    expect((await clustersOf(t, roomId)).find((c) => c._id === a)!.name).toBe("Demo");

    const before = await cardsOf(t, roomId);
    await owner.mutation(api.retro.mergeClusters, { roomId, from: a, into: b });
    let clusters = await clustersOf(t, roomId);
    expect(clusters.map((c) => c._id)).toEqual([b]);
    let cards = await cardsOf(t, roomId);
    expect(cards.every((c) => c.clusterId === b)).toBe(true);
    for (const card of cards) {
      expect(card.position).toEqual(before.find((c) => c.clientId === card.clientId)!.position);
    }

    await owner.mutation(api.retro.dissolveCluster, { roomId, clusterId: b });
    clusters = await clustersOf(t, roomId);
    expect(clusters).toHaveLength(0);
    cards = await cardsOf(t, roomId);
    expect(cards.every((c) => c.clusterId === undefined)).toBe(true);
    for (const card of cards) {
      expect(card.position).toEqual(before.find((c) => c.clientId === card.clientId)!.position);
    }
  });

  it("rename refuses a blank or overlong name with `forbidden`; merge refuses a cluster into itself and an unknown cluster", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const owner = as(t, "owner");
    const a = await owner.mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
    expect(await codeOf(owner.mutation(api.retro.renameCluster, { roomId, clusterId: a, name: "   " }))).toBe("forbidden");
    expect(await codeOf(owner.mutation(api.retro.renameCluster, { roomId, clusterId: a, name: "x".repeat(81) }))).toBe("forbidden");
    expect(await codeOf(owner.mutation(api.retro.mergeClusters, { roomId, from: a, into: a }))).toBe("forbidden");
    const b = await owner.mutation(api.retro.formCluster, { roomId, clientIds: ["o2"] });
    await owner.mutation(api.retro.dissolveCluster, { roomId, clusterId: b });
    expect(await codeOf(owner.mutation(api.retro.mergeClusters, { roomId, from: b, into: a }))).toBe("missing");
    expect(await codeOf(owner.mutation(api.retro.mergeClusters, { roomId, from: a, into: b }))).toBe("missing");
    expect(await codeOf(owner.mutation(api.retro.renameCluster, { roomId, clusterId: b, name: "x" }))).toBe("missing");
    expect(await codeOf(owner.mutation(api.retro.dissolveCluster, { roomId, clusterId: b }))).toBe("missing");
  });
});

describe("no stage forbids a cluster act (ADR-0010)", () => {
  it("form, add, remove, rename, merge and dissolve all resolve at collect and at close", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedRetro(t);
    const owner = as(t, "owner");
    const run = async () => {
      const a = await owner.mutation(api.retro.formCluster, { roomId, clientIds: ["o1"] });
      const b = await owner.mutation(api.retro.formCluster, { roomId, clientIds: ["o2"] });
      await owner.mutation(api.retro.addToCluster, { roomId, clusterId: a, clientIds: ["g1"] });
      await owner.mutation(api.retro.removeFromCluster, { roomId, clientIds: ["g1"] });
      await owner.mutation(api.retro.renameCluster, { roomId, clusterId: a, name: "A" });
      await owner.mutation(api.retro.mergeClusters, { roomId, from: b, into: a });
      await owner.mutation(api.retro.dissolveCluster, { roomId, clusterId: a });
      expect(await clustersOf(t, roomId)).toHaveLength(0);
    };
    expect(stages[0].kind).toBe("collect");
    await run();
    await owner.mutation(api.retro.advance, { roomId, toStageId: stages[stages.length - 1].id });
    expect((await retroRow(t, roomId)).stages.find((s) => s.id === stages[stages.length - 1].id)!.kind).toBe("close");
    await run();
  });
});

describe("the board carries clusters (spec §9)", () => {
  it("retro.board lists the cluster row and the members' clusterId, identically for every viewer", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const clusterId = await as(t, "guest").mutation(api.retro.formCluster, { roomId, clientIds: ["o1", "g1"] });
    const asOwner = await as(t, "owner").query(api.retro.board, { roomId });
    const asGuest = await as(t, "guest").query(api.retro.board, { roomId });
    expect(asOwner).toEqual(asGuest);
    expect(asOwner.clusters.map((c) => ({ _id: c._id, name: c.name }))).toEqual([{ _id: clusterId, name: "Group 1" }]);
    expect(asOwner.cards.find((c) => c.clientId === "o1")!.clusterId).toBe(clusterId);
    expect(asOwner.cards.find((c) => c.clientId === "o2")!.clusterId).toBeUndefined();
  });
});
