/**
 * The local dot rule (spec §10.8): a dot is refused in the browser when the
 * viewer's own count in the tally equals the entry's budget or the topic's
 * `maxPerTopic`, by the same reading the server enforces.
 */
import { describe, it, expect } from "vitest";
import type { TallyRead } from "@/convex/model/retroVotes";
import { dotRefusal, dotsLeft, dotsOf } from "./dots";

const tally = (patch: Partial<TallyRead> = {}): TallyRead => ({
  stageEntryId: "v1",
  visible: false,
  counts: {},
  mine: {},
  spent: 0,
  budget: 5,
  ...patch,
});

describe("dotRefusal", () => {
  it("lands under the budget, refuses the sixth dot, and refuses without a budget or a tally", () => {
    expect(dotRefusal(tally({ spent: 4 }), "t")).toBeNull();
    expect(dotRefusal(tally({ spent: 5 }), "t")).toBe("All your votes are placed");
    expect(dotRefusal(tally({ budget: undefined }), "t")).toBe("This stage takes no votes");
    expect(dotRefusal(undefined, "t")).toBe("This stage takes no votes");
  });

  it("caps one topic at maxPerTopic by own dots there, leaving other topics open", () => {
    const capped = tally({ spent: 1, maxPerTopic: 1, mine: { t: 1 } });
    expect(dotRefusal(capped, "t")).toBe("No more votes on this topic");
    expect(dotRefusal(capped, "u")).toBeNull();
  });
});

describe("dotsOf and dotsLeft", () => {
  it("shows the aggregate only when the entry does, own dots always, and the remainder of the budget", () => {
    const hidden = tally({ spent: 2, counts: { t: 7 }, mine: { t: 2 } });
    expect(dotsOf(hidden, "t")).toEqual({ mine: 2 });
    expect(dotsOf(tally({ visible: true, counts: { t: 7 }, mine: { t: 2 } }), "t")).toEqual({ count: 7, mine: 2 });
    expect(dotsOf(tally({ visible: true }), "t")).toEqual({ count: 0, mine: 0 });
    expect(dotsOf(undefined, "t")).toEqual({ mine: 0 });
    expect(dotsLeft(hidden)).toBe(3);
    expect(dotsLeft(tally({ budget: undefined }))).toBeUndefined();
    expect(dotsLeft(tally({ spent: 9 }))).toBe(0);
  });
});
