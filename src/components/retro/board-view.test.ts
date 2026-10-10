import { describe, it, expect } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, BoardView, RetroState, StickyView } from "@/convex/model/retro";
import { STICKY_TEXT } from "@/convex/retroTemplates";
import { remove, stack, unstack } from "@/convex/retroTopics";
import {
  applyActionItemEdit,
  applyNewActionItem,
  applyNewSticky,
  applyStickyEdit,
  applyTopicChange,
  applyVoteToggle,
  applyWalk,
  isOptimistic,
  topicOrder,
} from "./board-view";

// What a browser sees of the retro, moved by the same topic, step and field
// rules the server applies: what the optimistic updates show before the
// answer comes.

const id = (value: string) => value as Id<"retroStickies">;
const ME = "me" as Id<"users">;
const ADA = "ada" as Id<"users">;

/** The people in the retro, as the room lists them. */
const members = [
  { _id: ME, name: "Mo" },
  { _id: ADA, name: "Ada" },
];

function sticky(value: string, createdAt: number, extra: Partial<StickyView> = {}): StickyView {
  return {
    _id: id(value),
    clientId: `client-${value}`,
    columnId: "c1",
    position: { x: createdAt * 10, y: 0 },
    createdAt,
    mine: false,
    hidden: false,
    text: value,
    ...(extra.stackId ? {} : { myVote: false }),
    ...extra,
  };
}

function board(stickies: StickyView[]): BoardView {
  return { stickies, writers: 2, myVotes: stickies.filter((s) => s.myVote).length };
}

const retro: RetroState = {
  step: "vote",
  columns: [{ id: "c1", title: "Went well", emoji: "😊", color: "green" }],
  votesPerPerson: 2,
  showAuthors: false,
};

function item(value: string, extra: Partial<ActionItemView> = {}): ActionItemView {
  return {
    _id: value as Id<"retroActionItems">,
    text: `Item ${value}`,
    done: false,
    carriedOver: false,
    createdAt: 1,
    ...extra,
  };
}

describe("applyTopicChange", () => {
  it("moves the viewer's vote with a stacked topic and keeps one when both were voted for", () => {
    const before = board([sticky("x", 1, { myVote: true }), sticky("y", 2, { myVote: true })]);

    const after = applyTopicChange(before, stack(before.stickies, id("x"), id("y"))!, "vote");

    expect(after.stickies.map((s) => [s._id, s.stackId ?? null, s.myVote ?? null])).toEqual([
      ["x", "y", null],
      ["y", null, true],
    ]);
    expect(after.myVotes).toBe(1);
  });

  it("leaves the votes with the stack when a sticky is unstacked", () => {
    const before = board([sticky("top", 1, { myVote: true }), sticky("under", 2, { stackId: id("top") })]);

    const after = applyTopicChange(before, unstack(before.stickies, id("under"), { x: 500, y: 0 })!, "vote");

    expect(after.stickies.find((s) => s._id === "top")?.myVote).toBe(true);
    expect(after.stickies.find((s) => s._id === "under")).toMatchObject({ myVote: false, position: { x: 500, y: 0 } });
  });

  it("hands a deleted top's votes and totals to its heir", () => {
    const before = board([
      sticky("top", 1, { myVote: true, votes: 3 }),
      sticky("heir", 2, { stackId: id("top") }),
      sticky("other", 3, { votes: 1 }),
    ]);

    const after = applyTopicChange(before, remove(before.stickies, id("top")), "discuss");

    expect(after.stickies.find((s) => s._id === "heir")).toMatchObject({ myVote: true, votes: 3, position: { x: 10, y: 0 } });
    expect(after.stickies.map((s) => s._id)).toEqual(["heir", "other"]);
  });

  it("carries the totals only while the step shows them, whatever the board held when the step moved", () => {
    const voted = board([sticky("top", 1, { votes: 2 }), sticky("under", 2, { stackId: id("top") })]);
    const unvoted = board([sticky("top", 1), sticky("under", 2, { stackId: id("top") })]);
    const off = (before: BoardView) => unstack(before.stickies, id("under"), { x: 500, y: 0 })!;

    expect(applyTopicChange(voted, off(voted), "vote").stickies.map((s) => s.votes)).toEqual([undefined, undefined]);
    expect(applyTopicChange(unvoted, off(unvoted), "discuss").stickies.map((s) => s.votes)).toEqual([0, 0]);
  });
});

