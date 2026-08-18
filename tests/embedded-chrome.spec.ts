import { test, expect } from "@playwright/test";

/**
 * The marketing hero embeds `/demo?embed=true` in an iframe, and that framed
 * document renders the same root layout as the page hosting it. Anything the
 * layout renders globally therefore renders twice on one screen unless it is
 * explicitly dropped from framed documents.
 *
 * That regressed once already: the analytics consent banner painted a second
 * copy on top of the homepage, and a granted visit reported itself twice.
 *
 * This pins the server-side `Sec-Fetch-Dest` check in `src/lib/embed.ts`. The
 * `<TopLevelOnly>` client fallback is not reachable from here: stripping the
 * header means intercepting the framed request, and fulfilling it from the
 * interceptor stops that document hydrating, so the fallback never runs and
 * the test would pass for the wrong reason. It is covered in
 * src/components/top-level-only.test.tsx instead.
 */

const DEMO_IFRAME = 'iframe[title="Live Planning Poker Demo"]';
const CONSENT_HEADING = "Analytics consent";

test.describe("Framed demo renders no global chrome", () => {
  test("shows the consent banner once, never inside the demo iframe", async ({
    page,
  }) => {
    // A fresh context carries no analytics_consent cookie, so the banner is
    // supposed to be showing — otherwise this asserts nothing.
    await page.goto("/");

    await expect(page.getByText(CONSENT_HEADING, { exact: true })).toHaveCount(
      1,
    );

    const demo = page.frameLocator(DEMO_IFRAME);
    await expect(demo.getByText(CONSENT_HEADING, { exact: true })).toHaveCount(
      0,
    );
  });
});
