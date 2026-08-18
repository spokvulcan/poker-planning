import { test, expect } from "@playwright/test";

/**
 * The first release in CHANGELOG.md carries every pre-1.0 commit, so rendering
 * the whole history eagerly made /changelog roughly 16,500px tall. Only the
 * most recent releases stay expanded; the rest sit behind a native <details>
 * so they stay in the markup for crawlers without costing the reader anything.
 *
 * `EXPANDED_RELEASE_COUNT` in src/app/changelog/page.tsx is the contract here.
 */

const EXPANDED_RELEASE_COUNT = 10;
const DISCLOSURE = /^Show \d+ earlier releases$/;

test.describe("Changelog", () => {
  test("collapses earlier releases until the disclosure is opened", async ({
    page,
  }) => {
    await page.goto("/changelog");

    // Collapsed <details> content stays in the DOM, so count what is rendered
    // rather than what is present.
    await expect(page.locator("main article:visible")).toHaveCount(
      EXPANDED_RELEASE_COUNT,
    );

    const totalReleases = await page.locator("main article").count();
    expect(
      totalReleases,
      "changelog needs more releases than the expanded count for this to test anything",
    ).toBeGreaterThan(EXPANDED_RELEASE_COUNT);

    const disclosure = page.getByText(DISCLOSURE);
    await expect(disclosure).toBeVisible();
    await disclosure.click();

    await expect(page.locator("main article:visible")).toHaveCount(
      totalReleases,
    );
    await expect(page.getByText("Hide earlier releases")).toBeVisible();
  });

  test("keeps every release in the markup while collapsed", async ({
    page,
  }) => {
    // Crawlers do not open disclosures. The entries have to ship either way,
    // which is the whole reason this is a <details> and not a client-side
    // "load more".
    const response = await page.goto("/changelog");
    const html = (await response?.text()) ?? "";
    const releasesInMarkup = (html.match(/<article/g) ?? []).length;

    expect(releasesInMarkup).toBeGreaterThan(EXPANDED_RELEASE_COUNT);
    expect(releasesInMarkup).toBe(await page.locator("main article").count());
  });
});
