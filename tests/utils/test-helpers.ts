import { Page, Locator, expect } from "@playwright/test";

/**
 * Wait for all animations on the page to complete
 */
export async function waitForAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const animations = document.getAnimations();
    return (
      animations.length === 0 ||
      animations.every((animation) => animation.playState === "finished")
    );
  });
}

/**
 * Enhanced wait for element that ensures it's fully ready for interaction
 */
export async function waitForElement(
  page: Page,
  selector: string
): Promise<Locator> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "attached" });
  await locator.waitFor({ state: "visible" });
  return locator;
}

/**
 * Wait for navigation to room page with custom timeout
 */
export async function waitForRoomNavigation(
  page: Page,
  timeout: number = 10000
): Promise<void> {
  await page.waitForURL(/\/room\/[a-z0-9]+/, { timeout });
}

/**
 * Mock clipboard API with proper error handling.
 *
 * Also pre-sets the `analytics_consent` cookie so the consent banner (a fixed,
 * z-50 card pinned to the bottom-right) never renders during tests. Left
 * visible it can overlap the canvas / voting cards and intercept clicks.
 */
export async function mockClipboardAPI(
  page: Page,
  shouldFail: boolean = false
): Promise<void> {
  await page.context().addCookies([
    {
      name: "analytics_consent",
      value: "denied",
      url: "http://localhost:3000",
    },
  ]);

  await page.addInitScript((fail) => {
    if (fail) {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: () => Promise.reject(new Error("Clipboard access denied")),
        },
        writable: true,
        configurable: true,
      });
    } else {
      window.clipboardText = "";
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            window.clipboardText = text;
            return Promise.resolve();
          },
        },
        writable: true,
        configurable: true,
      });
    }
  }, shouldFail);
}

/**
 * Retry an action with exponential backoff
 */
export async function retryAction<T>(
  action: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, initialDelay * Math.pow(2, i))
        );
      }
    }
  }

  throw lastError;
}

/**
 * Best-effort wait for the network to settle.
 *
 * With Convex's live websocket/poll traffic "networkidle" frequently never
 * fires (especially for authenticated users), so this is a soft settle — it
 * swallows the timeout and lets the subsequent web-first assertions do the real
 * synchronization rather than failing the test here.
 */
export async function waitForNetworkIdle(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
}

/**
 * Safe click that waits for element to be ready
 */
export async function safeClick(
  locator: Locator,
  options?: { force?: boolean; timeout?: number }
): Promise<void> {
  await locator.waitFor({ state: "visible", timeout: options?.timeout });
  // Wait for element to be enabled using expect
  await expect(locator).toBeEnabled({ timeout: options?.timeout });
  await locator.click({ force: options?.force });
}
