import { describe, it, expect } from "vitest";
import { RESOLVED_ALLOWED } from "./permissions";
import type { RetroStep } from "./retroTemplates";
import {
  discussionAt,
  discussionOrder,
  followDiscussion,
  spotlightStepChange,
  stepAllows,
  stepChange,
  stepped,
  stepShows,
  stickyEditDecision,
  topicActAllowed,
  walk,
  walked,
  withSpotlight,
  type DiscussionState,
  type StepAct,
  type StepShows,
} from "./retroSteps";

// What each step allows and shows, and what moving between steps does: the
// one table the model, the board read and the board's controls all read.

const STEPS: RetroStep[] = ["write", "vote", "discuss", "done"];

describe("stepAllows and stepShows", () => {
  // Every act and everything shown, in every step: the rules of ADR-0026 as
  // one table. An act row says whether the step lets it happen at all; a
  // "shows" row, whether everyone's board shows it.
  const table: Record<StepAct | `shows ${keyof StepShows}`, Record<RetroStep, boolean>> = {
    editOthers: { write: false, vote: true, discuss: true, done: true },
    stackOthers: { write: false, vote: true, discuss: true, done: true },
    unstackOthers: { write: false, vote: true, discuss: true, done: true },
    vote: { write: false, vote: true, discuss: false, done: false },
    spotlight: { write: false, vote: true, discuss: true, done: false },
    walk: { write: false, vote: false, discuss: true, done: false },
    "shows faceDown": { write: true, vote: false, discuss: false, done: false },
    "shows totals": { write: false, vote: false, discuss: true, done: true },
    "shows spotlight": { write: false, vote: false, discuss: true, done: false },
  };

  for (const [row, byStep] of Object.entries(table) as [keyof typeof table, Record<RetroStep, boolean>][]) {
    const shown = row.startsWith("shows ") ? (row.slice("shows ".length) as keyof StepShows) : undefined;
    for (const step of STEPS) {
      if (shown) {
        it(`${byStep[step] ? "shows" : "doesn't show"} ${shown} in ${step}`, () => {
          expect(stepShows(step)[shown]).toBe(byStep[step]);
        });
        continue;
      }
      it(`${byStep[step] ? "allows" : "refuses"} ${row} in ${step}`, () => {
        const decision = stepAllows(step, row as StepAct);
        expect(decision.allowed).toBe(byStep[step]);
        if (!decision.allowed) {
          expect(decision.code).toBe("stage");
          expect(decision.message).not.toBe("");
        }
      });
    }
  }
});

