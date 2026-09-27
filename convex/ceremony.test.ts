/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import { CEREMONY_RULES, ceremonyOf, rulesOf } from "./ceremony";
import { DEFAULT_PERMISSIONS } from "./permissions";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";

// A room's ceremony is named by its roomType, and a legacy row without one
// is planning poker: one definition, everywhere.

describe("ceremonyOf", () => {
  it("is a retro only for a retro room, and planning poker otherwise", () => {
    expect(ceremonyOf({ roomType: "retro" })).toBe("retro");
    expect(ceremonyOf({ roomType: "canvas" })).toBe("poker");
    expect(ceremonyOf({})).toBe("poker");
  });
});

describe("rulesOf", () => {
  it("gives a legacy room without a roomType the poker rules", () => {
    expect(rulesOf({})).toBe(CEREMONY_RULES.poker);
  });

  it("keeps spectators, player nodes, rounds and analytics to planning poker", () => {
    expect(rulesOf({ roomType: "canvas" })).toMatchObject({
      spectators: true,
      playerNodes: true,
      votingRounds: true,
      inAnalytics: true,
      retainedByPermanentOwner: false,
      activityGranularityMs: 0,
    });
    expect(rulesOf({ roomType: "retro" })).toMatchObject({
      spectators: false,
      playerNodes: false,
      votingRounds: false,
      inAnalytics: false,
      retainedByPermanentOwner: true,
    });
  });

  it("names each the way its copy does", () => {
    expect(rulesOf({ roomType: "canvas" }).noun).toBe("Room");
    expect(rulesOf({ roomType: "retro" }).noun).toBe("Retro");
  });
});

// --- Every writer asks the same rules --------------------------------------------

const modules = import.meta.glob("./**/*.*s");

async function retroWithAnn(t: T) {
  await seedUser(t, "owner");
  const roomId = await as(t, "owner").mutation(api.retro.create, { name: "Sprint 41 retro" });
  const annId = await join(t, roomId, "ann");
  return { roomId, annId };
}

describe("a retro refuses what only planning poker does", () => {
  it("takes no poker vote", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, annId } = await retroWithAnn(t);

    await expect(
      as(t, "ann").mutation(api.votes.pickCard, { roomId, userId: annId, cardLabel: "5", cardValue: 5 })
    ).rejects.toThrow("does not apply");
  });

  it("has nobody sit out as a spectator, at joining or after", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, annId } = await retroWithAnn(t);
    await as(t, "bob").mutation(api.users.join, { roomId, name: "bob", authUserId: "bob", isSpectator: true });

    expect((await as(t, "bob").query(api.users.getMyMembership, { roomId }))?.isSpectator).toBe(false);
    await expect(as(t, "ann").mutation(api.users.edit, { roomId, userId: annId, isSpectator: true })).rejects.toThrow(
      "no spectators"
    );
  });

  it("keeps its own permissions: a poker set can't be written over them", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await retroWithAnn(t);

    await expect(
      as(t, "owner").mutation(api.roles.updatePermissions, { roomId, permissions: DEFAULT_PERMISSIONS })
    ).rejects.toThrow("does not apply");
  });
});
