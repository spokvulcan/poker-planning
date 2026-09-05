/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// Stages (ADR-0010, spec §7): advance moves the shared pointer to any entry,
// forward or back, re-stamps `currentStageEnteredAt`, and is `stageFlow`.
// The in-place reveal toggle and the timebox act on the current entry only.
// Nothing here forbids by stage; every act is a person's.

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

/** An owner and a participant in a fresh teamless retro. */
async function seedRetro(t: T) {
  await seedUser(t, "owner");
  await seedUser(t, "guest");
  const roomId = await as(t, "owner").mutation(api.retro.create, {
    name: "R",
    formatName: DEFAULT_RETRO_FORMAT.name,
  });
  await as(t, "guest").mutation(api.users.join, { roomId, name: "G", authUserId: "guest" });
  const retro = await retroRow(t, roomId);
  return { roomId, stages: retro.stages };
}

describe("retro.advance", () => {
  it("is refused for a participant at defaults, and for an entry the list does not carry", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedRetro(t);

    await expect(
      as(t, "guest").mutation(api.retro.advance, { roomId, toStageId: stages[1].id })
    ).rejects.toThrow("Only facilitators and the owner");
    await expect(
      as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: "nope" })
    ).rejects.toThrow("That stage is no longer in this retro");
    expect((await retroRow(t, roomId)).currentStageId).toBe(stages[0].id);
  });

  it("moves the shared pointer forward and back and re-stamps the entered-at instant", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedRetro(t);
    const before = (await retroRow(t, roomId)).currentStageEnteredAt;
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[3].id });
    let retro = await retroRow(t, roomId);
    expect(retro.currentStageId).toBe(stages[3].id);
    expect(retro.currentStageEnteredAt).toBeGreaterThanOrEqual(before);
    const enteredThird = retro.currentStageEnteredAt;

    // Back the stamp up so the re-stamp is observable within one tick.
    await t.run((ctx) => ctx.db.patch(retro._id, { currentStageEnteredAt: enteredThird - 5_000 }));
    await as(t, "owner").mutation(api.retro.advance, { roomId, toStageId: stages[0].id });
    retro = await retroRow(t, roomId);
    expect(retro.currentStageId).toBe(stages[0].id);
    expect(retro.currentStageEnteredAt).toBeGreaterThan(enteredThird - 5_000);
  });
});

describe("retro.setCardsVisible", () => {
  it("flips the current entry's reveal policy in place, both ways", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedRetro(t);
    expect(stages[0]).toMatchObject({ kind: "collect", cardsVisible: "hidden" });

    await as(t, "owner").mutation(api.retro.setCardsVisible, {
      roomId,
      stageId: stages[0].id,
      value: "visible",
    });
    expect((await retroRow(t, roomId)).stages[0].cardsVisible).toBe("visible");

    await as(t, "owner").mutation(api.retro.setCardsVisible, {
      roomId,
      stageId: stages[0].id,
      value: "hidden",
    });
    const retro = await retroRow(t, roomId);
    expect(retro.stages[0].cardsVisible).toBe("hidden");
    // Nothing else on the list moved.
    expect(retro.stages.slice(1)).toEqual(stages.slice(1));
  });

  it("refuses any stage id other than the current entry, and a participant at defaults", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedRetro(t);

    await expect(
      as(t, "owner").mutation(api.retro.setCardsVisible, {
        roomId,
        stageId: stages[2].id,
        value: "hidden",
      })
    ).rejects.toThrow("Only the current stage can be changed here");
    await expect(
      as(t, "guest").mutation(api.retro.setCardsVisible, {
        roomId,
        stageId: stages[0].id,
        value: "visible",
      })
    ).rejects.toThrow("Only facilitators and the owner");
    expect((await retroRow(t, roomId)).stages).toEqual(stages);
  });
});

describe("retro.setTimebox", () => {
  it("sets and clears the current entry's advisory timebox", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedRetro(t);

    await as(t, "owner").mutation(api.retro.setTimebox, {
      roomId,
      stageId: stages[0].id,
      minutes: 10,
    });
    expect((await retroRow(t, roomId)).stages[0].timeboxMinutes).toBe(10);

    await as(t, "owner").mutation(api.retro.setTimebox, { roomId, stageId: stages[0].id });
    const retro = await retroRow(t, roomId);
    expect(retro.stages[0].timeboxMinutes).toBeUndefined();
    // The stage did not move: a timebox never fires an advance (ADR-0010).
    expect(retro.currentStageId).toBe(stages[0].id);
  });

  it("refuses another entry, a non-positive value and a participant at defaults", async () => {
    const t = convexTest(schema, modules);
    const { roomId, stages } = await seedRetro(t);

    await expect(
      as(t, "owner").mutation(api.retro.setTimebox, { roomId, stageId: stages[1].id, minutes: 5 })
    ).rejects.toThrow("Only the current stage can be changed here");
    await expect(
      as(t, "owner").mutation(api.retro.setTimebox, { roomId, stageId: stages[0].id, minutes: 0 })
    ).rejects.toThrow("Timebox must be a whole number of minutes");
    await expect(
      as(t, "guest").mutation(api.retro.setTimebox, { roomId, stageId: stages[0].id, minutes: 5 })
    ).rejects.toThrow("Only facilitators and the owner");
  });
});
