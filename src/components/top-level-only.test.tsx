import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TopLevelOnly } from "./top-level-only";

/**
 * The server-side half of the framed-chrome fix (`isEmbeddedDocument()`) is
 * covered end to end in tests/embedded-chrome.spec.ts. This covers the client
 * fallback that takes over when `Sec-Fetch-Dest` never arrives, which an e2e
 * cannot reach: intercepting the framed request to strip the header also
 * breaks that document's hydration, so the fallback never gets to run.
 */

function frameTheWindow() {
  // window.self !== window.top is what "inside a frame" reduces to. jsdom makes
  // both the same object, so stand in a different one for `top`.
  Object.defineProperty(window, "top", {
    value: { name: "some-other-window" },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "top", {
    value: window,
    configurable: true,
    writable: true,
  });
});

describe("TopLevelOnly", () => {
  it("renders children in a top-level document", () => {
    render(
      <TopLevelOnly>
        <p>analytics consent</p>
      </TopLevelOnly>,
    );

    expect(screen.getByText("analytics consent")).toBeTruthy();
  });

  it("renders nothing once it sees it is framed", () => {
    frameTheWindow();

    render(
      <TopLevelOnly>
        <p>analytics consent</p>
      </TopLevelOnly>,
    );

    expect(screen.queryByText("analytics consent")).toBeNull();
  });
});
