/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT, RETRO_FORMATS, findFormat } from "./model/retroFormats";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// Retro settings (ADR-0021, spec §6.4, §23.1): under `retroSettings` a
// holder renames the retro, edits the join policy and the cards-due date,
// edits prompts at any stage, and edits the stage list except `collect`,
// `discuss` and the current entry. Past entries are never rewritten; a
// prompt with cards is never removed; the shipped constant is never touched.

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

/** An owner and a participant in a fresh teamless retro. */
async function seedRetro(t: T, formatName = DEFAULT_RETRO_FORMAT.name) {
  await seedUser(t, "owner");
  await seedUser(t, "guest");
  const roomId = await as(t, "owner").mutation(api.retro.create, { name: "R", formatName });
  await as(t, "guest").mutation(api.users.join, { roomId, name: "G", authUserId: "guest" });
  const retro = await retroRow(t, roomId);
  return { roomId, retro };
}

/** A card answering `promptId`, seeded directly (the cards ticket owns the write). */
async function seedCard(t: T, roomId: Id<"rooms">, promptId: string) {
  return t.run((ctx) =>
    ctx.db.insert("retroCards", {
      roomId,
      clientId: crypto.randomUUID(),
      text: "a card",
      promptId,
      position: { x: 0, y: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      committedAt: Date.now(),
    })
  );
}

describe("retro.rename, setJoinPolicy, setCollectUntil", () => {
  it("a retroSettings holder renames the retro; a participant at defaults is refused", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);

    await as(t, "owner").mutation(api.retro.rename, { roomId, name: "Sprint 43" });
    expect((await t.run((ctx) => ctx.db.get(roomId)))?.name).toBe("Sprint 43");

    await expect(
      as(t, "guest").mutation(api.retro.rename, { roomId, name: "Mine" })
    ).rejects.toThrow("Only facilitators and the owner");
    await expect(
      as(t, "owner").mutation(api.retro.rename, { roomId, name: "  " })
    ).rejects.toThrow("Room name is required");
  });

  it("edits the join policy, refusing teamMembers on a teamless retro", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);

    await as(t, "owner").mutation(api.retro.setJoinPolicy, { roomId, joinPolicy: "permanentAccounts" });
    expect((await t.run((ctx) => ctx.db.get(roomId)))?.joinPolicy).toBe("permanentAccounts");

    await expect(
      as(t, "owner").mutation(api.retro.setJoinPolicy, { roomId, joinPolicy: "teamMembers" })
    ).rejects.toThrow("Only a team retro can be limited to team members");
    await expect(
      as(t, "guest").mutation(api.retro.setJoinPolicy, { roomId, joinPolicy: "anyone" })
    ).rejects.toThrow("Only facilitators and the owner");
    expect((await t.run((ctx) => ctx.db.get(roomId)))?.joinPolicy).toBe("permanentAccounts");
  });

  it("sets and clears the cards-due date", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const due = Date.now() + 86_400_000;

    await as(t, "owner").mutation(api.retro.setCollectUntil, { roomId, collectUntil: due });
    expect((await retroRow(t, roomId)).collectUntil).toBe(due);
    await as(t, "owner").mutation(api.retro.setCollectUntil, { roomId });
    expect((await retroRow(t, roomId)).collectUntil).toBeUndefined();
    await expect(
      as(t, "guest").mutation(api.retro.setCollectUntil, { roomId, collectUntil: due })
    ).rejects.toThrow("Only facilitators and the owner");
  });
});

