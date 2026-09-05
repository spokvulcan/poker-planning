/**
 * The create form's format draft (ADR-0021, spec §6.1): pure reducers that
 * refuse what the server would refuse — the ten-prompt and ten-stage caps,
 * the collect/discuss locks, the current entry's index — by returning the
 * draft unchanged, so the form never sends a shape creation rejects.
 */
import { describe, it, expect } from "vitest";
import {
  addPrompt,
  addStage,
  canAddPrompt,
  draftFromLibrary,
  movedOrder,
  removePrompt,
  removeStage,
  reorderStages,
  setCardsVisible,
  updatePrompt,
} from "./format-draft";
import { DEFAULT_RETRO_FORMAT, RETRO_FORMATS, findFormat } from "@/convex/model/retroFormats";

const shipped = JSON.stringify(RETRO_FORMATS);

describe("draftFromLibrary", () => {
  it("copies the stamp and the seed; a teamless draft has no review, a team draft does", () => {
    const teamless = draftFromLibrary(DEFAULT_RETRO_FORMAT, { hasTeam: false });
    expect(teamless.format).toEqual({ name: DEFAULT_RETRO_FORMAT.name, prompts: DEFAULT_RETRO_FORMAT.prompts });
    expect(teamless.stages.map((s) => s.kind)).toEqual(["collect", "group", "vote", "discuss", "close"]);
    const team = draftFromLibrary(findFormat("Lean Coffee")!, { hasTeam: true });
    expect(team.stages.map((s) => s.kind)).toEqual(["collect", "review", "group", "vote", "discuss", "close"]);
    expect(team.stages[0].cardsVisible).toBe("visible");
  });
});

describe("prompts", () => {
  it("renames, re-tints, adds up to ten with fresh ids and the next unused tint, and never removes the last", () => {
    let draft = draftFromLibrary(DEFAULT_RETRO_FORMAT, { hasTeam: false });
    draft = updatePrompt(draft, "went-well", { label: "What worked?", color: "teal", hint: "" });
    expect(draft.format.prompts[0]).toEqual({ id: "went-well", label: "What worked?", color: "teal", order: 0 });

    while (canAddPrompt(draft)) draft = addPrompt(draft);
    expect(draft.format.prompts).toHaveLength(10);
    expect(new Set(draft.format.prompts.map((p) => p.id)).size).toBe(10);
    expect(draft.format.prompts.map((p) => p.order)).toEqual([...Array(10).keys()]);
    expect(draft.format.prompts[3].color).toBe("red");
    expect(addPrompt(draft)).toBe(draft);

    for (const prompt of draft.format.prompts.slice(1)) draft = removePrompt(draft, prompt.id);
    expect(draft.format.prompts).toHaveLength(1);
    expect(removePrompt(draft, draft.format.prompts[0].id)).toBe(draft);
    expect(JSON.stringify(RETRO_FORMATS)).toBe(shipped);
  });
});

describe("stages", () => {
  const base = draftFromLibrary(DEFAULT_RETRO_FORMAT, { hasTeam: false });
  const ids = () => base.stages.map((s) => s.id);

  it("adds up to ten, at an index or the end, and flips collect's reveal policy", () => {
    let draft = addStage(base, "review", 1);
    expect(draft.stages.map((s) => s.kind)).toEqual(["collect", "review", "group", "vote", "discuss", "close"]);
    while (draft.stages.length < 10) draft = addStage(draft, "vote");
    expect(addStage(draft, "close")).toBe(draft);
    expect(setCardsVisible(base, ids()[0], "visible").stages[0].cardsVisible).toBe("visible");
  });

  it("removes any entry except the last collect or discuss", () => {
    const [collect, group, , discuss] = ids();
    expect(removeStage(base, collect)).toBe(base);
    expect(removeStage(base, discuss)).toBe(base);
    expect(removeStage(base, group).stages.map((s) => s.kind)).toEqual(["collect", "vote", "discuss", "close"]);
    const twoDiscuss = addStage(base, "discuss");
    expect(removeStage(twoDiscuss, discuss).stages.filter((s) => s.kind === "discuss")).toHaveLength(1);
  });

  it("moves a free entry past discuss, never discuss past collect nor the current entry", () => {
    const [collect, group, vote, discuss, close] = ids();
    expect(movedOrder(base.stages, close, -1)).toEqual([collect, group, vote, close, discuss]);
    expect(movedOrder(base.stages, collect, -1)).toBeNull();
    expect(movedOrder(base.stages, collect, 1)).toEqual([group, collect, vote, discuss, close]);
    const adjacent = reorderStages(base, [collect, discuss, group, vote, close]);
    expect(adjacent.stages.map((s) => s.id)).toEqual([collect, discuss, group, vote, close]);
    expect(movedOrder(adjacent.stages, collect, 1)).toBeNull();
    expect(movedOrder(adjacent.stages, discuss, -1)).toBeNull();
    expect(movedOrder(base.stages, vote, -1, group)).toBeNull();
    expect(movedOrder(base.stages, vote, -1)).toEqual([collect, vote, group, discuss, close]);
    expect(reorderStages(base, [discuss, group, vote, collect, close])).toBe(base);
    expect(reorderStages(base, [collect, vote, group, discuss]).stages).toBe(base.stages);
    expect(reorderStages(base, [collect, vote, group, discuss, close]).stages.map((s) => s.id)).toEqual([collect, vote, group, discuss, close]);
  });
});