describe("topicActAllowed", () => {
  // Ann's board: her stack A (with Bob's B under it, built once revealed) and
  // her loose C; Bob's stack D with Ann's E under it; Ann's loose F and G.
  const stickies = [
    { _id: "A", createdAt: 1, position: { x: 0, y: 0 }, author: "ann" },
    { _id: "B", createdAt: 2, position: { x: 0, y: 0 }, author: "bob", stackId: "A" },
    { _id: "C", createdAt: 3, position: { x: 0, y: 0 }, author: "ann" },
    { _id: "D", createdAt: 4, position: { x: 0, y: 0 }, author: "bob" },
    { _id: "E", createdAt: 5, position: { x: 0, y: 0 }, author: "ann", stackId: "D" },
    { _id: "F", createdAt: 6, position: { x: 0, y: 0 }, author: "ann" },
    { _id: "G", createdAt: 7, position: { x: 0, y: 0 }, author: "ann", stackId: "F" },
  ];
  const annsOwn = (s: { author: string }) => s.author === "ann";
  const stackAct = (stickyId: string, ontoId: string) => ({ kind: "stack", stickyId, ontoId }) as const;
  const unstackAct = (stickyId: string) => ({ kind: "unstack", stickyId }) as const;
  const allowed = (step: RetroStep, act: Parameters<typeof topicActAllowed>[1]) =>
    topicActAllowed(step, act, stickies, annsOwn);

  it("lets a person stack and unstack their own stickies in every step", () => {
    for (const step of STEPS) {
      expect(allowed(step, stackAct("C", "F")).allowed).toBe(true);
      expect(allowed(step, stackAct("F", "C")).allowed).toBe(true);
      expect(allowed(step, unstackAct("G")).allowed).toBe(true);
      // Her own sticky off Bob's stack: it touches nothing of his.
      expect(allowed(step, unstackAct("E")).allowed).toBe(true);
    }
  });

  it("while writing, judges a drop by every sticky it groups, not only the two it names", () => {
    // A brings Bob's B along onto her own C.
    expect(allowed("write", stackAct("A", "C"))).toMatchObject({ allowed: false, code: "stage" });
    // Her C joins the topic her E sits in, which Bob's D tops.
    expect(allowed("write", stackAct("C", "E"))).toMatchObject({ allowed: false, code: "stage" });
    // Her C joins her own A, whose stack holds Bob's B.
    expect(allowed("write", stackAct("C", "A"))).toMatchObject({ allowed: false, code: "stage" });
    // B alone is Bob's.
    expect(allowed("write", stackAct("B", "C"))).toMatchObject({ allowed: false, code: "stage" });
    expect(allowed("write", unstackAct("B"))).toMatchObject({ allowed: false, code: "stage" });
  });

  it("lets anyone group and ungroup anyone's stickies once they're revealed", () => {
    for (const step of ["vote", "discuss", "done"] as const) {
      for (const act of [stackAct("A", "C"), stackAct("C", "E"), stackAct("B", "C"), unstackAct("B")]) {
        expect(allowed(step, act).allowed).toBe(true);
      }
    }
  });

  it("allows a drop that groups nothing new", () => {
    expect(allowed("write", stackAct("B", "A")).allowed).toBe(true);
  });
});

describe("stickyEditDecision", () => {
  const denied = { allowed: false as const, message: "Only the owner can do this." };

  it("always lets the author change their own sticky", () => {
    expect(stickyEditDecision("write", true, denied).allowed).toBe(true);
  });

  it("refuses by step before the reveal, whatever the permission", () => {
    expect(stickyEditDecision("write", false, RESOLVED_ALLOWED)).toMatchObject({ allowed: false, code: "stage" });
  });

  it("after the reveal, carries the permission's own refusal", () => {
    expect(stickyEditDecision("vote", false, denied)).toEqual({
      allowed: false,
      code: "forbidden",
      message: "Only the owner can do this.",
    });
    expect(stickyEditDecision("discuss", false, RESOLVED_ALLOWED).allowed).toBe(true);
  });
});

describe("stepChange", () => {
  it("is the reveal exactly when leaving Write", () => {
    for (const from of STEPS) {
      for (const to of STEPS) {
        const change = stepChange(from, to);
        if (from === to) expect(change).toBeNull();
        else expect(change!.reveal).toBe(from === "write");
      }
    }
  });

  it("starts the discussion on its first topic when entering it from before", () => {
    expect(stepChange("vote", "discuss")!.spotlight).toBe("first");
    expect(stepChange("write", "discuss")!.spotlight).toBe("first");
  });

  it("keeps the spotlight where the walk was when the retro is finished, and back from Done", () => {
    expect(stepChange("discuss", "done")!.spotlight).toBe("keep");
    expect(stepChange("done", "discuss")!.spotlight).toBe("keep");
  });

  it("takes the spotlight off when going back to Write or Vote", () => {
    expect(stepChange("discuss", "vote")!.spotlight).toBe("clear");
    expect(stepChange("done", "write")!.spotlight).toBe("clear");
    expect(stepChange("done", "vote")!.spotlight).toBe("clear");
  });
});

