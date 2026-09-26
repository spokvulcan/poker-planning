import { describe, it, expect } from "vitest";
import {
  followSpotlight,
  followVotes,
  followVotesInView,
  foldVotes,
  heirOf,
  remove,
  rootOf,
  stack,
  toggleVote,
  unstack,
  voteTotals,
  type TopicChange,
  type TopicSticky,
  type TopicVote,
} from "./retroTopics";

// The retro's topic rules (ADR-0028): what stacking, unstacking and deleting
// do to stickies, and how votes and the spotlight follow the topics.

const at = { x: 0, y: 0 };

function sticky(_id: string, createdAt: number, stackId?: string): TopicSticky {
  return { _id, createdAt, position: { x: createdAt, y: createdAt }, ...(stackId ? { stackId } : {}) };
}

function vote(_id: string, stickyId: string, voterId: string): TopicVote {
  return { _id, stickyId, voterId };
}

/** Applies a change to the stickies, the way the model writes it. */
function applied(stickies: TopicSticky[], change: TopicChange): TopicSticky[] {
  return stickies
    .filter((s) => !change.removed.has(s._id))
    .map((s) => {
      const patch = change.stickies.get(s._id);
      if (!patch) return s;
      const { stackId: _old, ...rest } = s;
      const stackId = patch.stackId === undefined ? s.stackId : (patch.stackId ?? undefined);
      return { ...rest, ...(stackId ? { stackId } : {}), ...(patch.position ? { position: patch.position } : {}) };
    });
}

/** Applies the votes' side of a change, the way the model writes it. */
function votesAfter(stickies: TopicSticky[], votes: TopicVote[], change: TopicChange): TopicVote[] {
  const rootById = new Map(stickies.map((s) => [s._id, rootOf(s)]));
  const { refile, refund } = followVotes(votes, (v) => rootById.get(v.stickyId) ?? v.stickyId, change);
  return votes.filter((v) => !refund.has(v._id)).map((v) => ({ ...v, stickyId: refile.get(v._id) ?? v.stickyId }));
}

function topicsOf(votes: TopicVote[]): string[] {
  return votes.map((v) => `${v.voterId}:${v.stickyId}`).sort();
}

describe("rootOf and heirOf", () => {
  it("names a loose sticky's topic by itself, and a stacked one's by its stack's root", () => {
    expect(rootOf({ _id: "a" })).toBe("a");
    expect(rootOf({ _id: "b", stackId: "a" })).toBe("a");
  });

  it("hands a stack to its oldest sticky", () => {
    expect(heirOf([sticky("young", 9), sticky("old", 2), sticky("mid", 5)])?._id).toBe("old");
    expect(heirOf([])).toBeUndefined();
  });
});

describe("stack", () => {
  const board = [sticky("x", 1), sticky("x1", 2, "x"), sticky("y", 3), sticky("y1", 4, "y")];

  it("moves a whole stack under the other topic's root, one level deep", () => {
    const change = stack(board, "x", "y1")!;

    expect(applied(board, change).map((s) => [s._id, rootOf(s)])).toEqual([
      ["x", "y"],
      ["x1", "y"],
      ["y", "y"],
      ["y1", "y"],
    ]);
    expect(change.topics).toEqual(new Map([["x", "y"]]));
  });

  it("moves a sticky from inside a stack on its own, leaving its old topic in place", () => {
    const change = stack(board, "x1", "y")!;

    expect(change.stickies).toEqual(new Map([["x1", { stackId: "y" }]]));
    expect(change.topics.size).toBe(0);
  });

  it("does nothing when both are already one topic, or either is gone", () => {
    expect(stack(board, "x1", "x")).toBeNull();
    expect(stack(board, "x", "x1")).toBeNull();
    expect(stack(board, "x", "x")).toBeNull();
    expect(stack(board, "gone", "y")).toBeNull();
  });
});

describe("unstack", () => {
  const board = [sticky("top", 1), sticky("under", 2, "top")];

  it("puts the sticky down on its own, starting a topic with no votes of its own", () => {
    const change = unstack(board, "under", { x: 500, y: 40 })!;

    expect(change.stickies).toEqual(new Map([["under", { stackId: null, position: { x: 500, y: 40 } }]]));
    expect(change.topics.size).toBe(0);
  });

  it("does nothing to a sticky that isn't in a stack", () => {
    expect(unstack(board, "top", at)).toBeNull();
  });
});

