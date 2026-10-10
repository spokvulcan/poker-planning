import { describe, it, expect } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import type { RetroStep } from "./retroTemplates";
import { stickyView, type RetroViewer, type StickyRow } from "./retroStickyView";

// What one viewer sees of a sticky: the projection the board read applies to
// every sticky, and the board's optimistic add to the viewer's own new one.
// convex/retro.test.ts proves the board read applies it.

const ANN = "ann" as Id<"users">;
const BOB = "bob" as Id<"users">;
const id = (value: string) => value as Id<"retroStickies">;

const GIF = { url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif", width: 200, height: 150 };

/** Ann's sticky, loose on the board: some words and a GIF. */
function annsSticky(extra: Partial<StickyRow> = {}): StickyRow {
  return {
    _id: id("s1"),
    clientId: "client-s1",
    columnId: "c2",
    position: { x: 10, y: 20 },
    createdAt: 1,
    authorId: ANN,
    text: "Deploys are slow",
    gif: GIF,
    ...extra,
  };
}

/** `viewerId` looking at a retro in `step`, with nothing voted for. */
function viewer(viewerId: Id<"users">, step: RetroStep, showAuthors: boolean, extra: Partial<RetroViewer> = {}): RetroViewer {
  return {
    retro: { step, showAuthors },
    viewerId,
    myTopics: new Set(),
    names: new Map([
      [ANN, "Ann"],
      [BOB, "Bob"],
    ]),
    totals: new Map(),
    ...extra,
  };
}

describe("who sees what of a sticky", () => {
  // Ann's sticky as she and Bob see it in every step, with show authors off
  // and on: face-down (its place and colour, nothing it says), face-up, or
  // face-up with her name. The face-down rule of ADR-0026 and CONTEXT.md's
  // Face-down and Show authors, as one table.
  type Seen = "face-down" | "face-up" | "face-up and named";
  type Setting = "names hidden" | "names shown";
  const table: Record<RetroStep, Record<"its author" | "someone else", Record<Setting, Seen>>> = {
    write: {
      "its author": { "names hidden": "face-up", "names shown": "face-up" },
      "someone else": { "names hidden": "face-down", "names shown": "face-down" },
    },
    vote: {
      "its author": { "names hidden": "face-up", "names shown": "face-up and named" },
      "someone else": { "names hidden": "face-up", "names shown": "face-up and named" },
    },
    discuss: {
      "its author": { "names hidden": "face-up", "names shown": "face-up and named" },
      "someone else": { "names hidden": "face-up", "names shown": "face-up and named" },
    },
    done: {
      "its author": { "names hidden": "face-up", "names shown": "face-up and named" },
      "someone else": { "names hidden": "face-up", "names shown": "face-up and named" },
    },
  };

  for (const [step, byViewer] of Object.entries(table) as [RetroStep, (typeof table)[RetroStep]][]) {
    for (const [who, bySetting] of Object.entries(byViewer) as [keyof typeof byViewer, Record<Setting, Seen>][]) {
      for (const [setting, seen] of Object.entries(bySetting) as [Setting, Seen][]) {
        it(`in ${step}, with ${setting}, ${who} sees it ${seen}`, () => {
          const mine = who === "its author";
          const view = stickyView(annsSticky(), viewer(mine ? ANN : BOB, step, setting === "names shown"));

          // Its place, column and age reach everyone.
          expect(view).toMatchObject({
            _id: "s1",
            clientId: "client-s1",
            columnId: "c2",
            position: { x: 10, y: 20 },
            createdAt: 1,
            mine,
            hidden: seen === "face-down",
          });
          if (seen === "face-down") {
            expect(view).not.toHaveProperty("text");
            expect(view).not.toHaveProperty("gif");
          } else {
            expect(view).toMatchObject({ text: "Deploys are slow", gif: GIF });
          }
          if (seen === "face-up and named") expect(view.authorName).toBe("Ann");
          else expect(view).not.toHaveProperty("authorName");
        });
      }
    }
  }

  it("a face-down sticky still shows the stack it is in", () => {
    const view = stickyView(annsSticky({ _id: id("s2"), stackId: id("s1") }), viewer(BOB, "write", false));

    expect(view).toMatchObject({ hidden: true, stackId: "s1" });
  });
});

describe("a topic's votes", () => {
  // Whether each step shows the totals (CONTEXT.md: Vote): hidden until Discuss.
  const totalsShown: Record<RetroStep, boolean> = { write: false, vote: false, discuss: true, done: true };

  for (const [step, shown] of Object.entries(totalsShown) as [RetroStep, boolean][]) {
    it(`in ${step}, a topic carries the viewer's own vote${shown ? " and its total" : ", and no total"}`, () => {
      const voted = { myTopics: new Set([id("s1")]), totals: new Map([[id("s1"), 3]]) };

      const view = stickyView(annsSticky(), viewer(BOB, step, false, voted));

      expect(view.myVote).toBe(true);
      if (shown) expect(view.votes).toBe(3);
      else expect(view).not.toHaveProperty("votes");
    });
  }

  it("a topic nobody voted for shows no vote of the viewer's, and a total of 0 once totals show", () => {
    expect(stickyView(annsSticky(), viewer(BOB, "vote", false))).toMatchObject({ myVote: false });
    expect(stickyView(annsSticky(), viewer(BOB, "discuss", false))).toMatchObject({ myVote: false, votes: 0 });
  });

  it("a stacked sticky carries neither: its votes are its stack's", () => {
    const stacked = annsSticky({ _id: id("s2"), stackId: id("s1") });
    const voted = { myTopics: new Set([id("s1")]), totals: new Map([[id("s1"), 2]]) };

    const view = stickyView(stacked, viewer(BOB, "discuss", false, voted));

    expect(view.stackId).toBe("s1");
    expect(view).not.toHaveProperty("myVote");
    expect(view).not.toHaveProperty("votes");
  });
});

describe("what never reaches a viewer", () => {
  it("nothing else of the row: not its stored height (ADR-0027), its author's id or its room", () => {
    const row: Doc<"retroStickies"> = {
      ...annsSticky(),
      _creationTime: 1,
      roomId: "room" as Id<"rooms">,
      height: 244,
    };

    const faceUp = stickyView(row, viewer(BOB, "discuss", true));
    const faceDown = stickyView(row, viewer(BOB, "write", true));

    expect(Object.keys(faceUp).sort()).toEqual([
      "_id",
      "authorName",
      "clientId",
      "columnId",
      "createdAt",
      "gif",
      "hidden",
      "mine",
      "myVote",
      "position",
      "text",
      "votes",
    ]);
    expect(Object.keys(faceDown).sort()).toEqual([
      "_id",
      "clientId",
      "columnId",
      "createdAt",
      "hidden",
      "mine",
      "myVote",
      "position",
    ]);
  });
});