describe("stepped", () => {
  const retro = { step: "vote" as RetroStep, votesPerPerson: 3 };

  it("clears the spotlight going back to Vote, and leaves the discussion's first topic to the server", () => {
    const discussing = { ...retro, step: "discuss" as RetroStep, focusStickyId: "a" };

    expect(stepped(discussing, stepChange("discuss", "vote"))).toEqual({ ...retro, step: "vote" });
    expect(stepped(retro, stepChange("vote", "discuss"))).toEqual({ ...retro, step: "discuss" });
  });

  it("puts a picked topic in the spotlight, moving the retro to the discussion", () => {
    expect(stepped(retro, spotlightStepChange("vote"), "b")).toEqual({ ...retro, step: "discuss", focusStickyId: "b" });
  });

  it("resumes the walk where it was when the retro goes back from Done to Discuss", () => {
    const discussing = { ...retro, step: "discuss" as RetroStep, focusStickyId: "b" };

    const finished = stepped(discussing, stepChange("discuss", "done"));
    expect(finished).toEqual({ ...discussing, step: "done" });
    expect(stepped(finished, stepChange("done", "discuss"))).toEqual(discussing);
  });

  it("places a picked topic against the order: a detour keeps where the walk was", () => {
    const discussing = { ...retro, step: "discuss" as RetroStep, focusStickyId: "a" };

    expect(stepped<string, typeof discussing>(discussing, null, "unvoted", ["a", "b"])).toEqual({
      ...discussing,
      focusStickyId: "unvoted",
      walkStickyId: "a",
    });
    // From Vote the walk hasn't started, so a detour has no place to keep.
    expect(stepped(retro, spotlightStepChange("vote"), "unvoted", ["a", "b"])).toEqual({
      ...retro,
      step: "discuss",
      focusStickyId: "unvoted",
    });
  });

  it("leaves the state as it was when nothing changes", () => {
    const discussing = { ...retro, step: "discuss" as RetroStep, focusStickyId: "a" };

    expect(stepped(discussing, null, discussing.focusStickyId)).toBe(discussing);
  });
});

describe("spotlightStepChange", () => {
  it("moves the retro to the discussion, unless it's there already", () => {
    expect(spotlightStepChange("vote")).toMatchObject({ to: "discuss", reveal: false });
    expect(spotlightStepChange("discuss")).toBeNull();
  });

  it("would be a reveal from Write, so no path can leave Write without one", () => {
    expect(spotlightStepChange("write")).toMatchObject({ to: "discuss", reveal: true });
  });

  it("leaves the retro where the spotlight is drawn, from every step that takes it", () => {
    const taking = STEPS.filter((step) => stepAllows(step, "spotlight").allowed);
    expect(taking).toEqual(["vote", "discuss"]);
    for (const from of taking) {
      expect(stepShows(spotlightStepChange(from)?.to ?? from).spotlight).toBe(true);
    }
  });
});

const columns = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];

function sticky(_id: string, columnId: string, createdAt: number, stackId?: string) {
  return { _id, columnId, createdAt, ...(stackId ? { stackId } : {}) };
}