describe("remove", () => {
  it("hands a stack to its oldest remaining sticky, in the old root's place", () => {
    const board = [sticky("top", 1), sticky("second", 5, "top"), sticky("first", 3, "top")];
    const change = remove(board, "top");

    expect(applied(board, change)).toEqual([
      { _id: "second", createdAt: 5, position: { x: 5, y: 5 }, stackId: "first" },
      { _id: "first", createdAt: 3, position: { x: 1, y: 1 } },
    ]);
    expect(change.topics).toEqual(new Map([["top", "first"]]));
  });

  it("takes a loose sticky's topic off the board with it", () => {
    expect(remove([sticky("alone", 1)], "alone").topics).toEqual(new Map([["alone", null]]));
  });

  it("leaves a stack's topic alone when one of its stacked stickies goes", () => {
    const change = remove([sticky("top", 1), sticky("under", 2, "top")], "under");

    expect(change.removed).toEqual(new Set(["under"]));
    expect(change.topics.size).toBe(0);
  });
});

describe("votes follow their topic", () => {
  it("stacking two topics one person voted for keeps one of their votes and gives the other back", () => {
    const board = [sticky("x", 1), sticky("y", 2)];
    const votes = [vote("ann-x", "x", "ann"), vote("ann-y", "y", "ann"), vote("bob-x", "x", "bob")];
    const change = stack(board, "x", "y")!;

    expect(topicsOf(votesAfter(board, votes, change))).toEqual(["ann:y", "bob:y"]);
  });

  it("gives back the vote that would have moved, keeping the one already in place", () => {
    const board = [sticky("x", 1), sticky("y", 2)];
    const change = stack(board, "x", "y")!;
    const { refile, refund } = followVotes(
      [vote("ann-x", "x", "ann"), vote("ann-y", "y", "ann")],
      (v) => v.stickyId,
      change
    );

    expect(refund).toEqual(new Set(["ann-x"]));
    expect(refile.size).toBe(0);
  });

  it("keeps a stack's votes with the stack when a sticky is unstacked", () => {
    const board = [sticky("top", 1), sticky("under", 2, "top")];
    const votes = [vote("v1", "top", "ann")];
    const change = unstack(board, "under", at)!;

    expect(topicsOf(votesAfter(board, votes, change))).toEqual(["ann:top"]);
  });

  it("keeps a stack's votes when a stacked sticky is deleted, even one filed under it before it was stacked", () => {
    // A vote filed under a sticky that was later stacked (rows older than
    // ADR-0028): it counts for the stack, and it stays with the stack.
    const board = [sticky("top", 1), sticky("under", 2, "top")];
    const votes = [vote("v1", "under", "ann"), vote("v2", "top", "bob")];
    const change = remove(board, "under");

    expect(topicsOf(votesAfter(board, votes, change))).toEqual(["ann:top", "bob:top"]);
  });

  it("hands a stack's votes to its heir when its root is deleted", () => {
    const board = [sticky("top", 1), sticky("heir", 2, "top")];
    const change = remove(board, "top");

    expect(topicsOf(votesAfter(board, [vote("v1", "top", "ann")], change))).toEqual(["ann:heir"]);
  });

  it("gives a deleted loose sticky's votes back to their voters", () => {
    const board = [sticky("alone", 1)];
    const change = remove(board, "alone");

    expect(votesAfter(board, [vote("v1", "alone", "ann")], change)).toEqual([]);
  });

  it("never leaves one person with two votes on a topic, whatever the stacking", () => {
    const board = [sticky("a", 1), sticky("b", 2), sticky("c", 3), sticky("b1", 4, "b")];
    let stickies = board;
    let votes = [
      vote("1", "a", "ann"),
      vote("2", "b", "ann"),
      vote("3", "b1", "ann"), // an old duplicate, filed under a stacked sticky
      vote("4", "c", "ann"),
      vote("5", "c", "bob"),
    ];
    for (const [stickyId, ontoId] of [
      ["a", "b"],
      ["c", "b1"],
    ] as const) {
      const change = stack(stickies, stickyId, ontoId)!;
      votes = votesAfter(stickies, votes, change);
      stickies = applied(stickies, change);
    }

    expect(topicsOf(votes)).toEqual(["ann:b", "bob:b"]);
  });
});

