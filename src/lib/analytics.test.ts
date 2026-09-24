/**
 * Conversions reach Google Analytics only when it is running, which is only
 * with the visitor's consent.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const { sendGAEvent } = vi.hoisted(() => ({ sendGAEvent: vi.fn() }));
vi.mock("@next/third-parties/google", () => ({ sendGAEvent }));

import { trackConversion, trackGifEvent } from "./analytics";

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

describe("trackGifEvent", () => {
  it("sends the GIF event, with where a pick came from, when Google Analytics is running", () => {
    vi.stubGlobal("window", { dataLayer: [] });
    trackGifEvent("gif_pick", { source: "link" });
    trackGifEvent("gif_search_limited");
    expect(sendGAEvent).toHaveBeenNthCalledWith(1, "event", "gif_pick", { source: "link" });
    expect(sendGAEvent).toHaveBeenNthCalledWith(2, "event", "gif_search_limited", {});
  });

  it("drops it without consent", () => {
    vi.stubGlobal("window", {});
    trackGifEvent("gif_search");
    expect(sendGAEvent).not.toHaveBeenCalled();
  });
});