describe("retro prompts", () => {
  it("edits a prompt's label, hint and tint at any stage, changing no card", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro } = await seedRetro(t);
    const prompt = retro.format.prompts[0];
    const cardId = await seedCard(t, roomId, prompt.id);
    // Not in collect: prompt edits are not a stage act.
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: retro.stages[2].id });

    await as(t, "owner").mutation(api.retro.updatePrompt, {
      roomId,
      promptId: prompt.id,
      label: "What worked?",
      hint: "Keep it.",
      color: "teal",
    });

    const after = await retroRow(t, roomId);
    expect(after.format.prompts[0]).toEqual({
      ...prompt,
      label: "What worked?",
      hint: "Keep it.",
      color: "teal",
    });
    expect(after.format.prompts.slice(1)).toEqual(retro.format.prompts.slice(1));
    expect((await t.run((ctx) => ctx.db.get(cardId)))?.promptId).toBe(prompt.id);
    // The shipped constant is untouched.
    expect(DEFAULT_RETRO_FORMAT.prompts[0].label).toBe("What went well?");
  });

  it("refuses a blank label, a tint outside the palette, an unknown prompt and a participant", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro } = await seedRetro(t);
    const promptId = retro.format.prompts[0].id;

    await expect(
      as(t, "owner").mutation(api.retro.updatePrompt, { roomId, promptId, label: "  " })
    ).rejects.toThrow("A prompt needs a label");
    await expect(
      as(t, "owner").mutation(api.retro.updatePrompt, { roomId, promptId, color: "chartreuse" })
    ).rejects.toThrow("Pick a tint from the palette");
    await expect(
      as(t, "owner").mutation(api.retro.updatePrompt, { roomId, promptId: "nope", label: "x" })
    ).rejects.toThrow("That prompt is no longer in this retro");
    await expect(
      as(t, "guest").mutation(api.retro.updatePrompt, { roomId, promptId, label: "x" })
    ).rejects.toThrow("Only facilitators and the owner");
    expect((await retroRow(t, roomId)).format).toEqual(retro.format);
  });

  it("adds prompts up to ten, each with a fresh id and the next order", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro } = await seedRetro(t);
    const start = retro.format.prompts.length;

    for (let i = start; i < 10; i++) {
      await as(t, "owner").mutation(api.retro.addPrompt, {
        roomId,
        label: `Prompt ${i}`,
        color: "pink",
      });
    }
    const after = await retroRow(t, roomId);
    expect(after.format.prompts).toHaveLength(10);
    expect(after.format.prompts.map((p) => p.order)).toEqual([...Array(10).keys()]);
    expect(new Set(after.format.prompts.map((p) => p.id)).size).toBe(10);
    expect(after.format.prompts[start]).toMatchObject({ label: `Prompt ${start}`, color: "pink" });

    await expect(
      as(t, "owner").mutation(api.retro.addPrompt, { roomId, label: "Eleven", color: "pink" })
    ).rejects.toThrow("A retro has at most 10 prompts");
    expect((await retroRow(t, roomId)).format.prompts).toHaveLength(10);
  });

  it("removes a prompt only while no card answers it, and never the last one", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro } = await seedRetro(t);
    const [answered, free] = retro.format.prompts;
    await seedCard(t, roomId, answered.id);

    await expect(
      as(t, "owner").mutation(api.retro.removePrompt, { roomId, promptId: answered.id })
    ).rejects.toThrow("Cards still answer this prompt");

    await as(t, "owner").mutation(api.retro.removePrompt, { roomId, promptId: free.id });
    const after = await retroRow(t, roomId);
    expect(after.format.prompts.map((p) => p.id)).toEqual(
      retro.format.prompts.filter((p) => p.id !== free.id).map((p) => p.id)
    );
    expect(after.format.prompts.map((p) => p.order)).toEqual([0, 1]);

    await expect(
      as(t, "owner").mutation(api.retro.removePrompt, { roomId, promptId: answered.id })
    ).rejects.toThrow("Cards still answer this prompt");

    // With its cards gone the prompt may go, but never the last one.
    await t.run(async (ctx) => {
      for await (const card of ctx.db.query("retroCards").withIndex("by_room", (q) => q.eq("roomId", roomId))) {
        await ctx.db.delete(card._id);
      }
    });
    await as(t, "owner").mutation(api.retro.removePrompt, { roomId, promptId: answered.id });
    const only = (await retroRow(t, roomId)).format.prompts;
    expect(only).toHaveLength(1);
    await expect(
      as(t, "owner").mutation(api.retro.removePrompt, { roomId, promptId: only[0].id })
    ).rejects.toThrow("A retro needs at least one prompt");
  });
});

