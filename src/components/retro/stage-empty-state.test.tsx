/**
 * Every card stage renders an empty state, never a lock (ADR-0010): a line
 * naming the stage and explaining what is not there yet. Review and close
 * speak through their panels (spec §13).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StageEmptyState, emptyStageOf } from "./stage-empty-state";
import { STAGE_EMPTY, STAGE_LABELS, type CardStageKind } from "@/convex/retroCopy";

afterEach(cleanup);

const KINDS: CardStageKind[] = ["collect", "group", "vote", "discuss"];

describe("StageEmptyState", () => {
  it.each(KINDS)("%s reads its label and its line", (kind) => {
    render(<StageEmptyState kind={kind} />);
    const state = screen.getByTestId("stage-empty-state");
    expect(state.getAttribute("data-kind")).toBe(kind);
    expect(state.textContent).toContain(STAGE_LABELS[kind]);
    expect(state.textContent).toContain(STAGE_EMPTY[kind]);
    expect(state.textContent?.toLowerCase()).not.toMatch(/lock/);
  });

  it("a card stage is empty only with no cards; review and close speak through their panels (spec §7, §13)", () => {
    expect(emptyStageOf("collect", 0)).toBe("collect");
    expect(emptyStageOf("collect", 1)).toBeUndefined();
    expect(emptyStageOf("group", 2)).toBeUndefined();
    expect(emptyStageOf("review", 0)).toBeUndefined();
    expect(emptyStageOf("close", 0)).toBeUndefined();
  });
});
