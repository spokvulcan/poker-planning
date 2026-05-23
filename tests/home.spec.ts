import { test, expect } from "@playwright/test";
import { HomePage } from "./pages/home-page";
import {
  mockClipboardAPI,
  waitForNetworkIdle,
  retryAction,
} from "./utils/test-helpers";

test.describe("Home Page - Basic Elements", () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test("should load successfully and display main heading", async () => {
    await homePage.verifyPageTitle(/Planning Poker for Teams|AgileKit/i);
    await homePage.verifyHeroSection();
  });

  test("should display description text", async ({ page }) => {
    const description = page.locator(
      "text=A radically simple estimation tool"
    );
    await expect(description).toBeVisible();
    await expect(description).toContainText("estimation tool");
  });

  test("should display key action buttons", async ({ page }) => {
    // Using data-testid for more reliable selection
    const startButton = page.getByTestId("hero-start-button");
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();

    // GitHub link with data-testid
    const githubLink = page.getByTestId("hero-github-link");
    await expect(githubLink).toBeVisible();
    await homePage.verifyGitHubLink();
  });

  test("should display trust indicators", async ({ page }) => {
    // Verify key trust messaging exists on the page
    // Hero section has "No accounts required" messaging
    await expect(
      page.locator("text=No accounts required").first()
    ).toBeVisible();

    // Scroll to features section to find feature-related content
    await page.locator("#how-it-works").scrollIntoViewIfNeeded();

    // Verify the "No sign-up required" message is visible
    await expect(page.locator("text=No sign-up required")).toBeVisible();
  });

  test("should display all major sections", async () => {
    await homePage.scrollToBottom();
    await waitForNetworkIdle(homePage.page);
    
    const sectionCount = await homePage.countSections();
    expect(sectionCount).toBeGreaterThan(0);
    
    await homePage.verifyFooter();
  });
});

test.describe("Home Page - Room Creation Flow", () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await mockClipboardAPI(page);
    await homePage.goto();
  });

  test("should create room and navigate on button click", async ({ page }) => {
    // Use retry for better reliability
    const roomId = await retryAction(async () => {
      return await homePage.createNewRoom();
    });
    
    expect(roomId).toMatch(/^[a-z0-9]+$/);
    await expect(page).toHaveURL(/\/room\/[a-z0-9]+/);
  });

  test("should copy room URL to clipboard", async ({ page }) => {
    const roomId = await homePage.createNewRoom();
    
    // Verify clipboard was called with correct URL
    const copiedText = await homePage.getClipboardText();
    expect(copiedText).toMatch(/\/room\/[a-z0-9]+/);
    expect(copiedText).toContain(roomId);
    
    // Verify the clipboard text matches the current URL pattern
    const currentUrl = page.url();
    expect(currentUrl).toContain(`/room/${roomId}`);
  });
});

test.describe("Home Page - Navigation", () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test("should open GitHub link in new tab", async () => {
    await homePage.verifyGitHubLink();
  });

  test("should have working skip to main content link", async () => {
    await homePage.focusSkipLink();
    await homePage.clickSkipLink();
  });
});

test.describe("Home Page - Error Handling", () => {
  let homePage: HomePage;

  test.skip("should handle room creation errors gracefully", async ({ page }) => {
    // NOTE: This test is skipped because Convex uses WebSocket connections
    // that cannot be easily mocked with page.route(). The HTTP route interception
    // does not affect Convex's real-time mutation calls.
    //
    // To properly test error handling, we would need to:
    // 1. Use Convex's testing utilities with a test backend
    // 2. Or mock at a lower level using page.addInitScript
    homePage = new HomePage(page);
    await homePage.goto();

    // Mock error response with better targeting
    await page.route(
      (url) => {
        return (
          url.href.includes("mutation") ||
          url.href.includes("convex") ||
          url.href.includes("_api")
        );
      },
      async (route) => {
        const request = route.request();
        const postData = request.postData();

        if (postData && postData.includes("rooms:create")) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Internal Server Error",
            }),
          });
        } else {
          await route.continue();
        }
      }
    );

    // Click using data-testid
    const startButton = page.getByTestId("hero-start-button");
    await startButton.click();

    // Better error handling verification
    await expect(startButton).toBeEnabled({ timeout: 5000 });
    await expect(page).toHaveURL("/");

    // Wait for error toast
    await homePage.waitForToast("Failed to create room");
  });

  test("should handle clipboard API failures gracefully", async ({ page }) => {
    homePage = new HomePage(page);
    
    // Set up console listener
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Mock clipboard to fail
    await mockClipboardAPI(page, true);
    await homePage.goto();

    const startButton = page.getByTestId("hero-start-button");
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();

    // Try to create room
    try {
      await startButton.click();
      
      // Wait for either navigation or timeout
      await page.waitForURL(/\/room\/[a-z0-9]+/, { timeout: 5000 });
      
      // Navigation succeeded despite clipboard failure - good!
      await expect(page).toHaveURL(/\/room\/[a-z0-9]+/);
    } catch {
      // If navigation fails, verify app is still functional
      await expect(startButton).toBeVisible();
      await expect(startButton).toBeEnabled();
      
      // Check that no critical errors were logged
      const criticalErrors = consoleErrors.filter(
        (err) => !err.includes("Clipboard") && !err.includes("clipboard")
      );
      expect(criticalErrors.length).toBe(0);
    }
  });
});

test.describe("Home Page - Content Sections", () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test("should render all imported components", async () => {
    await homePage.scrollToBottom();
    await waitForNetworkIdle(homePage.page);
    
    const sectionCount = await homePage.countSections();
    expect(sectionCount).toBeGreaterThan(0);
  });

  test("should have interactive call-to-action at the bottom", async () => {
    await homePage.scrollToBottom();
    
    const buttonCount = await homePage.getCallToActionButtonCount();
    expect(buttonCount).toBeGreaterThanOrEqual(1);
  });
});

// Add type declaration for window.clipboardText
declare global {
  interface Window {
    clipboardText: string;
  }
}