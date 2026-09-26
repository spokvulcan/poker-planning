import { describe, it, expect } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { BoardView, RetroState, StickyView } from "@/convex/model/retro";
import { remove, stack, unstack } from "@/convex/retroTopics";
import { stepChange, spotlightStepChange } from "@/convex/retroSteps";
import { applyStepChange, applyTopicChange, applyVoteToggle, applyWalk, topicOrder } from "./board-view";

// The board a browser sees, moved by the same topic and step rules the
// server applies: what the optimistic updates show before the answer comes.

const id = (value: string) => value as Id<"retroStickies">;

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

describe("applyTopicChange", () => {
  it("moves the viewer's vote with a stacked topic and keeps one when both were voted for", () => {
    const before = board([sticky("x", 1, { myVote: true }), sticky("y", 2, { myVote: true })]);

    const after = applyTopicChange(before, stack(before.stickies, id("x"), id("y"))!);

    expect(after.stickies.map((s) => [s._id, s.stackId ?? null, s.myVote ?? null])).toEqual([
      ["x", "y", null],
      ["y", null, true],
    ]);
    expect(after.myVotes).toBe(1);
  });

  it("leaves the votes with the stack when a sticky is unstacked", () => {
    const before = board([sticky("top", 1, { myVote: true }), sticky("under", 2, { stackId: id("top") })]);

    const after = applyTopicChange(before, unstack(before.stickies, id("under"), { x: 500, y: 0 })!);

    expect(after.stickies.find((s) => s._id === "top")?.myVote).toBe(true);
    expect(after.stickies.find((s) => s._id === "under")).toMatchObject({ myVote: false, position: { x: 500, y: 0 } });
  });

  it("hands a deleted top's votes and totals to its heir", () => {
    const before = board([
      sticky("top", 1, { myVote: true, votes: 3 }),
      sticky("heir", 2, { stackId: id("top") }),
      sticky("other", 3, { votes: 1 }),
    ]);

    const after = applyTopicChange(before, remove(before.stickies, id("top")));

    expect(after.stickies.find((s) => s._id === "heir")).toMatchObject({ myVote: true, votes: 3, position: { x: 10, y: 0 } });
    expect(after.stickies.map((s) => s._id)).toEqual(["heir", "other"]);
  });
});

describe("applyVoteToggle", () => {
  it("casts, takes back, and refuses beyond the budget without touching the board", () => {
    const start = board([sticky("a", 1), sticky("b", 2), sticky("c", 3)]);

    const one = applyVoteToggle(start, id("a"), 2)!;
    expect(one).toMatchObject({ cast: 1, board: { myVotes: 1 } });
    const two = applyVoteToggle(one.board, id("b"), 2)!;
    expect(applyVoteToggle(two.board, id("c"), 2)).toBeNull();
    expect(applyVoteToggle(two.board, id("a"), 2)).toMatchObject({ cast: -1, board: { myVotes: 1 } });
  });

  it("votes for a stack when a sticky inside it is clicked", () => {
    const start = board([sticky("top", 1), sticky("under", 2, { stackId: id("top") })]);

    const after = applyVoteToggle(start, id("under"), 3)!;

    expect(after.board.stickies.find((s) => s._id === "top")?.myVote).toBe(true);
  });
});

describe("step changes", () => {
  it("clears the spotlight going back to Vote, and leaves the discussion's first topic to the server", () => {
    const discussing = { ...retro, step: "discuss" as const, focusStickyId: id("a") };

    expect(applyStepChange(discussing, stepChange("discuss", "vote"))).toEqual({ ...retro, step: "vote" });
    expect(applyStepChange(retro, stepChange("vote", "discuss"))).toEqual({ ...retro, step: "discuss" });
  });

  it("puts a picked topic in the spotlight, moving the retro to the discussion", () => {
    expect(applyStepChange(retro, spotlightStepChange("vote"), id("b"))).toEqual({
      ...retro,
      step: "discuss",
      focusStickyId: id("b"),
    });
  });

  it("walks the topics in the order the totals give", () => {
    const shown = board([sticky("low", 1, { votes: 1 }), sticky("high", 2, { votes: 5 })]);
    const discussing = { ...retro, step: "discuss" as const, focusStickyId: id("high") };

    expect(topicOrder(shown, retro.columns)).toEqual(["high", "low"]);
    expect(applyWalk(discussing, shown, "next").focusStickyId).toBe("low");
  });
});
