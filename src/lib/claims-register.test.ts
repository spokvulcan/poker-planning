/**
 * The claims register and the words rule (spec §18.2–§18.4, ADR-0014,
 * ADR-0024) over the site's copy modules: the register-checked strings live
 * in plain `.ts` modules the components import, so this node-project test
 * can read every line without a DOM. The §19 copy register is
 * `src/components/retro/copy-register.test.ts`.
 */
import { describe, it, expect } from "vitest";
import * as homepage from "@/components/homepage/copy";
import * as seo from "@/components/seo/copy";

describe("the hero (spec §18.2)", () => {
  it("keeps the earned line and widens it", () => {
    expect(`${homepage.HERO.headline} ${homepage.HERO.headlineMuted}`).toBe(
      "Estimate and reflect, without the noise.",
    );
  });

  it("sends Start estimating to /room/new under the existing test id", () => {
    expect(homepage.HERO.estimate).toEqual({
      label: "Start estimating",
      href: "/room/new",
      testId: "hero-start-button",
    });
  });

  it("sends Start a retro to /retro/new under hero-retro-button", () => {
    expect(homepage.HERO.retro).toEqual({
      label: "Start a retro",
      href: "/retro/new",
      testId: "hero-retro-button",
    });
  });
});

const saysRetro = (text: string) => /\bretros?\b/i.test(text);

describe("two ceremonies, one toolkit (spec §18.2)", () => {
  it("puts one card per ceremony under the hero, each with its own CTA", () => {
    expect(homepage.CEREMONIES.poker.cta).toEqual({ label: "Start estimating", href: "/room/new" });
    expect(homepage.CEREMONIES.retro.cta).toEqual({ label: "Start a retro", href: "/retro/new" });
  });

  it("moves the Interactive Demo CTA onto the planning poker card", () => {
    expect(homepage.CEREMONIES.poker.demo).toEqual({ label: "Interactive Demo", href: "/demo" });
    expect(homepage.CEREMONIES.retro).not.toHaveProperty("demo");
  });

  it("tabs how-it-works per ceremony, four steps each", () => {
    expect(homepage.HOW_IT_WORKS.poker.steps).toHaveLength(4);
    expect(homepage.HOW_IT_WORKS.retro.steps).toHaveLength(4);
    expect(homepage.HOW_IT_WORKS.poker.animation.startButton).toBe("Start Session");
  });

  it("gives app-preview a retro slot, with the poker image in it until the manual capture", () => {
    expect(homepage.APP_PREVIEW.poker.features).toHaveLength(3);
    expect(homepage.APP_PREVIEW.retro.features).toHaveLength(3);
    expect(homepage.APP_PREVIEW.retro.image.light).toMatch(/\.png$/);
    expect(homepage.APP_PREVIEW.retro.image.dark).toMatch(/\.png$/);
  });

  it("gives use-cases, the capabilities list and the closing CTA retro lines", () => {
    expect(homepage.USE_CASES.items.some((c) => saysRetro(c.description))).toBe(true);
    expect(homepage.CAPABILITIES.retro.features.length).toBeGreaterThanOrEqual(4);
    expect(homepage.CAPABILITIES.poker.features.length).toBeGreaterThanOrEqual(4);
    expect(homepage.CALL_TO_ACTION.retro).toEqual({ label: "Start a retro", href: "/retro/new" });
  });

  it("gives both FAQ lists, the visible one and the structured-data one, retro questions", () => {
    expect(homepage.FAQ.items.filter((f) => saysRetro(f.question)).length).toBeGreaterThanOrEqual(2);
    expect(seo.FAQ_SCHEMA.filter((f) => saysRetro(f.question)).length).toBeGreaterThanOrEqual(2);
  });

  it("gives the Free tier a retro line and keeps the Pro tier silent on retros", () => {
    const [free, pro] = homepage.PRICING_SECTION.tiers;
    expect(free.id).toBe("free");
    expect(free.features.some(saysRetro)).toBe(true);
    expect(pro.id).toBe("pro");
    expect([pro.name, pro.description, ...pro.features].some(saysRetro)).toBe(false);
  });
});

// --- The claims register and the words rule over every string ---

interface Line {
  path: string;
  text: string;
}

/** Every string in a copy module, with the path it was found at. */
function everyLine(moduleName: string, value: unknown, path = moduleName, out: Line[] = []): Line[] {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => everyLine(moduleName, v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) everyLine(moduleName, v, `${path}.${k}`, out);
  }
  return out;
}

