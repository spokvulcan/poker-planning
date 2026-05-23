import { describe, it, expect } from "vitest";
import {
  initialDemoState,
  advanceDemo,
  summarizeDemoVotes,
  createSeededRng,
  type DemoReducerConfig,
  type DemoSimulationState,
} from "./simulation";
import { DEMO_REDUCER_CONFIG } from "./fixtures";
import { summarize } from "@/convex/summarize";

// A focused 3-bot config with tiny timings. Each bot has a single preferred
// card so vote outcomes are fully determined by which bots are chosen.
const config: DemoReducerConfig = {
  bots: [
    { id: "a", preferredCards: ["3"] },
    { id: "b", preferredCards: ["5"] },
    { id: "c", preferredCards: ["8"] },
  ],
  voteProbability: 0.8,
  voteIntervalMs: 1000,
  countdownMs: 3000,
  resultsDisplayMs: 5000,
};

// rng that always proceeds (0 <= probability) and always picks the first
// option: one not-yet-voted bot per cycle, in roster order, its first card.
const ALWAYS = () => 0;

function tick(
  state: DemoSimulationState,
  cfg: DemoReducerConfig,
  rng: () => number,
  elapsedMs = cfg.voteIntervalMs,
): DemoSimulationState {
  return advanceDemo(state, cfg, { elapsedMs, rng });
}

function votedIds(state: DemoSimulationState): string[] {
  return Object.keys(state.votes);
}

function driveTo(
  phase: DemoSimulationState["phase"],
  cfg: DemoReducerConfig,
  rng: () => number,
): DemoSimulationState {
  let s = initialDemoState();
  for (let i = 0; i < 200 && s.phase !== phase; i++) s = tick(s, cfg, rng);
  if (s.phase !== phase) throw new Error(`never reached phase ${phase}`);
  return s;
}

describe("demo reducer — voting phase", () => {
  it("starts in a fresh voting round with no votes", () => {
    const s = initialDemoState();
    expect(s.phase).toBe("voting");
    expect(s.votes).toEqual({});
  });

  it("accumulates bot votes across voting cycles", () => {
    let s = initialDemoState();
    s = tick(s, config, ALWAYS);
    expect(votedIds(s)).toHaveLength(1);
    s = tick(s, config, ALWAYS);
    expect(votedIds(s)).toHaveLength(2);
    expect(s.phase).toBe("voting"); // 3-bot table not full yet
  });

  it("arms the countdown only once every bot has voted", () => {
    let s = initialDemoState();
    s = tick(s, config, ALWAYS); // 1
    s = tick(s, config, ALWAYS); // 2
    expect(s.phase).toBe("voting"); // still missing the 3rd
    s = tick(s, config, ALWAYS); // 3 → table full
    expect(s.phase).toBe("countingDown");
    expect(votedIds(s)).toHaveLength(3);
  });

  it("only ever casts a bot's preferred card", () => {
    let s = initialDemoState();
    const rng = createSeededRng(42);
    for (let i = 0; i < 100 && s.phase === "voting"; i++) s = tick(s, config, rng);
    for (const bot of config.bots) {
      const card = s.votes[bot.id];
      if (card !== undefined) expect(bot.preferredCards).toContain(card);
    }
  });

  it("never casts more than three bots in a single cycle", () => {
    // A 5-bot, single-card config; one big cycle. rng=0 ⇒ count = 1+floor(0*3)=1,
    // but assert the contract holds across seeds too.
    const big: DemoReducerConfig = {
      ...config,
      bots: ["a", "b", "c", "d", "e"].map((id) => ({ id, preferredCards: ["5"] })),
    };
    for (let seed = 0; seed < 20; seed++) {
      const before = initialDemoState();
      const after = tick(before, big, createSeededRng(seed));
      expect(votedIds(after).length).toBeLessThanOrEqual(3);
    }
  });
});

describe("demo reducer — countdown & reveal", () => {
  it("holds in countingDown until the countdown elapses, then reveals", () => {
    let s = driveTo("countingDown", config, ALWAYS);
    s = advanceDemo(s, config, { elapsedMs: config.countdownMs - 1, rng: ALWAYS });
    expect(s.phase).toBe("countingDown");
    s = advanceDemo(s, config, { elapsedMs: 1, rng: ALWAYS });
    expect(s.phase).toBe("revealed");
  });

  it("reveal produces a summarize result over exactly the cast votes", () => {
    const s = driveTo("revealed", config, ALWAYS);
    // ALWAYS ⇒ each bot played its single preferred card: a:3, b:5, c:8.
    const summary = summarizeDemoVotes(s.votes, { isNumeric: true });
    expect(summary.stats.voteCount).toBe(3);
    expect(summary.stats.median).toBe(5);
    expect(summary.consensus).toBe("3"); // 3-way mode tie → lowest numeric
    // identical to calling the shared pure computation directly
    expect(summary).toEqual(
      summarize(
        Object.values(s.votes).map((cardLabel) => ({ cardLabel })),
        { isNumeric: true },
      ),
    );
  });

  it("holds the revealed result for resultsDisplayMs, then resets to a fresh round", () => {
    let s = driveTo("revealed", config, ALWAYS);
    const heldVotes = s.votes;
    s = advanceDemo(s, config, {
      elapsedMs: config.resultsDisplayMs - 1,
      rng: ALWAYS,
    });
    expect(s.phase).toBe("revealed");
    expect(s.votes).toEqual(heldVotes); // votes retained while held
    s = advanceDemo(s, config, { elapsedMs: 2, rng: ALWAYS });
    expect(s.phase).toBe("voting");
    expect(s.votes).toEqual({}); // fresh round
  });
});

describe("demo reducer — pause/resume & determinism", () => {
  it("does not advance when no time elapses (tab hidden)", () => {
    let s = initialDemoState();
    s = tick(s, config, ALWAYS); // one vote in
    expect(advanceDemo(s, config, { elapsedMs: 0, rng: ALWAYS })).toBe(s);

    const counting = driveTo("countingDown", config, ALWAYS);
    expect(advanceDemo(counting, config, { elapsedMs: 0, rng: ALWAYS })).toBe(
      counting,
    );
  });

  it("is deterministic for a given seed", () => {
    const run = () => {
      let s = initialDemoState();
      const rng = createSeededRng(7);
      const trace: string[] = [];
      for (let i = 0; i < 60; i++) {
        s = tick(s, DEMO_REDUCER_CONFIG, rng);
        trace.push(`${s.phase}:${Object.keys(s.votes).length}`);
      }
      return trace.join("|");
    };
    expect(run()).toBe(run());
  });
});

describe("demo reducer — real fixtures", () => {
  it("fills all six demo bots and reveals a coherent round", () => {
    let s = initialDemoState();
    for (let i = 0; i < 200 && s.phase !== "revealed"; i++) {
      s = advanceDemo(s, DEMO_REDUCER_CONFIG, {
        elapsedMs: DEMO_REDUCER_CONFIG.voteIntervalMs,
        rng: ALWAYS,
      });
    }
    expect(s.phase).toBe("revealed");
    const summary = summarizeDemoVotes(s.votes);
    expect(summary.stats.voteCount).toBe(6);
    // First-preferred of each bot: 2,5,3,5,8,3 → modes {5,3} tie → lowest "3".
    expect(summary.consensus).toBe("3");
  });
});
