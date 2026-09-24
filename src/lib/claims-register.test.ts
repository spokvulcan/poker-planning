/**
 * The claims register and the words rule (ADR-0014, ADR-0024) over the
 * site's copy modules: the register-checked strings live in plain `.ts`
 * modules the components import, so this node-project test can read every
 * line without a DOM.
 *
 * The retro is the whiteboard retro: stickies, a sticky pad per column,
 * votes, a discussion and action items, on the planning poker canvas. A
 * line about it may say what the board does, and the numbers it quotes come
 * from the product's own constants. It may not bring back what the board
 * does not have: teams, retro emails, kept history, a format library, JSON
 * export, anonymous stickies, or a claim that no author is stored.
 */
import { describe, it, expect } from "vitest";
import * as homepage from "@/components/homepage/copy";
import * as seo from "@/components/seo/copy";
import * as site from "@/lib/site-copy";
import * as features from "@/app/features/copy";
import * as about from "@/app/about/copy";
import * as pricing from "@/app/pricing/copy";
import { siteConfig } from "@/lib/site-config";
import {
  DEFAULT_VOTES_PER_PERSON,
  MAX_COLUMNS,
  MAX_VOTES_PER_PERSON,
  MIN_VOTES_PER_PERSON,
  RETRO_TEMPLATES,
} from "@/convex/retroTemplates";

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

