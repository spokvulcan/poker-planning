import { test, expect } from "../fixtures/test-fixtures";
import { RoomPage } from "../pages/room-page";
import { createAndJoinRoom } from "../utils/room-helpers";
import { mockClipboardAPI } from "../utils/test-helpers";

test.describe("Page Refresh Flicker", () => {
  test("should not show JoinRoomDialog when refreshing as a room member", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockClipboardAPI(page);

    // Create and join room
    await createAndJoinRoom(page, "RefreshTestUser");
    const roomPage = new RoomPage(page);
    await roomPage.waitForRoomLoad();
    await roomPage.expectPlayerInList("RefreshTestUser");

    // Add init script that will run before any other scripts on page load
    // This sets up tracking for the join dialog appearance
    await context.addInitScript(() => {
      (window as unknown as { joinDialogAppeared: boolean }).joinDialogAppeared = false;
      (window as unknown as { observerSetup: boolean }).observerSetup = false;

      // Set up observer as soon as body exists
      const setupObserver = () => {
        if ((window as unknown as { observerSetup: boolean }).observerSetup) return;
        if (!document.body) {
          requestAnimationFrame(setupObserver);
          return;
        }

        (window as unknown as { observerSetup: boolean }).observerSetup = true;

        const observer = new MutationObserver(() => {
          // Check for join dialog heading
          const headings = document.querySelectorAll("h2");
          for (const h of headings) {
            if (h.textContent?.includes("Join Room")) {
              (window as unknown as { joinDialogAppeared: boolean }).joinDialogAppeared = true;
              console.log("[FLICKER-TEST] Join dialog detected!");
            }
          }
          // Check for join dialog container class
          const joinDialog = document.querySelector(".max-w-md.w-full.space-y-6.bg-card");
          if (joinDialog) {
            (window as unknown as { joinDialogAppeared: boolean }).joinDialogAppeared = true;
            console.log("[FLICKER-TEST] Join dialog container detected!");
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        // Also check immediately
        const headings = document.querySelectorAll("h2");
        for (const h of headings) {
          if (h.textContent?.includes("Join Room")) {
            (window as unknown as { joinDialogAppeared: boolean }).joinDialogAppeared = true;
          }
        }
      };

      if (document.body) {
        setupObserver();
      } else {
        document.addEventListener("DOMContentLoaded", setupObserver);
      }
    });

    // Refresh the page
    await page.reload();

    // Wait for room canvas to be visible (successful load)
    await roomPage.waitForRoomLoad();
    await roomPage.expectPlayerInList("RefreshTestUser");

    // Give a moment for any async renders to complete
    await page.waitForTimeout(1000);

    // Check if the join dialog ever appeared
    const joinDialogAppeared = await page.evaluate(() => {
      return (window as unknown as { joinDialogAppeared: boolean }).joinDialogAppeared;
    });

    // The join dialog should NEVER have appeared
    expect(joinDialogAppeared).toBe(false);

    await context.close();
  });

  test("should transition smoothly from loading to room canvas on refresh", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockClipboardAPI(page);

    // Create and join room
    await createAndJoinRoom(page, "SmoothRefreshUser");
    const roomPage = new RoomPage(page);
    await roomPage.waitForRoomLoad();

    // Track all visible states during refresh
    const states: string[] = [];

    // Reload and watch for state changes
    await page.reload();

    // Poll for visible elements during load
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      const state = await page.evaluate(() => {
        const joinDialog = document.querySelector(".max-w-md.w-full.space-y-6.bg-card");
        const joinHeading = document.querySelector("h2");
        const canvas = document.querySelector(".react-flow");
        const loadingText = document.body.textContent?.includes("Loading...");

        if (joinDialog || joinHeading?.textContent?.includes("Join Room")) {
          return "join-dialog";
        }
        if (canvas) {
          return "canvas";
        }
        if (loadingText) {
          return "loading";
        }
        return "unknown";
      });

      if (states[states.length - 1] !== state) {
        states.push(state);
      }

      if (state === "canvas") {
        break;
      }

      await page.waitForTimeout(50);
    }

    // Valid transitions: loading -> canvas, or just canvas
    // Invalid: any state -> join-dialog -> canvas
    const hasJoinDialog = states.includes("join-dialog");

    // Log states for debugging
    console.log("State transitions:", states);

    expect(hasJoinDialog).toBe(false);

    await context.close();
  });
});
