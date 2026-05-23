import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the client-side Demo simulation (ADR-0003).
 *
 * The reducer's phase machine is exhaustively unit-tested
 * (`src/components/room/demo/simulation.test.ts`) and the zero-Convex guarantee
 * is enforced by the zero-reads guard (`demo/zero-reads.test.ts`). This e2e adds
 * the missing integration link: that the synthesized room data actually flows
 * through the real `RoomCanvas` and that the provider's interval drives the
 * voting → countdown → revealed loop visibly in a browser.
 *
 * Assertions key off PlayerNode's aria-label, which is occlusion-independent:
 *   ", has not voted yet"  → not yet voted
 *   ", has voted"          → picked (hidden during voting, or revealed)
 *   ", voted <card>"       → card value shown — only after reveal
 */

const PLAYER = '[aria-label^="Player "]';
const PICKED = '[aria-label*="has voted"]'; // hidden-but-cast, or revealed
const REVEALED = '[aria-label*=", voted "]'; // value visible → reveal happened

test.describe("Demo simulation (/demo)", () => {
  test("renders the canvas client-side and runs the voting loop", async ({
    page,
  }) => {
    // A render crash in the synthesized-data path surfaces as an uncaught error.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/demo");

    // Player nodes render from local fixtures — no Convex round-trip, so the
    // canvas paints without waiting on a subscription. Asserting on the nodes
    // (rather than the .react-flow wrapper) sidesteps the dev StrictMode
    // double-mount, which transiently leaves a second, hidden wrapper in the DOM.
    await expect(page.locator(PLAYER).first()).toBeVisible();

    // The Convex "Setup Required" gate must never be what the visitor sees.
    await expect(page.getByText("Setup Required")).toHaveCount(0);

    // Synthesized room data flows through to the real components: the seeded
    // current issue and exactly the six demo bots (toHaveCount retries past the
    // double-mount until it settles).
    await expect(page.getByText("Add user authentication").first()).toBeVisible();
    await expect(page.locator(PLAYER)).toHaveCount(6);

    await page.screenshot({ path: "test-results/demo-01-initial.png" });

    // The local reducer's interval ticks: bots progressively cast (hidden) votes.
    await expect
      .poll(() => page.locator(PICKED).count(), { timeout: 25_000 })
      .toBeGreaterThan(0);

    await page.screenshot({ path: "test-results/demo-02-voting.png" });

    // The machine advances all the way through countdown to reveal, at which
    // point card values become visible on the player nodes. Reaching this state
    // proves voting → countingDown → revealed all ran end-to-end.
    await expect
      .poll(() => page.locator(REVEALED).count(), { timeout: 30_000 })
      .toBeGreaterThan(0);

    await page.screenshot({ path: "test-results/demo-03-revealed.png" });

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