describe("metadata, features and about (spec §18.1, §18.2)", () => {
  it("sets the site default title", () => {
    expect(site.SITE.title).toBe("Free Planning Poker & Retros Online | AgileKit");
    expect(site.SITE.openGraph.title).toBe(site.SITE.title);
    expect(site.SITE.twitter.title).toBe(site.SITE.title);
  });

  it("drops Planning Poker from the features page title and its Open Graph title", () => {
    expect(features.META.title).not.toMatch(/planning poker/i);
    expect(features.META.openGraph.title).not.toMatch(/planning poker/i);
  });

  it("anchors the features page at #planning-poker and #retro", () => {
    expect(features.POKER.anchor).toBe("planning-poker");
    expect(features.RETRO.anchor).toBe("retro");
    expect(features.RETRO.items.length).toBeGreaterThanOrEqual(4);
    expect(features.POKER.items.length).toBeGreaterThanOrEqual(4);
  });

  it("gives the About page the position", () => {
    expect(about.HERO.position).toBe(
      "AgileKit is the free, open-source way for distributed Scrum teams to estimate and reflect, everyone at once, on one real-time whiteboard.",
    );
  });
});

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

  it("gives app-preview a retro slot with its own board, light and dark", () => {
    expect(homepage.APP_PREVIEW.poker.features).toHaveLength(3);
    expect(homepage.APP_PREVIEW.retro.features).toHaveLength(3);
    expect(homepage.APP_PREVIEW.retro.image.light).toMatch(/\.png$/);
    expect(homepage.APP_PREVIEW.retro.image.dark).toMatch(/\.png$/);
    expect(homepage.APP_PREVIEW.retro.image.light).not.toBe(homepage.APP_PREVIEW.poker.image.light);
    expect(homepage.APP_PREVIEW.retro.image.dark).not.toBe(homepage.APP_PREVIEW.poker.image.dark);
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

/** May-not-say phrases and the product words that never appear. Applies to every line. */
const NEVER: [string, RegExp][] = [
  ["insights", /\binsights?\b/i],
  ["notification", /\bnotifications?\b/i],
  ["ceremony (a docs-only word)", /\bceremon(y|ies)\b/i],
  ["any AI", /\bAI\b|\bA\.I\.|artificial intelligence|machine learning|\bLLMs?\b|\bGPT\b|\bcopilot\b|\bAI-\w+/i],
  ["a workspace or org product", /\bworkspaces?\b|\borgani[sz]ations?\b|\borg\b|\bSSO\b|\bseats?\b/i],
  [
    "a Teams product (there are no teams)",
    /\bteam (pages?|history|retros?|defaults|invites?|admins?|settings)\b|\bteam['’]s (own )?(history|formats?|templates?|retros?)\b|\b(kept|stays?|stored|lives?) (by|with|for|in) (the|your|a) team\b|\b(per|a new|create a|join a) team\b/i,
  ],
  ["an effect size", /effect size|\bd\s?=\s?\d|Hedges|Cohen|meta-analy/i],
  ["X% of action items", /\d+\s?%[^.]*\baction items?\b|\baction items?\b[^.]*\d+\s?%/i],
];

/** What a line about the retro may not add (ADR-0014, ADR-0024), or bring back from the old team retro. */
const RETRO_NEVER: [string, RegExp][] = [
  ["session (planning poker's word)", /\bsessions?\b/i],
  ["a pricing tier", /\bPro\b|\btiers?\b|\bplans?\b|\bpaid\b|\bsubscriptions?\b|\bupgrade\b|\bpremium\b|\bwaitlist\b/i],
  ["an outcome", /\bimprov\w*\b|\boutcomes?\b|\bvelocity\b|\bproductiv\w*\b|\bdeliver\w*\b|\bbetter\b|\beffective\w*\b|\bmorale\b|\bengagement\b|\bfaster\b|\bhappier\b/i],
  ["anonymity making it better", /\banonym\w*\b[^.]*\b(honest|candid|safe|safer|better|braver)\b|\b(honest|candid|safe|safer|better|braver)\b[^.]*\banonym\w*/i],
  ["a number measuring the team", /\bscores?\b|\brates?\b|\brating\b|\bstreaks?\b|\btrends?\b|\bpercent\w*|%|\bhealth\b|\bmaturity\b|\bbenchmark\w*|\baverage\b|\bmetrics?\b|\banalytics\b/i],
  ["a retro email, reminder or nudge (there are none)", /\be-?mails?\b|\breminders?\b|\bnudges?\b|\bunsubscribe\b/i],
  ["retro history (a retro keeps none)", /\bhistor(y|ies)\b|\bpermanent\w*|\bnothing (is )?forgotten\b/i],
  ["a JSON export (a retro copies as Markdown)", /\bJSON\b/i],
  ["a format library (five templates, columns edited on the board)", /\bformats?\b|\bLean Coffee\b/i],
  [
    "that no author is stored (authors are hidden, not erased)",
    /\bno authors?\b[^.]*\bstored\b|\bstores? no authors?\b|\bnot even (for )?the facilitator\b/i,
  ],
  ["that stickies are anonymous (names are hidden, the author is stored)", /\banonym\w*\b/i],
];

/**
 * Column titles the product ships that read like claims out of context:
 * "To improve" names a column of the default template, not an outcome.
 * Taken out of a sentence before the retro rules read it.
 */
const COLUMN_TITLES = /\bTo improve\b/g;

/** Every violation in a set of lines, as "rule @ path: text". */
function violations(lines: Line[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const [rule, pattern] of NEVER) {
      if (pattern.test(line.text)) out.push(`${rule} @ ${line.path}: ${line.text}`);
    }
    if (retroScoped(line)) {
      const sentences = retroSentences(line).map((sentence) => sentence.replace(COLUMN_TITLES, ""));
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
      l: "Create a team and keep its history",
      retro: {
        f: "Run a retro session",
        g: "Retros are in the Pro tier",
        h: "Retros improve delivery",
        i: "Anonymous retros are more honest",
        j: "Your retro health score",
        m: "We email the team a reminder",
        n: "Every retro's history, kept for good",
        o: "Export the retro as JSON",
        p: "Six formats, or your own",
        q: "No author is stored, not even for the facilitator",
        r: "Anonymous by default",
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
      "a Teams product (there are no teams)",
      "session (planning poker's word)",
      "a pricing tier",
      "an outcome",
      "anonymity making it better",
      "that stickies are anonymous (names are hidden, the author is stored)",
      "a number measuring the team",
      "a retro email, reminder or nudge (there are none)",
      "retro history (a retro keeps none)",
      "a JSON export (a retro copies as Markdown)",
      "a format library (five templates, columns edited on the board)",
      "that no author is stored (authors are hidden, not erased)",
      "that stickies are anonymous (names are hidden, the author is stored)",
      "retrospective in a UI label",
      "an outcome",
      "retrospective in a UI label",
    ]);
  });

  it("lets the whiteboard retro's own claims through, and poker's words stay poker's", () => {
    const fixture = everyLine("ok", {
      retro: {
        a: "Went well / To improve / Ideas by default.",
        b: "Stickies stay face-down until the facilitator reveals them, like cards in planning poker.",
        c: "Search GIPHY from a sticky, or paste a GIPHY, Tenor or Imgur link.",
        d: "Drop a sticky on a similar one to stack them. Everyone gets three votes, one per topic.",
        e: "Start the next retro and every open action item carries over.",
        f: "Teammates see what was written, not by whom.",
        g: "A guest's retro is removed after 5 days without activity.",
        h: "Copy the retro as Markdown, or download it.",
        i: "Names hidden by default. A setting shows authors when your team wants them.",
      },
      poker: {
        members: "Unlimited team members",
        history: "5-day history for planning poker rooms",
        email: "Priority email support",
        exports: "Export full session data as CSV or JSON",
      },
    });
    expect(violations(fixture)).toEqual([]);
  });

  it("exempts the column title, not the phrase", () => {
    const fixture = everyLine("f", { retro: { a: "Retros help teams to improve." } });
    expect(violations(fixture).map((v) => v.split(" @ ")[0])).toEqual(["an outcome"]);
  });
});

