/**
 * The retro's Markdown summary: action items first, then the discussed
 * topics in order with their stacks, then every sticky by column; built only
 * from what the viewer can see.
 */
import { describe, it, expect } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, StickyView } from "@/convex/model/retro";
import { columnsFromTemplate } from "@/convex/retroTemplates";
import { buildRetroSummary, stickiesLabel } from "./retro-summary";

const columns = columnsFromTemplate("classic");

function sticky(id: string, overrides: Partial<StickyView> = {}): StickyView {
  return {
    _id: id as Id<"retroStickies">,
    clientId: id,
    columnId: "c1",
    position: { x: 0, y: 0 },
    createdAt: Number(id.replace(/\D/g, "")),
    mine: false,
    hidden: false,
    text: `Sticky ${id}`,
    ...overrides,
  };
}

const item = (text: string, overrides: Partial<ActionItemView> = {}): ActionItemView => ({
  _id: text as Id<"retroActionItems">,
  text,
  done: false,
  carriedOver: false,
  createdAt: 1,
  ...overrides,
});

describe("buildRetroSummary", () => {
  it("leads with the action items, then the topics in discussion order with their stacks, then each column", () => {
    const markdown = buildRetroSummary({
      name: "Sprint 42 retro",
      createdAt: new Date(2026, 8, 24, 12).getTime(),
      step: "done",
      columns,
      stickies: [
        sticky("s1", { text: "Fast deploys", votes: 1 }),
        sticky("s2", { text: "Long standups", columnId: "c2", votes: 3 }),
        sticky("s3", { text: "Standups drag", columnId: "c2", stackId: "s2" as Id<"retroStickies"> }),
        sticky("s4", { text: "", columnId: "c3", gif: { url: "https://media.giphy.com/media/x/giphy.gif", width: 1, height: 1, title: "This is fine" } }),
      ],
      topics: ["s2", "s1"],
      actionItems: [item("Timebox standups", { ownerName: "Bea" }), item("Write the runbook", { done: true })],
    });

    expect(markdown).toBe(
      [
        "# Sprint 42 retro",
        "",
        "_24 Sep 2026 · 4 stickies_",
        "",
        "## Action items",
        "",
        "- [ ] Timebox standups (@Bea)",
        "- [x] Write the runbook",
        "",
        "## Top topics",
        "",
        "1. Long standups (3 votes)",
        "   - Standups drag",
        "2. Fast deploys (1 vote)",
        "",
        "## 😊 Went well",
        "",
        "- Fast deploys",
        "",
        "## 🤔 To improve",
        "",
        "- Long standups",
        "- Standups drag",
        "",
        "## 💡 Ideas",
        "",
        "- ![This is fine](https://media.giphy.com/media/x/giphy.gif)",
        "",
      ].join("\n")
    );
  });

  it("leaves out face-down stickies and, before Discuss, the topics", () => {
    const markdown = buildRetroSummary({
      name: "R",
      createdAt: 0,
      step: "write",
      columns,
      stickies: [sticky("s1", { text: "Mine" }), sticky("s2", { hidden: true, text: undefined })],
      topics: ["s1"],
      actionItems: [],
    });
    expect(markdown).not.toContain("Top topics");
    expect(markdown).toContain("_None yet._");
    expect(markdown).toContain("- Mine");
    expect(markdown.match(/^- /gm)).toHaveLength(1);
  });
});

describe("stickiesLabel", () => {
  it("counts in words", () => {
    expect([stickiesLabel(0), stickiesLabel(1), stickiesLabel(2)]).toEqual(["0 stickies", "1 sticky", "2 stickies"]);
  });
});