describe("retro stage list", () => {
  it("adds an entry with its kind's defaults, at an index or at the end, up to ten", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro } = await seedRetro(t);
    expect(retro.stages.map((s) => s.kind)).toEqual(["collect", "group", "vote", "discuss", "close"]);

    const reviewId = await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "review", index: 1 });
    const voteId = await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "vote" });
    const after = await retroRow(t, roomId);
    expect(after.stages.map((s) => s.kind)).toEqual(["collect", "review", "group", "vote", "discuss", "close", "vote"]);
    expect(after.stages[1]).toEqual({ id: reviewId, kind: "review", cardsVisible: "visible", tallyVisible: "visible" });
    expect(after.stages[6]).toEqual({ id: voteId, kind: "vote", cardsVisible: "visible", tallyVisible: "hidden", voteBudget: 5 });
    // The earlier entries are the same rows: past entries are never rewritten.
    expect(after.stages.filter((s) => s.id !== reviewId && s.id !== voteId)).toEqual(retro.stages);
    expect(after.currentStageId).toBe(retro.currentStageId);

    for (let i = after.stages.length; i < 10; i++) {
      await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "group" });
    }
    await expect(
      as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "close" })
    ).rejects.toThrow("A retro has at most 10 stages");
    expect((await retroRow(t, roomId)).stages).toHaveLength(10);
  });

  it("removes any entry except collect, discuss and the current one", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro } = await seedRetro(t);
    const byKind = Object.fromEntries(retro.stages.map((s) => [s.kind, s]));
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: byKind.group.id });

    await expect(
      as(t, "owner").mutation(api.retro.removeStage, { roomId, stageId: byKind.collect.id })
    ).rejects.toThrow("Collect and Discuss stay in every retro");
    await expect(
      as(t, "owner").mutation(api.retro.removeStage, { roomId, stageId: byKind.discuss.id })
    ).rejects.toThrow("Collect and Discuss stay in every retro");
    await expect(
      as(t, "owner").mutation(api.retro.removeStage, { roomId, stageId: byKind.group.id })
    ).rejects.toThrow("The current stage keeps its place");
    await expect(
      as(t, "owner").mutation(api.retro.removeStage, { roomId, stageId: "nope" })
    ).rejects.toThrow("That stage is no longer in this retro");
    await expect(
      as(t, "guest").mutation(api.retro.removeStage, { roomId, stageId: byKind.vote.id })
    ).rejects.toThrow("Only facilitators and the owner");

    await as(t, "owner").mutation(api.retro.removeStage, { roomId, stageId: byKind.vote.id });
    const after = await retroRow(t, roomId);
    expect(after.stages.map((s) => s.kind)).toEqual(["collect", "group", "discuss", "close"]);
    expect(after.currentStageId).toBe(byKind.group.id);
  });

  it("a second entry of a locked kind may go; the last of its kind may not", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro } = await seedRetro(t);
    const second = await as(t, "owner").mutation(api.retro.addStage, { roomId, kind: "discuss" });
    await as(t, "owner").mutation(api.retro.removeStage, { roomId, stageId: second });
    expect((await retroRow(t, roomId)).stages).toEqual(retro.stages);
  });

  it("reorders the list as a permutation, with collect, discuss and the current entry holding their place", async () => {
    const t = convexTest(schema, modules);
    const { roomId, retro } = await seedRetro(t);
    const [collect, group, vote, discuss, close] = retro.stages;

    // Swap group and vote: collect (current) and discuss keep their index.
    await as(t, "owner").mutation(api.retro.reorderStages, {
      roomId,
      stageIds: [collect.id, vote.id, group.id, discuss.id, close.id],
    });
    const after = await retroRow(t, roomId);
    expect(after.stages).toEqual([collect, vote, group, discuss, close]);

    await expect(
      as(t, "owner").mutation(api.retro.reorderStages, {
        roomId,
        stageIds: [vote.id, collect.id, group.id, discuss.id, close.id],
      })
    ).rejects.toThrow("Collect, Discuss and the current stage keep their place");
    await expect(
      as(t, "owner").mutation(api.retro.reorderStages, {
        roomId,
        stageIds: [collect.id, vote.id, group.id, close.id, discuss.id],
      })
    ).rejects.toThrow("Collect, Discuss and the current stage keep their place");
    await expect(
      as(t, "owner").mutation(api.retro.reorderStages, {
        roomId,
        stageIds: [collect.id, vote.id, group.id, discuss.id],
      })
    ).rejects.toThrow("The new order must list every stage once");
    await expect(
      as(t, "owner").mutation(api.retro.reorderStages, {
        roomId,
        stageIds: [collect.id, vote.id, vote.id, discuss.id, close.id],
      })
    ).rejects.toThrow("The new order must list every stage once");
    await expect(
      as(t, "guest").mutation(api.retro.reorderStages, {
        roomId,
        stageIds: [collect.id, group.id, vote.id, discuss.id, close.id],
      })
    ).rejects.toThrow("Only facilitators and the owner");
    expect((await retroRow(t, roomId)).stages).toEqual([collect, vote, group, discuss, close]);
  });
});