/** The copy modules under the register; the pricing page is in scope (issue #300). */
const MODULES: [string, unknown][] = [
  ["homepage", homepage],
  ["seo", seo],
  ["site", site],
  ["features", features],
  ["about", about],
  ["pricing", pricing],
  ["siteConfig", { blog: siteConfig.blog, description: siteConfig.description }],
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

// --- The retro's numbers and names are the board's ---

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "5" or "five" as 5; anything else (e.g. "a", "your") as undefined. */
function numberOf(word: string): number | undefined {
  if (/^\d+$/.test(word)) return Number(word);
  const n = NUMBER_WORDS.indexOf(word.toLowerCase());
  return n === -1 ? undefined : n;
}

/** Every number a line puts in front of `noun`, e.g. "Five templates" → 5. */
function countsBefore(noun: RegExp, lines: Line[]): { path: string; n: number }[] {
  return lines.flatMap(({ path, text }) =>
    [...text.matchAll(new RegExp(`\\b(\\w+) ${noun.source}`, "gi"))]
      .map((match) => ({ path, n: numberOf(match[1]) }))
      .filter((claim): claim is { path: string; n: number } => claim.n !== undefined),
  );
}

describe("the retro copy quotes the board (claims backed by the product)", () => {
  const lines = MODULES.flatMap(([name, mod]) => everyLine(name, mod));

  it("counts the templates the product ships", () => {
    const claims = countsBefore(/(?:retro )?(?:column )?templates\b/, lines);
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) expect(claim.n, claim.path).toBe(RETRO_TEMPLATES.length);
  });

  it("names every template on /features by the product's own column titles", () => {
    const templates = features.RETRO.items.find((item) => item.id === "templates");
    const named = templates?.description.replace(/ \/ /g, ", ") ?? "";
    for (const template of RETRO_TEMPLATES) expect(named).toContain(template.name);
  });

  it("quotes the votes a person gets and the range a retro can set", () => {
    const claims = countsBefore(/votes\b/, lines);
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) expect(claim.n, claim.path).toBe(DEFAULT_VOTES_PER_PERSON);
    expect(homepage.HOW_IT_WORKS.retro.animation.votesPerPerson).toBe(DEFAULT_VOTES_PER_PERSON);

    const ranges = lines
      .filter(({ text }) => /\bvotes?\b/i.test(text))
      .flatMap(({ text }) => [...text.matchAll(/\b(\d+) to (\d+)\b/g)].map((m) => [Number(m[1]), Number(m[2])]));
    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) expect(range).toEqual([MIN_VOTES_PER_PERSON, MAX_VOTES_PER_PERSON]);
  });

  it("caps the columns where the product does", () => {
    const caps = lines
      .filter(({ text }) => /\bcolumns?\b/i.test(text))
      .flatMap(({ text }) => [...text.matchAll(/\bup to (\w+)\b/gi)].map((m) => numberOf(m[1])));
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) expect(cap).toBe(MAX_COLUMNS);
  });
});