describe("the spotlight follows its topic", () => {
  const board = [sticky("x", 1), sticky("y", 2), sticky("y1", 3, "y")];

  it("moves with a merged topic, to an heir, and off with a topic that leaves", () => {
    expect(followSpotlight("x", stack(board, "x", "y")!)).toBe("y");
    expect(followSpotlight("y", remove(board, "y"))).toBe("y1");
    expect(followSpotlight("x", remove(board, "x"))).toBeUndefined();
  });

  it("stays where it is when its topic isn't touched", () => {
    expect(followSpotlight("y", remove(board, "x"))).toBe("y");
    expect(followSpotlight(undefined, stack(board, "x", "y")!)).toBeUndefined();
  });
});

describe("voteTotals", () => {
  const board = [sticky("a", 1), sticky("b", 2, "a"), sticky("c", 3)];

  it("counts each voter once per topic, whichever of its stickies the vote is filed under", () => {
    expect(
      voteTotals(board, [
        { stickyId: "a", voterId: "ann" },
        { stickyId: "b", voterId: "ann" },
        { stickyId: "b", voterId: "bob" },
        { stickyId: "c", voterId: "ann" },
      ])
    ).toEqual(
      new Map([
        ["a", 2],
        ["c", 1],
      ])
    );
  });

  it("drops a vote on a sticky that is gone", () => {
    expect(voteTotals(board, [{ stickyId: "gone", voterId: "ann" }])).toEqual(new Map());
  });
});

describe("toggleVote", () => {
  it("casts a vote on the topic while the budget lasts", () => {
    expect(toggleVote("x", [{ _id: "1", topic: "y" }], 2)).toEqual({ kind: "cast", stickyId: "x" });
  });

  it("takes back every vote the person has on the topic", () => {
    expect(
      toggleVote(
        "x",
        [
          { _id: "1", topic: "x" },
          { _id: "2", topic: "x" },
          { _id: "3", topic: "y" },
        ],
        3
      )
    ).toEqual({ kind: "takeBack", votes: ["1", "2"] });
  });

  it("refuses a vote beyond the budget, counting topics rather than rows", () => {
    expect(toggleVote("z", [{ _id: "1", topic: "x" }, { _id: "2", topic: "y" }], 2)).toMatchObject({
      kind: "refused",
      code: "budget",
    });
    expect(toggleVote("z", [{ _id: "1", topic: "x" }, { _id: "2", topic: "x" }], 2)).toEqual({
      kind: "cast",
      stickyId: "z",
    });
  });
});

describe("foldVotes", () => {
  it("keeps the account's votes, then the guest's on other topics, up to the budget", () => {
    const account = [{ _id: "a1", topic: "x" }];
    const guest = [
      { _id: "g1", topic: "x" },
      { _id: "g2", topic: "y" },
      { _id: "g3", topic: "z" },
    ];

    expect(foldVotes(account, guest, 2)).toEqual({ reassign: ["g2"], refund: ["g1", "g3"] });
    expect(foldVotes([], guest, 3)).toEqual({ reassign: ["g1", "g2", "g3"], refund: [] });
  });
});

describe("followVotesInView", () => {
  it("moves the viewer's votes and the totals with the topics, not counting the viewer twice", () => {
    const board = [sticky("x", 1), sticky("y", 2), sticky("z", 3)];
    const change = stack(board, "x", "y")!;
    const view = followVotesInView(
      {
        myTopics: new Set(["x", "y"]),
        totals: new Map([
          ["x", 2],
          ["y", 3],
          ["z", 1],
        ]),
      },
      change
    );

    expect(view.myTopics).toEqual(new Set(["y"]));
    expect(view.totals).toEqual(
      new Map([
        ["y", 4],
        ["z", 1],
      ])
    );
  });

  it("drops the viewer's vote with a topic that leaves, and leaves hidden totals hidden", () => {
    const change = remove([sticky("x", 1)], "x");

    expect(followVotesInView({ myTopics: new Set(["x"]) }, change)).toEqual({ myTopics: new Set() });
  });
});