describe("applyVoteToggle", () => {
  it("casts, takes back, and refuses beyond the budget, everyone's count moving with the viewer's", () => {
    const start = { board: board([sticky("a", 1), sticky("b", 2), sticky("c", 3)]), votesCast: 4 };

    const one = applyVoteToggle(start, id("a"), 2)!;
    expect(one).toMatchObject({ votesCast: 5, board: { myVotes: 1 } });
    const two = applyVoteToggle(one, id("b"), 2)!;
    expect(applyVoteToggle(two, id("c"), 2)).toBeNull();
    expect(applyVoteToggle(two, id("a"), 2)).toMatchObject({ votesCast: 5, board: { myVotes: 1 } });
  });

  it("leaves everyone's count to the server when the browser doesn't hold it", () => {
    const after = applyVoteToggle({ board: board([sticky("a", 1)]) }, id("a"), 2)!;

    expect(after.board.myVotes).toBe(1);
    expect(after).not.toHaveProperty("votesCast");
  });

  it("votes for a stack when a sticky inside it is clicked", () => {
    const start = board([sticky("top", 1), sticky("under", 2, { stackId: id("top") })]);

    const after = applyVoteToggle({ board: start }, id("under"), 3)!;

    expect(after.board.stickies.find((s) => s._id === "top")?.myVote).toBe(true);
  });
});

describe("a new sticky", () => {
  const written = {
    clientId: "draft-1",
    columnId: "c1",
    position: { x: 40, y: 60 },
    text: "  Standups run long \n",
    createdAt: 9,
  };

  it("lands as the board read will send it back, pending under its draft's key until the server's arrives", () => {
    const before = board([sticky("x", 1)]);
    const discussing = { ...retro, step: "discuss" as const, showAuthors: true };

    const after = applyNewSticky(before, written, { viewerId: ME, retro: discussing, members });

    const added = after.stickies[1];
    expect(isOptimistic(added._id)).toBe(true);
    expect(added).toEqual({
      _id: added._id,
      clientId: "draft-1",
      columnId: "c1",
      position: { x: 40, y: 60 },
      createdAt: 9,
      mine: true,
      hidden: false,
      text: "Standups run long",
      authorName: "Mo",
      myVote: false,
      votes: 0,
    });
    expect(after.stickies[0]).toBe(before.stickies[0]);
  });

  it("counts the viewer among the writers from their first sticky on", () => {
    const first = applyNewSticky(board([sticky("x", 1)]), written, { viewerId: ME, retro, members });
    const second = applyNewSticky(first, { ...written, clientId: "draft-2" }, { viewerId: ME, retro, members });

    expect([first.writers, second.writers]).toEqual([3, 3]);
  });

  it("shows nothing when its words would be refused", () => {
    const before = board([]);
    const tooLong = { ...written, text: "x".repeat(STICKY_TEXT.maxLength + 1) };

    expect(applyNewSticky(before, tooLong, { viewerId: ME, retro, members })).toBe(before);
  });
});

