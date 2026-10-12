/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { refusalOf } from "./model/refusal";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";

// A poker room's deck, from its creator's pick to a revealed round, through
// the public mutations: room creation stores what the pick deals, read the
// way the create page read it (checkPick, convex/scales), and a custom deck
// of numbers averages a round as a preset does.

const modules = import.meta.glob("./**/*.*s");

/** A poker room the owner opened dealing `cards`, with Ann and Bob in it, voting on one issue. */
async function roomDealing(t: T, cards: string[]): Promise<Id<"rooms">> {
  await seedUser(t, "owner");
  const roomId = await as(t, "owner").mutation(api.rooms.create, {
    name: "Planning",
    votingScale: { type: "custom", cards },
  });
  await join(t, roomId, "ann");
  await join(t, roomId, "bob");
  const issueId = await as(t, "owner").mutation(api.issues.create, { roomId, title: "Checkout" });
  await as(t, "owner").mutation(api.issues.startVoting, { roomId, issueId });
  return roomId;
}

/** Each of them plays a card, and the owner reveals. */
async function revealRound(t: T, roomId: Id<"rooms">, cards: Record<"owner" | "ann" | "bob", string>) {
  for (const [subject, cardLabel] of Object.entries(cards)) {
    await as(t, subject).mutation(api.votes.pickCard, { roomId, cardLabel });
  }
  await as(t, "owner").mutation(api.rooms.showCards, { roomId });
}

const storedScale = async (t: T, roomId: Id<"rooms">) =>
  (await as(t, "owner").query(api.rooms.get, { roomId }))?.room.votingScale;

/** The issue voted on, as the export reads it: its estimate, its stats and each vote's steps. */
const exported = async (t: T, roomId: Id<"rooms">) =>
  (await as(t, "owner").query(api.issues.getForEnhancedExport, { roomId }))[0];

describe("a room's deck, as its creator picked it", () => {
  it("stores a custom deck of numbers trimmed and numeric, and averages a revealed round", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await roomDealing(t, [" 1", "2 ", " 3 ", "5", "8", "?"]);

    expect(await storedScale(t, roomId)).toEqual({
      type: "custom",
      cards: ["1", "2", "3", "5", "8", "?"],
      isNumeric: true,
    });

    await revealRound(t, roomId, { owner: "2", ann: "2", bob: "8" });

    const issue = await exported(t, roomId);
    expect(issue).toMatchObject({ finalEstimate: "2", average: 4, median: 2, agreement: 67 });
    // Steps from the consensus along the deck: 2 → 3 → 5 → 8.
    expect(issue.individualVotes?.map((vote) => [vote.vote, vote.deltaFromConsensus])).toEqual(
      expect.arrayContaining([
        ["2", 0],
        ["8", 3],
      ])
    );
  });

  it("stores a custom deck with a word in it as not numeric, and shows no average", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await roomDealing(t, ["1", "2", "3", "Spike"]);

    expect(await storedScale(t, roomId)).toMatchObject({ isNumeric: false });

    await revealRound(t, roomId, { owner: "1", ann: "3", bob: "3" });

    expect(await exported(t, roomId)).toMatchObject({ finalEstimate: "3", average: null, median: null });
  });

  it("refuses a custom deck that breaks a rule in the rule's own words, and opens no room", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "owner");

    const create = as(t, "owner").mutation(api.rooms.create, {
      name: "Planning",
      votingScale: { type: "custom", cards: ["1", "2", " 2 "] },
    });

    // What the browser reads off the refusal (model/refusal.ts).
    expect(await create.then(() => "resolved", refusalOf)).toEqual({
      code: "forbidden",
      message: "2 is already in the deck.",
    });
    expect(await t.run((ctx) => ctx.db.query("rooms").collect())).toEqual([]);
  });
});
