/**
 * Conversions reach Google Analytics only when it is running, which is only
 * with the visitor's consent.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const { sendGAEvent } = vi.hoisted(() => ({ sendGAEvent: vi.fn() }));
vi.mock("@next/third-parties/google", () => ({ sendGAEvent }));

import { trackConversion } from "./analytics";

afterEach(() => {
  vi.unstubAllGlobals();
  sendGAEvent.mockClear();
});

describe("trackConversion", () => {
  it("sends the conversion as a named event when Google Analytics is running", () => {
    vi.stubGlobal("window", { dataLayer: [] });
    trackConversion("create_poker_room");
    expect(sendGAEvent).toHaveBeenCalledWith("event", "create_poker_room");
  });

  it("drops the conversion without consent, when there is no data layer", () => {
    vi.stubGlobal("window", {});
    trackConversion("create_retro");
    expect(sendGAEvent).not.toHaveBeenCalled();
  });

  it("does nothing on the server", () => {
    trackConversion("create_retro");
    expect(sendGAEvent).not.toHaveBeenCalled();
  });
});