describe("discussionOrder", () => {
  it("walks the topics that got a vote, most votes first, and leaves the rest out", () => {
    const stickies = [sticky("a", "c1", 1), sticky("b", "c1", 2), sticky("c", "c2", 3)];
    const totals = new Map([
      ["b", 1],
      ["c", 3],
    ]);

    expect(discussionOrder(stickies, totals, columns)).toEqual(["c", "b"]);
  });

  it("breaks a tie by column order, then by whichever was written first", () => {
    const stickies = [sticky("late-c1", "c1", 30), sticky("only-c2", "c2", 10), sticky("early-c1", "c1", 20)];
    const totals = new Map([
      ["late-c1", 2],
      ["only-c2", 2],
      ["early-c1", 2],
    ]);

    expect(discussionOrder(stickies, totals, columns)).toEqual(["early-c1", "late-c1", "only-c2"]);
  });

  it("with no votes at all, walks every topic column by column", () => {
    const stickies = [sticky("x", "c2", 1), sticky("y", "c1", 3), sticky("z", "c1", 2)];

    expect(discussionOrder(stickies, new Map(), columns)).toEqual(["z", "y", "x"]);
    expect(discussionOrder(stickies, new Map([["x", 0]]), columns)).toEqual(["z", "y", "x"]);
  });

  it("walks topics only: a stacked sticky comes up with its stack", () => {
    const stickies = [sticky("top", "c1", 1), sticky("under", "c1", 2, "top")];

    expect(discussionOrder(stickies, new Map(), columns)).toEqual(["top"]);
    expect(discussionOrder(stickies, new Map([["top", 1]]), columns)).toEqual(["top"]);
  });

  it("puts a sticky whose column is gone after every column still on the board", () => {
    const stickies = [sticky("orphan", "removed", 1), sticky("kept", "c3", 2)];

    expect(discussionOrder(stickies, new Map(), columns)).toEqual(["kept", "orphan"]);
  });
});

describe("walk", () => {
  const order = ["a", "b", "c"];
  const on = (focusStickyId?: string, walkStickyId?: string) => ({
    ...(focusStickyId ? { focusStickyId } : {}),
    ...(walkStickyId ? { walkStickyId } : {}),
  });

  it("steps forward and back through the discussion", () => {
    expect(walk(order, on("a"), "next")).toBe("b");
    expect(walk(order, on("c"), "previous")).toBe("b");
  });

  it("stays put past either end", () => {
    expect(walk(order, on("c"), "next")).toBe("c");
    expect(walk(order, on("a"), "previous")).toBe("a");
  });

  it("starts from the top when nothing is in the spotlight, or a detour left no place", () => {
    expect(walk(order, on(), "next")).toBe("a");
    expect(walk(order, on(), "previous")).toBe("a");
    expect(walk(order, on("unvoted"), "next")).toBe("a");
  });

  it("from a detour, carries on after the place the walk left, or goes back to it", () => {
    expect(walk(order, on("unvoted", "b"), "next")).toBe("c");
    expect(walk(order, on("unvoted", "b"), "previous")).toBe("b");
    // Nothing after the last topic: the detour stays put.
    expect(walk(order, on("unvoted", "c"), "next")).toBe("unvoted");
  });

  it("has nothing to put in the spotlight on an empty walk", () => {
    expect(walk([], on(), "next")).toBeUndefined();
    expect(walk([], on("a"), "previous")).toBeUndefined();
  });
});

describe("walked", () => {
  const order = ["a", "b", "c"];
  const discussing = { step: "discuss" as RetroStep, focusStickyId: "b" };

  it("moves the spotlight one topic on, the walk with it", () => {
    expect(walked(discussing, order, "next")).toEqual({ step: "discuss", focusStickyId: "c" });
  });

  it("leaves the retro as it is when the walk stays put, keeping a detour's place", () => {
    const atEnd = { step: "discuss" as RetroStep, focusStickyId: "c" };
    const detourAtEnd = { step: "discuss" as RetroStep, focusStickyId: "unvoted", walkStickyId: "c" };

    expect(walked(atEnd, order, "next")).toBe(atEnd);
    expect(walked(detourAtEnd, order, "next")).toBe(detourAtEnd);
  });
});

