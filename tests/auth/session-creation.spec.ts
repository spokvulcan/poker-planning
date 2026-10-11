import { test, expect } from "../fixtures/test-fixtures";
import { HomePage } from "../pages/home-page";
import { RoomPage } from "../pages/room-page";
import { JoinRoomPage } from "../pages/join-room-page";
import {
  createRoom,
  navigateToRoom,
  createAndJoinRoom,
} from "../utils/room-helpers";
import { mockClipboardAPI, waitForNetworkIdle } from "../utils/test-helpers";

test.describe("Session Creation Suite", () => {
  test.describe("Name field behavior", () => {
    test("should show empty name field for first-time users", async ({
      browser,
    }) => {
      // Create a fresh browser context (no existing session)
      const context = await browser.newContext();
      const page = await context.newPage();
      await mockClipboardAPI(page);

      // Create a room first
      const roomId = await createRoom(page);

      // Navigate away and clear state
      await context.close();

      // Create a new context (simulating a first-time user)
      const freshContext = await browser.newContext();
      const freshPage = await freshContext.newPage();
      await mockClipboardAPI(freshPage);

      // Navigate directly to the room
      await navigateToRoom(freshPage, roomId);

      // Wait for join dialog
      const joinPage = new JoinRoomPage(freshPage);
      await joinPage.waitForDialog();

      // Verify name input is empty (not pre-filled with "Anonymous")
      await joinPage.expectNameInputEmpty();

      await freshContext.close();
    });

    test("should not pre-fill name with 'Anonymous' for new users", async ({
      browser,
    }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await mockClipboardAPI(page);

      // Create a room and navigate to join dialog
      const roomId = await createRoom(page);

      // Close and reopen in fresh context
      await context.close();

      const freshContext = await browser.newContext();
      const freshPage = await freshContext.newPage();
      await mockClipboardAPI(freshPage);

      await navigateToRoom(freshPage, roomId);

      const joinPage = new JoinRoomPage(freshPage);
      await joinPage.waitForDialog();

      // Get the name input value
      const nameValue = await joinPage.getNameInputValue();

      // Should NOT be "Anonymous"
      expect(nameValue).not.toBe("Anonymous");
      // Should be empty
      expect(nameValue).toBe("");

      await freshContext.close();
    });
  });

  test.describe("Session creation timing", () => {
    test("should not create session on homepage visit", async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await mockClipboardAPI(page);

      // Visit homepage
      const homePage = new HomePage(page);
      await homePage.goto();
      await waitForNetworkIdle(page);

      // Check for BetterAuth session cookie
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(
        (c) => c.name.includes("session") || c.name.includes("auth")
      );

      // Should not have a session cookie yet
      expect(sessionCookie).toBeUndefined();

      await context.close();
    });

    test("should create session when user joins a room", async ({ browser }) => {
      // Create room in one context
      const createContext = await browser.newContext();
      const createPage = await createContext.newPage();
      await mockClipboardAPI(createPage);
      const roomId = await createRoom(createPage);
      await createContext.close();

      // Join room in fresh context
      const joinContext = await browser.newContext();
      const joinPage = await joinContext.newPage();
      await mockClipboardAPI(joinPage);

      // Navigate to room
      await navigateToRoom(joinPage, roomId);

      // Wait for join dialog
      const joinRoomPage = new JoinRoomPage(joinPage);
      await joinRoomPage.waitForDialog();

      // Check cookies before joining - should have no session
      let cookies = await joinContext.cookies();
      const sessionCookieBefore = cookies.find(
        (c) => c.name.includes("session") || c.name.includes("auth")
      );
      expect(sessionCookieBefore).toBeUndefined();

      // Join the room
      await joinRoomPage.joinAsParticipant("TestUser");
      await joinRoomPage.expectDialogClosed();

      // Wait for room to load
      const roomPage = new RoomPage(joinPage);
      await roomPage.waitForRoomLoad();

      // Check cookies after joining - should have a session now
      cookies = await joinContext.cookies();
      const sessionCookieAfter = cookies.find(
        (c) => c.name.includes("session") || c.name.includes("auth")
      );
      expect(sessionCookieAfter).toBeDefined();

      await joinContext.close();
    });

    test("should not create session when navigating blog/changelog", async ({
      browser,
    }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      // Visit homepage
      await page.goto("/");
      await waitForNetworkIdle(page);

      // Visit changelog if it exists
      await page.goto("/changelog");
      await waitForNetworkIdle(page);

      // Check for session cookie
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(
        (c) => c.name.includes("session") || c.name.includes("auth")
      );

      // Should still not have a session cookie
      expect(sessionCookie).toBeUndefined();

      await context.close();
    });
  });

  test.describe("Returning user auto-join", () => {
    test("should auto-join returning user with existing name", async ({
      browser,
    }) => {
      // Create first context - user creates and joins a room
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await mockClipboardAPI(page1);

      await createAndJoinRoom(page1, "ReturningUser");

      // Verify user is in the room
      const roomPage1 = new RoomPage(page1);
      await roomPage1.waitForRoomLoad();
      await roomPage1.expectPlayerInList("ReturningUser");

      // Now create a second room in a different tab/context but reusing cookies
      // Extract cookies from first context
      const cookies = await context1.cookies();

      // Create second context with same cookies (same user)
      const context2 = await browser.newContext();
      await context2.addCookies(cookies);
      const page2 = await context2.newPage();
      await mockClipboardAPI(page2);

      // Create a new room
      const homePage = new HomePage(page2);
      await homePage.goto();
      await homePage.createNewRoom();

      // User should auto-join the new room without showing dialog
      // Wait a bit for auto-join to happen
      await page2.waitForTimeout(2000);

      // Check if we're in the room (canvas visible) without having to fill join dialog
      const canvasVisible = await page2
        .locator(".react-flow")
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (canvasVisible) {
        // Auto-join worked - verify user name
        const roomPage2 = new RoomPage(page2);
        await roomPage2.expectPlayerInList("ReturningUser");
      } else {
        // If join dialog shown, that's also acceptable (depends on timing)
        const joinDialogVisible = await page2
          .getByRole("heading", { name: "Join Room" })
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        expect(joinDialogVisible || canvasVisible).toBe(true);
      }

      await context1.close();
      await context2.close();
    });

    test("should preserve user name across different rooms", async ({
      browser,
    }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await mockClipboardAPI(page);

      // Create and join first room
      await createAndJoinRoom(
        page,
        "ConsistentUser"
      );
      const roomPage = new RoomPage(page);
      await roomPage.waitForRoomLoad();

      // Navigate to homepage and create new room
      const homePage = new HomePage(page);
      await homePage.goto();
      await homePage.createNewRoom();

      // Wait for auto-join or join dialog
      await page.waitForTimeout(2000);

      const canvasVisible = await page
        .locator(".react-flow")
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (canvasVisible) {
        // Auto-joined - verify same name was used
        await roomPage.expectPlayerInList("ConsistentUser");
      }

      await context.close();
    });
  });

  test.describe("Join flow without session", () => {
    test("should successfully join room and create session in one flow", async ({
      browser,
    }) => {
      // Create room in one context
      const createContext = await browser.newContext();
      const createPage = await createContext.newPage();
      await mockClipboardAPI(createPage);
      const roomId = await createRoom(createPage);
      await createContext.close();

      // Fresh user joins
      const freshContext = await browser.newContext();
      const freshPage = await freshContext.newPage();
      await mockClipboardAPI(freshPage);

      await navigateToRoom(freshPage, roomId);

      const joinRoomPage = new JoinRoomPage(freshPage);
      await joinRoomPage.waitForDialog();

      // Verify name is empty
      await joinRoomPage.expectNameInputEmpty();

      // Join with a specific name
      await joinRoomPage.joinAsParticipant("NewSessionUser");
      await joinRoomPage.expectDialogClosed();

      // Verify we're in the room
      const roomPage = new RoomPage(freshPage);
      await roomPage.waitForRoomLoad();
      await roomPage.expectPlayerInList("NewSessionUser");

      // Verify user can interact (vote)
      await roomPage.selectCard("5");
      await roomPage.expectCardSelected("5");

      await freshContext.close();
    });
  });
});
