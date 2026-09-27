import { describe, it, expect } from "vitest";
import { RESOLVED_ALLOWED } from "./permissions";
import type { RetroStep } from "./retroTemplates";
import {
  discussionOrder,
  spotlightStepChange,
  stepAllows,
  stepChange,
  stepped,
  stickyActAllowed,
  stickyEditDecision,
  walk,
  type StepAct,
} from "./retroSteps";

// What each step allows and what moving between steps does: the one table
// the model's refusals and the board's controls both read.

const STEPS: RetroStep[] = ["write", "vote", "discuss", "done"];

describe("stepAllows", () => {
  // Every act in every step: the rules of ADR-0026 as one table.
  const table: Record<StepAct, Record<RetroStep, boolean>> = {
    editOthers: { write: false, vote: true, discuss: true, done: true },
    stackOthers: { write: false, vote: true, discuss: true, done: true },
    unstackOthers: { write: false, vote: true, discuss: true, done: true },
    vote: { write: false, vote: true, discuss: false, done: false },
    spotlight: { write: false, vote: true, discuss: true, done: true },
    walk: { write: false, vote: false, discuss: true, done: false },
  };

  for (const [act, byStep] of Object.entries(table) as [StepAct, Record<RetroStep, boolean>][]) {
    for (const step of STEPS) {
      it(`${byStep[step] ? "allows" : "refuses"} ${act} in ${step}`, () => {
        const decision = stepAllows(step, act);
        expect(decision.allowed).toBe(byStep[step]);
        if (!decision.allowed) {
          expect(decision.code).toBe("stage");
          expect(decision.message).not.toBe("");
        }
      });
    }
  }
});

describe("stickyActAllowed", () => {
  it("lets a person change, stack and unstack their own stickies in every step", () => {
    for (const step of STEPS) {
      for (const act of ["edit", "stack", "unstack"] as const) {
        expect(stickyActAllowed(step, act, true).allowed).toBe(true);
      }
    }
  });

  it("keeps everyone off stickies they can't read yet", () => {
    for (const act of ["edit", "stack", "unstack"] as const) {
      expect(stickyActAllowed("write", act, false)).toMatchObject({ allowed: false, code: "stage" });
      expect(stickyActAllowed("vote", act, false).allowed).toBe(true);
    }
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
    expect(stepChange("done", "discuss")!.spotlight).toBe("keep");
    expect(stepChange("discuss", "done")!.spotlight).toBe("keep");
  });

  it("takes the spotlight off when going back to Write or Vote", () => {
    expect(stepChange("discuss", "vote")!.spotlight).toBe("clear");
    expect(stepChange("done", "write")!.spotlight).toBe("clear");
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

  it("leaves the state as it was when nothing changes", () => {
    const discussing = { ...retro, step: "discuss" as RetroStep, focusStickyId: "a" };

    expect(stepped(discussing, null, discussing.focusStickyId)).toBe(discussing);
  });
});

describe("spotlightStepChange", () => {
  it("moves the retro to the discussion, unless it's done or there already", () => {
    expect(spotlightStepChange("vote")).toMatchObject({ to: "discuss", reveal: false });
    expect(spotlightStepChange("discuss")).toBeNull();
    expect(spotlightStepChange("done")).toBeNull();
  });

  it("would be a reveal from Write, so no path can leave Write without one", () => {
    expect(spotlightStepChange("write")).toMatchObject({ to: "discuss", reveal: true });
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

  it("steps forward and back through the discussion", () => {
    expect(walk(order, "a", "next")).toBe("b");
    expect(walk(order, "c", "previous")).toBe("b");
  });

  it("stays put past either end", () => {
    expect(walk(order, "c", "next")).toBe("c");
    expect(walk(order, "a", "previous")).toBe("a");
  });

  it("starts from the top when nothing, or a topic off the walk, is in the spotlight", () => {
    expect(walk(order, undefined, "next")).toBe("a");
    expect(walk(order, undefined, "previous")).toBe("a");
    expect(walk(order, "unvoted", "next")).toBe("a");
  });

  it("has nothing to put in the spotlight on an empty walk", () => {
    expect(walk([], undefined, "next")).toBeUndefined();
    expect(walk([], "a", "previous")).toBeUndefined();
  });
});
