/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api, internal } from "./_generated/api";
import { DEFAULT_PERMISSIONS, DEFAULT_RETRO_PERMISSIONS } from "./permissions";
import type { Refusal } from "./model/refusal";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";

// What the browser is sent when the shared guards or a ceremony check turn a
// write down: a coded refusal, whose message it shows as written. A plain
// Error's message is redacted in production (ADR-0031). The retro model's own
// refusals are tested with its rules, in retro.test.ts.

const modules = import.meta.glob("./**/*.*s");

/** What a call is turned away with, as the browser reads it, or "resolved" when it goes through. */
async function refusalOf(call: Promise<unknown>): Promise<Refusal | "resolved"> {
  try {
    await call;
    return "resolved";
  } catch (error) {
    if (error instanceof ConvexError) return error.data as Refusal;
    throw error;
  }
}

/** A planning poker room its owner opened, with the guest "ann" as a participant. */
async function pokerRoomWithAnn(t: T) {
  const ownerId = await seedUser(t, "owner");
  const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
  const annId = await join(t, roomId, "ann");
  return { roomId, ownerId, annId };
}

/** A retro its owner opened, with the guest "ann" as a participant. */
async function retroWithAnn(t: T) {
  const ownerId = await seedUser(t, "owner");
  const roomId = await as(t, "owner").mutation(api.retro.create, { name: "Sprint 41 retro" });
  const annId = await join(t, roomId, "ann");
  return { roomId, ownerId, annId };
}

describe("the permission guard", () => {
  it("refuses a denied poker write with the resolved decision's message", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await pokerRoomWithAnn(t);

    expect(
      await refusalOf(as(t, "ann").mutation(api.roles.updatePermissions, { roomId, permissions: DEFAULT_PERMISSIONS }))
    ).toEqual({ code: "forbidden", message: "Only the owner can do this." });
  });

  it("refuses a denied retro write the same way", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await retroWithAnn(t);

    expect(await refusalOf(as(t, "ann").mutation(api.retro.setStep, { roomId, step: "vote" }))).toEqual({
      code: "forbidden",
      message: "Only facilitators and the owner can do this.",
    });
  });
});

describe("room attendance", () => {
  it("refuses a write from someone outside the room", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await retroWithAnn(t);
    await seedUser(t, "outsider");

    const sticky = as(t, "outsider").mutation(api.retro.addSticky, {
      roomId,
      clientId: crypto.randomUUID(),
      columnId: "c1",
      text: "Let me in",
      position: { x: 0, y: 0 },
    });

    expect(await refusalOf(sticky)).toEqual({ code: "forbidden", message: "Not a member of this room" });
  });

  it("refuses the same way for a caller resolved outside ctx.auth, as a Jira import is", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await pokerRoomWithAnn(t);
    const outsiderId = await seedUser(t, "outsider");

    expect(
      await refusalOf(t.query(internal.integrations.jira.verifyCanManageIssues, { userId: outsiderId, roomId }))
    ).toEqual({ code: "forbidden", message: "Not a member of this room" });
  });
});

describe("a write aimed at the other ceremony", () => {
  /** The refusal of an act that belongs to the other ceremony. */
  const OTHER_CEREMONY = { code: "missing", message: "This action does not apply to this room type." };

  it("is refused in a retro, whatever only planning poker does", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId, annId } = await retroWithAnn(t);
    const issueId = await t.run((ctx) =>
      ctx.db.insert("issues", { roomId, sequentialId: 1, title: "Stray", status: "pending", createdAt: Date.now(), order: 0 })
    );
    const owner = as(t, "owner");
    const ann = as(t, "ann");

    expect(await refusalOf(owner.mutation(api.rooms.rename, { roomId, name: "Planning" }))).toEqual(OTHER_CEREMONY);
    expect(
      await refusalOf(owner.mutation(api.roles.updatePermissions, { roomId, permissions: DEFAULT_PERMISSIONS }))
    ).toEqual(OTHER_CEREMONY);
    expect(
      await refusalOf(ann.mutation(api.votes.pickCard, { roomId, userId: annId, cardLabel: "5", cardValue: 5 }))
    ).toEqual(OTHER_CEREMONY);
    expect(await refusalOf(owner.mutation(api.canvas.createNote, { roomId, issueId, userId: ownerId }))).toEqual(
      OTHER_CEREMONY
    );
    expect(await refusalOf(ann.mutation(api.users.edit, { roomId, userId: annId, isSpectator: true }))).toEqual({
      code: "missing",
      message: "Everyone takes part here: there are no spectators.",
    });
  });

  it("is refused in a planning poker room, whatever only a retro does", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await pokerRoomWithAnn(t);
    const owner = as(t, "owner");

    expect(await refusalOf(owner.mutation(api.retro.setStep, { roomId, step: "vote" }))).toEqual(OTHER_CEREMONY);
    expect(
      await refusalOf(owner.mutation(api.retro.updatePermissions, { roomId, permissions: DEFAULT_RETRO_PERMISSIONS }))
    ).toEqual(OTHER_CEREMONY);
    expect(
      await refusalOf(
        owner.mutation(api.retro.addSticky, {
          roomId,
          clientId: crypto.randomUUID(),
          columnId: "c1",
          text: "A thought",
          position: { x: 0, y: 0 },
        })
      )
    ).toEqual({ code: "missing", message: "This is not a retro." });
  });
});
