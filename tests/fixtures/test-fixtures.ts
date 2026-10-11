/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect, type BrowserContext } from "@playwright/test";
import { HomePage } from "../pages/home-page";

/** React's hydration errors in development: the server's HTML and the browser's first render differ. */
const HYDRATION_ERROR = /hydrat/i;

/** The hydration errors the running test's pages have hit. */
let hydrationErrors: string[] = [];

function watchForHydrationErrors(context: BrowserContext): BrowserContext {
  context.on("console", (message) => {
    if (message.type() === "error" && HYDRATION_ERROR.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  // A mismatch React can't patch ("Hydration failed…") is thrown, not logged
  context.on("weberror", (webError) => {
    const { message } = webError.error();
    if (HYDRATION_ERROR.test(message)) hydrationErrors.push(message);
  });
  return context;
}

/**
 * Playwright's `test` with this suite's fixtures. Every spec imports `test`
 * and `expect` from here (the lint holds them to it), so a test fails when
 * any page it opened hit a React hydration error: through `page`, or a
 * context of its own, as the multi-user specs open.
 */
export const test = base.extend<{ homePage: HomePage; hydrationGuard: void }>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  // Every context the worker's browser opens, the default one included
  browser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => watchForHydrationErrors(await newContext(options));
      await use(browser);
    },
    { scope: "worker" },
  ],

  hydrationGuard: [
    async ({}, use) => {
      hydrationErrors = [];
      await use();
      expect(hydrationErrors, "React hydration errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
