/**
 * Every stage kind renders an empty state, never a lock (ADR-0010): a
 * line naming the stage and explaining what is not there yet, with the
 * review line from the copy register.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StageEmptyState } from "./stage-empty-state";
import { STAGE_EMPTY, STAGE_LABELS } from "@/convex/retroCopy";
import type { StageKind } from "@/convex/model/retroFormats";

afterEach(cleanup);

const KINDS: StageKind[] = ["collect", "review", "group", "vote", "discuss", "close"];

describe("StageEmptyState", () => {
  it.each(KINDS)("%s reads its label and its line", (kind) => {
    render(<StageEmptyState kind={kind} />);
    const state = screen.getByTestId("stage-empty-state");
    expect(state.getAttribute("data-kind")).toBe(kind);
    expect(state.textContent).toContain(STAGE_LABELS[kind]);
    expect(state.textContent).toContain(STAGE_EMPTY[kind]);
    expect(state.textContent?.toLowerCase()).not.toMatch(/lock/);
  });

  it("the review line is the register's", () => {
    expect(STAGE_EMPTY.review).toBe("No open actions from earlier retros");
  });
});