describe("withSpotlight and followDiscussion", () => {
  const order = ["a", "b", "c"];
  const retro: { step: RetroStep; votesPerPerson: number } & DiscussionState = { step: "discuss", votesPerPerson: 3 };

  it("keeps the walk's place on a detour to a topic off the order, and lets it go back on it", () => {
    const onB = withSpotlight(retro, "b", order);
    expect(onB).toEqual({ ...retro, focusStickyId: "b" });

    const detour = withSpotlight(onB, "unvoted", order);
    expect(detour).toEqual({ ...retro, focusStickyId: "unvoted", walkStickyId: "b" });
    // A second detour keeps the place the first one left.
    expect(withSpotlight(detour, "late", order)).toEqual({ ...retro, focusStickyId: "late", walkStickyId: "b" });
    expect(withSpotlight(detour, "c", order)).toEqual({ ...retro, focusStickyId: "c" });
    expect(withSpotlight(detour, undefined)).toEqual(retro);
  });

  it("follows the spotlight and the walk's place to their topics, and drops what leaves the board", () => {
    const detour = { ...retro, focusStickyId: "unvoted", walkStickyId: "b" };
    const stacked = { stickies: new Map(), removed: new Set<string>(), topics: new Map([["b", "a"]]) };
    const gone = { stickies: new Map(), removed: new Set(["unvoted"]), topics: new Map([["unvoted", null]]) };
    const nothing = { stickies: new Map(), removed: new Set<string>(), topics: new Map() };

    expect(followDiscussion(detour, stacked)).toEqual({ ...detour, walkStickyId: "a" });
    expect(followDiscussion(detour, gone)).toEqual({ ...retro, walkStickyId: "b" });
    expect(followDiscussion(detour, nothing)).toBe(detour);
  });
});

describe("discussionAt", () => {
  const order = ["a", "b", "c"];
  const discussing = (focusStickyId?: string, walkStickyId?: string) => ({
    step: "discuss" as RetroStep,
    ...(focusStickyId ? { focusStickyId } : {}),
    ...(walkStickyId ? { walkStickyId } : {}),
  });

  it("stands on the spotlight's topic, with the topics before it discussed", () => {
    const place = discussionAt(order, discussing("b"));

    expect(place).toMatchObject({ known: true, count: 3, spotlight: "onOrder", at: 2, next: "c", previous: "a", atEnd: false });
    expect(order.map((t) => place.rank(t))).toEqual([1, 2, 3]);
    expect(order.map((t) => place.discussed(t))).toEqual([true, false, false]);
  });

  it("offers no move past either end, and finishing at the last topic", () => {
    expect(discussionAt(order, discussing("a"))).not.toHaveProperty("previous");
    expect(discussionAt(order, discussing("c"))).toMatchObject({ atEnd: true });
    expect(discussionAt(order, discussing("c"))).not.toHaveProperty("next");
  });

  it("on a detour, stays where the walk left it: that topic and those before it discussed", () => {
    const place = discussionAt(order, discussing("unvoted", "b"));

    expect(place).toMatchObject({ spotlight: "detour", at: 2, next: "c", previous: "b", atEnd: false });
    expect(order.map((t) => place.discussed(t))).toEqual([true, true, false]);
    expect(place.rank("unvoted")).toBeUndefined();
    expect(discussionAt(order, discussing("unvoted", "c"))).toMatchObject({ atEnd: true });
  });

  it("before the walk starts, offers its first topic and nothing back", () => {
    for (const place of [discussionAt(order, discussing()), discussionAt(order, discussing("unvoted"))]) {
      expect(place).toMatchObject({ at: 0, next: "a", atEnd: false });
      expect(place).not.toHaveProperty("previous");
      expect(order.some((t) => place.discussed(t))).toBe(false);
    }
  });

  it("marks every topic discussed once the retro is done", () => {
    const place = discussionAt(order, { step: "done", focusStickyId: "a" });

    expect(order.map((t) => place.discussed(t))).toEqual([true, true, true]);
  });

  it("knows nothing, and offers nothing, while the order isn't known", () => {
    const place = discussionAt(null, discussing("b"));

    expect(place).toMatchObject({ known: false, count: 0, at: 0, atEnd: false });
    expect(place).not.toHaveProperty("next");
    expect(place.rank("b")).toBeUndefined();
  });

  it("finishes straight away when there is nothing to discuss", () => {
    expect(discussionAt([], discussing())).toMatchObject({ known: true, count: 0, atEnd: true });
  });
});