describe("retro.create — the edited copy (spec §6.1)", () => {
  const shippedSnapshot = JSON.stringify(RETRO_FORMATS);

  it("stamps the edited prompts and stage list under the creator's name, leaving the shipped constant untouched", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "owner");
    const base = findFormat("Sailboat")!;
    const format = {
      name: "Our sailboat",
      prompts: [
        ...base.prompts.map((p, i) => (i === 0 ? { ...p, label: "Tailwind", color: "pink" } : { ...p })),
        { id: "storm", label: "Storm", hint: "A risk we saw coming.", color: "violet", order: 4 },
      ],
    };
    const stages = [
      { id: "c", kind: "collect" as const, cardsVisible: "visible" as const, tallyVisible: "visible" as const },
      { id: "v", kind: "vote" as const, cardsVisible: "visible" as const, tallyVisible: "hidden" as const, voteBudget: 3 },
      { id: "d", kind: "discuss" as const, cardsVisible: "visible" as const, tallyVisible: "visible" as const },
    ];

    const roomId = await as(t, "owner").mutation(api.retro.create, { name: "R", format, stages });

    const retro = await retroRow(t, roomId);
    expect(retro.format).toEqual(format);
    expect(retro.stages).toEqual(stages);
    expect(retro.currentStageId).toBe("c");
    expect(JSON.stringify(RETRO_FORMATS)).toBe(shippedSnapshot);
    expect(findFormat("Sailboat")!.prompts[0].label).toBe("Wind");
  });

  it("an edited copy keeps its base name when the creator did not rename it", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.retro.create, {
      name: "R",
      format: { name: DEFAULT_RETRO_FORMAT.name, prompts: [{ id: "one", label: "One", color: "blue", order: 0 }] },
    });
    const retro = await retroRow(t, roomId);
    expect(retro.format.name).toBe(DEFAULT_RETRO_FORMAT.name);
    expect(retro.format.prompts).toHaveLength(1);
    // No stages given: the standard seed for a teamless retro.
    expect(retro.stages.map((s) => s.kind)).toEqual(["collect", "group", "vote", "discuss", "close"]);
  });

  it("refuses an eleventh prompt, a list without collect or discuss, and a tint outside the palette", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "owner");
    const prompts = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, color: "blue", order: i }));
    await expect(
      as(t, "owner").mutation(api.retro.create, { name: "R", format: { name: "X", prompts } })
    ).rejects.toThrow("A retro has at most 10 prompts");
    await expect(
      as(t, "owner").mutation(api.retro.create, {
        name: "R",
        format: { name: "X", prompts: prompts.slice(0, 1) },
        stages: [{ id: "g", kind: "group", cardsVisible: "visible", tallyVisible: "visible" }],
      })
    ).rejects.toThrow("Collect and Discuss stay in every retro");
    await expect(
      as(t, "owner").mutation(api.retro.create, {
        name: "R",
        format: { name: "X", prompts: [{ id: "p", label: "P", color: "mauve", order: 0 }] },
      })
    ).rejects.toThrow("Pick a tint from the palette");
    await expect(
      as(t, "owner").mutation(api.retro.create, {
        name: "R",
        format: { name: "X", prompts: [{ id: "p", label: " ", color: "blue", order: 0 }] },
      })
    ).rejects.toThrow("A prompt needs a label");
    expect(await t.run((ctx) => ctx.db.query("rooms").collect())).toEqual([]);
  });
});