describe("a sticky edit", () => {
  const gif = { url: "https://media.giphy.com/media/abc/giphy.gif", width: 200, height: 150 };
  const before = board([sticky("x", 1, { mine: true, gif }), sticky("y", 2)]);

  it("keeps the words as the field does, and the GIF the edit leaves alone", () => {
    const after = applyStickyEdit(before, { stickyId: id("x"), text: "  Standups run long " });

    expect(after.stickies[0]).toMatchObject({ text: "Standups run long", gif });
    expect(after.stickies[1]).toBe(before.stickies[1]);
  });

  it("takes the GIF off with null, puts a new one on, and moves the sticky to another column", () => {
    const other = { ...gif, url: "https://media.giphy.com/media/xyz/giphy.gif" };

    const off = applyStickyEdit(before, { stickyId: id("x"), gif: null, columnId: "c2" });
    const swapped = applyStickyEdit(before, { stickyId: id("x"), gif: other });

    expect(off.stickies[0]).not.toHaveProperty("gif");
    expect(off.stickies[0]).toMatchObject({ text: "x", columnId: "c2" });
    expect(swapped.stickies[0].gif).toEqual(other);
  });

  it("shows nothing when the words would be refused or the sticky is gone", () => {
    expect(applyStickyEdit(before, { stickyId: id("x"), text: "x".repeat(STICKY_TEXT.maxLength + 1) })).toBe(before);
    expect(applyStickyEdit(before, { stickyId: id("gone"), text: "Standups run long" })).toBe(before);
  });
});

describe("a new action item", () => {
  it("shows its owner at once, named as the room lists them", () => {
    const after = applyNewActionItem([], { key: "k1", text: "Timebox standups", ownerId: ADA, createdAt: 9 }, members);

    expect(after).toEqual([
      {
        _id: after[0]._id,
        text: "Timebox standups",
        done: false,
        ownerId: ADA,
        ownerName: "Ada",
        carriedOver: false,
        createdAt: 9,
      },
    ]);
  });

  it("is pending until the server's arrives, with its words as the field keeps them", () => {
    const before = [item("a1")];

    const after = applyNewActionItem(before, { key: "k1", text: "  Timebox standups ", createdAt: 9 }, members);

    expect(after.map((i) => [isOptimistic(i._id), i.text, i.ownerId ?? null])).toEqual([
      [false, "Item a1", null],
      [true, "Timebox standups", null],
    ]);
  });

  it("shows nothing when its words would be refused", () => {
    const before = [item("a1")];

    expect(applyNewActionItem(before, { key: "k1", text: "   ", createdAt: 9 }, members)).toBe(before);
  });
});

describe("an action item edit", () => {
  const a1 = "a1" as Id<"retroActionItems">;
  const before = [item("a1", { ownerId: ADA, ownerName: "Ada" }), item("a2")];

  it("names a new owner, and null leaves it unowned", () => {
    const handed = applyActionItemEdit(before, { itemId: a1, ownerId: ME }, members);
    const unowned = applyActionItemEdit(before, { itemId: a1, ownerId: null }, members);

    expect(handed[0]).toMatchObject({ ownerId: ME, ownerName: "Mo" });
    expect(unowned[0]).toEqual({ _id: a1, text: "Item a1", done: false, carriedOver: false, createdAt: 1 });
    expect(handed[1]).toBe(before[1]);
  });

  it("ticks it done and keeps the words as the field does, leaving the owner be", () => {
    const after = applyActionItemEdit(before, { itemId: a1, done: true, text: " Timebox standups " }, members);

    expect(after[0]).toEqual({ ...before[0], done: true, text: "Timebox standups" });
  });

  it("shows nothing when the words would be refused or the item is gone", () => {
    expect(applyActionItemEdit(before, { itemId: a1, text: " " }, members)).toBe(before);
    expect(applyActionItemEdit(before, { itemId: "gone" as Id<"retroActionItems">, done: true }, members)).toBe(before);
  });
});

describe("the discussion", () => {
  it("walks the topics in the order the totals give", () => {
    const shown = board([sticky("low", 1, { votes: 1 }), sticky("high", 2, { votes: 5 })]);
    const discussing = { ...retro, step: "discuss" as const, focusStickyId: id("high") };

    expect(topicOrder(shown, retro.columns)).toEqual(["high", "low"]);
    expect(applyWalk(discussing, shown, "next").focusStickyId).toBe("low");
  });
});
