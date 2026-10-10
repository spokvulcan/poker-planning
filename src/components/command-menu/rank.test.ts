/**
 * The command menu's ranking: names before keywords, whole words before
 * fragments, and a misspelt name found last; keywords never match loosely.
 */
import { describe, it, expect } from "vitest";
import { rank } from "./rank";

describe("rank", () => {
  it("shows every row before anything is typed", () => {
    expect(rank("Pricing", "")).toBe(1);
    expect(rank("Pricing", "   ")).toBe(1);
  });

  it("puts a name that starts with the search first, then a word that does, then a fragment", () => {
    const start = rank("Pricing", "pric");
    const word = rank("Start a retro", "retro");
    const inside = rank("Changelog", "log");
    expect(start).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
  });

  it("ignores case and the spaces around a search", () => {
    expect(rank("Pricing", "  PRIC ")).toBe(1);
  });

  it("finds a row by its keywords, below any name", () => {
    const byKeyword = rank("Dark", "dark mode", ["theme", "dark mode"]);
    expect(byKeyword).toBeGreaterThan(0);
    expect(byKeyword).toBeLessThan(rank("Changelog", "log"));
  });

  it("never finds a row through scattered letters of its keywords", () => {
    expect(rank("Start estimating", "pric", ["poker", "estimate", "story points", "scrum poker"])).toBe(0);
  });

  it("still finds a misspelt name, below every exact match", () => {
    const typo = rank("Pricing", "pricng");
    expect(typo).toBeGreaterThan(0);
    expect(typo).toBeLessThan(rank("Dark", "dark mode", ["dark mode"]));
  });

  it("does not take letters scattered through a long name for a typo", () => {
    expect(rank("Story Points vs Hours: Which Should Your Team Use?", "pric")).toBe(0);
    expect(rank("Why Planning Poker Uses the Fibonacci Sequence", "pokr")).toBeGreaterThan(0);
  });

  it("hides a row that shares nothing with the search", () => {
    expect(rank("Terms of Service", "pric")).toBe(0);
  });
});
