/**
 * The format library (ADR-0021, spec §6.2) as the client reads it: six
 * formats, positive-first, no complaining-cycle opening. Runs in the node
 * project so the constants stay importable without a Convex runtime.
 */
import { describe, it, expect } from "vitest";
import {
  RETRO_FORMATS,
  DEFAULT_RETRO_FORMAT,
  RETRO_TINTS,
} from "@/convex/model/retroFormats";

const FORBIDDEN = ["badly", "wrong", "didn't"];

describe("the retro format library", () => {
  it("ships six formats with Went well, Do differently, Ideas as the default", () => {
    expect(RETRO_FORMATS.map((f) => f.name)).toEqual([
      "Went well, Do differently, Ideas",
      "Start, Stop, Continue",
      "Glad, Sad, Mad",
      "4Ls",
      "Sailboat",
      "Lean Coffee",
    ]);
    expect(DEFAULT_RETRO_FORMAT).toBe(RETRO_FORMATS[0]);
  });

  it("no shipped label or hint contains badly, wrong or didn't", () => {
    for (const format of RETRO_FORMATS) {
      for (const prompt of format.prompts) {
        for (const word of FORBIDDEN) {
          expect(prompt.label.toLowerCase()).not.toContain(word);
          expect((prompt.hint ?? "").toLowerCase()).not.toContain(word);
        }
      }
    }
  });

  it("orders prompts positive-first with the spec's labels", () => {
    const labels = Object.fromEntries(
      RETRO_FORMATS.map((f) => [f.name, f.prompts.map((p) => p.label)])
    );
    expect(labels["Went well, Do differently, Ideas"]).toEqual([
      "What went well?",
      "What should we do differently?",
      "Ideas",
    ]);
    expect(labels["Start, Stop, Continue"]).toEqual(["Continue", "Start", "Stop"]);
    expect(labels["Glad, Sad, Mad"]).toEqual(["Glad", "Sad", "Mad"]);
    expect(labels["4Ls"]).toEqual(["Liked", "Learned", "Lacked", "Longed for"]);
    expect(labels["Sailboat"]).toEqual(["Wind", "Island", "Anchors", "Rocks"]);
    expect(labels["Lean Coffee"]).toEqual(["Topics"]);
  });

  it("every prompt has a hint, a stable id, an ascending order and a palette tint", () => {
    for (const format of RETRO_FORMATS) {
      format.prompts.forEach((prompt, i) => {
        expect(prompt.hint).toBeTruthy();
        expect(prompt.id).toBeTruthy();
        expect(prompt.order).toBe(i);
        expect(RETRO_TINTS).toContain(prompt.color);
      });
      expect(new Set(format.prompts.map((p) => p.id)).size).toBe(format.prompts.length);
    }
    expect(RETRO_TINTS).toHaveLength(8);
  });

});
