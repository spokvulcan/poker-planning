import { test, expect } from "@playwright/test";
import { SettingsPanelPage } from "../pages/settings-panel-page";
import { JoinRoomPage } from "../pages/join-room-page";
import {
  createAndJoinRoom,
  createMultipleUsers,
  cleanupUsers,
  joinExistingRoom,
  generateTestRoomName,
} from "../utils/room-helpers";
import { mockClipboardAPI } from "../utils/test-helpers";

test.describe("Room Settings Panel", () => {
  test.describe("Panel interactions", () => {
    test("should open settings panel when clicking gear icon", async ({
      page,
    }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();

      expect(await settingsPanel.isOpen()).toBe(true);
    });

    test("should close panel when clicking X button", async ({ page }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();
      await settingsPanel.closeSettings();

      expect(await settingsPanel.isOpen()).toBe(false);
    });

    test("should close panel when pressing Escape", async ({ page }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();
      await settingsPanel.closeByEscape();

      expect(await settingsPanel.isOpen()).toBe(false);
    });

    test("should toggle gear button aria-expanded when panel is open", async ({
      page,
    }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);

      // Check aria-expanded is false initially
      await expect(settingsPanel.settingsButton).toHaveAttribute(
        "aria-expanded",
        "false"
      );

      // Open settings
      await settingsPanel.openSettings();

      // Button should have aria-expanded true when panel is open
      await expect(settingsPanel.settingsButton).toHaveAttribute(
        "aria-expanded",
        "true"
      );

      // Close and verify aria-expanded is false again
      await settingsPanel.closeSettings();
      await expect(settingsPanel.settingsButton).toHaveAttribute(
        "aria-expanded",
        "false"
      );
    });
  });

  test.describe("Room rename", () => {
    test("should display current room name in input", async ({ page }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();

      const roomName = await settingsPanel.getRoomName();
      // Default room name should not be empty
      expect(roomName.length).toBeGreaterThan(0);
    });

    test("should rename room and see update in header", async ({ page }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();

      const newName = generateTestRoomName("Renamed Room");
      await settingsPanel.renameRoom(newName);

      // Verify the name is updated in the header
      await roomPage.expectRoomNameInHeader(newName);
    });

    test("should disable save button when name unchanged", async ({ page }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();

      // Save button should be disabled when name hasn't changed
      expect(await settingsPanel.isSaveButtonDisabled()).toBe(true);
    });

    test("should rename room with Enter key", async ({ page }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();

      const newName = generateTestRoomName("Enter Key Room");
      await settingsPanel.renameRoomWithEnter(newName);

      // Verify the name is updated in the header
      await roomPage.expectRoomNameInHeader(newName);
    });

    test("should sync renamed room across multiple users", async ({
      browser,
    }) => {
      const users = await createMultipleUsers(browser, 2);
      const [user1, user2] = users;

      try {
        const settingsPanel1 = new SettingsPanelPage(user1.page);
        await settingsPanel1.openSettings();

        const newName = generateTestRoomName("Synced Room");
        await settingsPanel1.renameRoom(newName);

        // Both users should see the new name
        await user1.roomPage.expectRoomNameInHeader(newName);
        await user2.roomPage.expectRoomNameInHeader(newName);
      } finally {
        await cleanupUsers(users);
      }
    });
  });

  test.describe("User management", () => {
    test("should display other participants in list", async ({ browser }) => {
      const users = await createMultipleUsers(browser, 2);
      const [user1, user2] = users;

      try {
        const settingsPanel1 = new SettingsPanelPage(user1.page);
        await settingsPanel1.openSettings();

        // User1 should see User2 in the list
        await settingsPanel1.expectUserInList(user2.name);
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should not show current user in removal list", async ({ page }) => {
      await mockClipboardAPI(page);
      const userName = "TestUser";
      const { roomPage } = await createAndJoinRoom(page, userName);
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();

      // Current user should not be in the list
      await settingsPanel.expectNoOtherParticipants();
    });

    test("should remove user when clicking remove button", async ({
      browser,
    }) => {
      const users = await createMultipleUsers(browser, 2);
      const [user1, user2] = users;

      try {
        const settingsPanel1 = new SettingsPanelPage(user1.page);
        await settingsPanel1.openSettings();

        // Remove User2
        await settingsPanel1.removeUser(user2.name);

        // User2 should no longer be in the list
        await settingsPanel1.expectNoOtherParticipants();

        // User2 should see the join dialog (they were kicked)
        await expect(
          user2.page.getByRole("heading", { name: "Join Room" })
        ).toBeVisible();
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should allow removed user to rejoin room", async ({ browser }) => {
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await mockClipboardAPI(page1);

      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await mockClipboardAPI(page2);

      try {
        // User1 creates room
        const { roomId, roomPage: roomPage1 } = await createAndJoinRoom(
          page1,
          "User1"
        );
        await roomPage1.waitForRoomLoad();

        // User2 joins
        await joinExistingRoom(page2, roomId, "User2");

        // User1 removes User2
        const settingsPanel1 = new SettingsPanelPage(page1);
        await settingsPanel1.openSettings();
        await settingsPanel1.removeUser("User2");

        // User2 should see join dialog
        await expect(
          page2.getByRole("heading", { name: "Join Room" })
        ).toBeVisible();

        // User2 rejoins
        const joinPage2 = new JoinRoomPage(page2);
        await joinPage2.joinAsParticipant("User2Rejoined");

        // User2 should be back in the room
        await expect(page2.locator(".react-flow")).toBeVisible();

        // User1 should see User2Rejoined
        await roomPage1.expectPlayerInList("User2Rejoined");
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test("should update participant count after removal", async ({
      browser,
    }) => {
      const users = await createMultipleUsers(browser, 2);
      const [user1, user2] = users;

      try {
        // Initially should show 2 users
        await user1.roomPage.expectParticipantCount(2);

        const settingsPanel1 = new SettingsPanelPage(user1.page);
        await settingsPanel1.openSettings();

        // Remove User2
        await settingsPanel1.removeUser(user2.name);

        // Close and check count
        await settingsPanel1.closeSettings();
        await user1.roomPage.expectParticipantCount(1);
      } finally {
        await cleanupUsers(users);
      }
    });
  });

  test.describe("Auto-reveal toggle", () => {
    test("should toggle auto-reveal setting", async ({ page }) => {
      await mockClipboardAPI(page);
      const { roomPage } = await createAndJoinRoom(page, "TestUser");
      await roomPage.waitForRoomLoad();

      const settingsPanel = new SettingsPanelPage(page);
      await settingsPanel.openSettings();

      // Get initial state
      const initialState = await settingsPanel.isAutoRevealEnabled();

      // Toggle
      await settingsPanel.toggleAutoReveal();

      // Should be opposite now
      expect(await settingsPanel.isAutoRevealEnabled()).toBe(!initialState);

      // Toggle again
      await settingsPanel.toggleAutoReveal();

      // Should be back to initial
      expect(await settingsPanel.isAutoRevealEnabled()).toBe(initialState);
    });

    test("should sync auto-reveal across users", async ({ browser }) => {
      const users = await createMultipleUsers(browser, 2);
      const [user1, user2] = users;

      try {
        const settingsPanel1 = new SettingsPanelPage(user1.page);
        const settingsPanel2 = new SettingsPanelPage(user2.page);

        await settingsPanel1.openSettings();

        // Toggle auto-reveal on User1
        const initialState = await settingsPanel1.isAutoRevealEnabled();
        await settingsPanel1.toggleAutoReveal();

        // User2 opens settings and should see the updated state
        await settingsPanel2.openSettings();
        expect(await settingsPanel2.isAutoRevealEnabled()).toBe(!initialState);
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should trigger countdown when all vote with auto-reveal on", async ({
      browser,
    }) => {
      // Create 2 participant users (not spectator)
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await mockClipboardAPI(page1);

      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await mockClipboardAPI(page2);

      try {
        // User1 creates room
        const { roomId, roomPage: roomPage1 } = await createAndJoinRoom(
          page1,
          "User1",
          "participant"
        );
        await roomPage1.waitForRoomLoad();

        // User2 joins as participant
        const { roomPage: roomPage2 } = await joinExistingRoom(
          page2,
          roomId,
          "User2",
          "participant"
        );

        // Enable auto-reveal
        const settingsPanel1 = new SettingsPanelPage(page1);
        await settingsPanel1.openSettings();

        if (!(await settingsPanel1.isAutoRevealEnabled())) {
          await settingsPanel1.toggleAutoReveal();
        }
        await settingsPanel1.closeSettings();

        // Both users vote
        await roomPage1.selectCard("5");
        await roomPage2.selectCard("8");

        // Countdown should appear
        await roomPage1.expectAutoRevealCountdown();
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test("should not trigger countdown with auto-reveal off", async ({
      browser,
    }) => {
      // Create 2 participant users
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await mockClipboardAPI(page1);

      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await mockClipboardAPI(page2);

      try {
        // User1 creates room
        const { roomId, roomPage: roomPage1 } = await createAndJoinRoom(
          page1,
          "User1",
          "participant"
        );
        await roomPage1.waitForRoomLoad();

        // User2 joins as participant
        const { roomPage: roomPage2 } = await joinExistingRoom(
          page2,
          roomId,
          "User2",
          "participant"
        );

        // Ensure auto-reveal is OFF
        const settingsPanel1 = new SettingsPanelPage(page1);
        await settingsPanel1.openSettings();

        if (await settingsPanel1.isAutoRevealEnabled()) {
          await settingsPanel1.toggleAutoReveal();
        }
        await settingsPanel1.closeSettings();

        // Both users vote
        await roomPage1.selectCard("5");
        await roomPage2.selectCard("8");

        // Wait a bit and verify no countdown
        await page1.waitForTimeout(1000);
        await roomPage1.expectNoAutoRevealCountdown();
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });
});