/** A line is retro-scoped when it says "retro" or sits under a `retro` key. */
const retroScoped = ({ path, text }: Line) => /(^|\.)retro(\.|\[|$)/i.test(path) || saysRetro(text);

/**
 * The sentences of a line the retro rules apply to: every sentence under a
 * `retro` key, otherwise only the sentences that say "retro". A mixed line
 * may describe poker's analytics in one sentence and the retro in the next.
 */
function retroSentences({ path, text }: Line): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return /(^|\.)retro(\.|\[|$)/i.test(path) ? sentences : sentences.filter(saysRetro);
}

/** Labels a person reads in the UI, where "Retro" is the word and "retrospective" is not (§18.4). Metadata is exempt. */
const uiLabel = ({ path }: Line) =>
  !/(^|\.)meta(data)?(\.|$)/i.test(path) &&
  /\.(label|cta|title|name|heading|headingMuted|eyebrow|points\[\d+\]|features\[\d+\]|tabs\.(poker|retro))$/.test(path);

/** May-not-say phrases and the two product words that never appear (§18.3, §18.4). Applies to every line. */
const NEVER: [string, RegExp][] = [
  ["insights", /\binsights?\b/i],
  ["notification", /\bnotifications?\b/i],
  ["ceremony (a docs-only word)", /\bceremon(y|ies)\b/i],
  ["any AI", /\bAI\b|\bA\.I\.|artificial intelligence|machine learning|\bLLMs?\b|\bGPT\b|\bcopilot\b|\bAI-\w+/i],
  ["a workspace or org product", /\bworkspaces?\b|\borgani[sz]ations?\b|\borg\b|\bSSO\b|\bseats?\b/i],
  ["an effect size", /effect size|\bd\s?=\s?\d|Hedges|Cohen|meta-analy/i],
  ["X% of action items", /\d+\s?%[^.]*\baction items?\b|\baction items?\b[^.]*\d+\s?%/i],
];

/** What a line about the retro may not add (§18.3, §18.4, ADR-0024). */
const RETRO_NEVER: [string, RegExp][] = [
  ["session (planning poker's word)", /\bsessions?\b/i],
  ["a pricing tier", /\bPro\b|\btiers?\b|\bplans?\b|\bpaid\b|\bsubscriptions?\b|\bupgrade\b|\bpremium\b|\bwaitlist\b/i],
  ["an outcome", /\bimprov\w*\b|\boutcomes?\b|\bvelocity\b|\bproductiv\w*\b|\bdeliver\w*\b|\bbetter\b|\beffective\w*\b|\bmorale\b|\bengagement\b|\bfaster\b|\bhappier\b/i],
  ["anonymity making it better", /\banonym\w*\b[^.]*\b(honest|candid|safe|safer|better|braver)\b|\b(honest|candid|safe|safer|better|braver)\b[^.]*\banonym\w*/i],
  ["a number measuring the team", /\bscores?\b|\brates?\b|\brating\b|\bstreaks?\b|\btrends?\b|\bpercent\w*|%|\bhealth\b|\bmaturity\b|\bbenchmark\w*|\baverage\b|\bmetrics?\b|\banalytics\b/i],
];

/** Every violation in a set of lines, as "rule @ path: text". */
function violations(lines: Line[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const [rule, pattern] of NEVER) {
      if (pattern.test(line.text)) out.push(`${rule} @ ${line.path}: ${line.text}`);
    }
    if (retroScoped(line)) {
      const sentences = retroSentences(line);
      for (const [rule, pattern] of RETRO_NEVER) {
        if (sentences.some((sentence) => pattern.test(sentence))) out.push(`${rule} @ ${line.path}: ${line.text}`);
      }
      if (uiLabel(line) && /retrospective/i.test(line.text)) {
        out.push(`retrospective in a UI label @ ${line.path}: ${line.text}`);
      }
    }
  }
  return out;
}

describe("the checker itself", () => {
  it("catches each kind of forbidden line", () => {
    const fixture = everyLine("f", {
      a: "Deep team insights",
      b: "Email notifications",
      c: "Two ceremonies, one toolkit",
      d: "AI summaries of your retro",
      e: "One workspace for the org",
      retro: {
        f: "Run a retro session",
        g: "Retros are in the Pro tier",
        h: "Retros improve delivery",
        i: "Anonymous retros are more honest",
        j: "Your retro health score",
        label: "Start a retrospective",
      },
      RETRO: { points: ["Improves your retrospective"] },
      meta: { title: "Free Retrospectives Online" },
      poker: { k: "Unlimited sessions, 89% consensus, faster than ever" },
    });
    const rules = violations(fixture).map((v) => v.split(" @ ")[0]);
    expect(rules).toEqual([
      "insights",
      "notification",
      "ceremony (a docs-only word)",
      "any AI",
      "a workspace or org product",
      "session (planning poker's word)",
      "a pricing tier",
      "an outcome",
      "anonymity making it better",
      "a number measuring the team",
      "retrospective in a UI label",
      "an outcome",
      "retrospective in a UI label",
    ]);
  });
});

/** The copy modules under the register. PR (b) adds features, about, pricing and the site metadata. */
const MODULES: [string, unknown][] = [
  ["homepage", homepage],
  ["seo", seo],
];

describe("the claims register and the words rule (spec §18.3, §18.4)", () => {
  const lines = MODULES.flatMap(([name, mod]) => everyLine(name, mod));

  it("reads a sizeable set of copy", () => {
    expect(lines.length).toBeGreaterThan(150);
  });

  it("finds no forbidden line", () => {
    expect(violations(lines)).toEqual([]);
  });

  it("says retro in the product and retrospective only in long-form copy", () => {
    const labels = lines.filter(retroScoped).filter(uiLabel);
    expect(labels.length).toBeGreaterThan(5);
    expect(labels.some((l) => /\bRetro\b/.test(l.text))).toBe(true);
  });
});
