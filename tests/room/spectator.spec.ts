import { test, expect } from "@playwright/test";
import { RoomPage } from "../pages/room-page";
import { JoinRoomPage } from "../pages/join-room-page";
import {
  navigateToRoom,
  createAndJoinRoom,
} from "../utils/room-helpers";
import { mockClipboardAPI } from "../utils/test-helpers";

test.describe("Spectator Feature", () => {
  test.describe("Join as spectator", () => {
    test("should not show voting cards when joining as spectator", async ({
      page,
    }) => {
      await mockClipboardAPI(page);

      // Create a room and become a spectator (auto-joined as a guest
      // participant, renamed, then switched to spectator mode).
      const { roomPage } = await createAndJoinRoom(
        page,
        "Spectator User",
        "spectator"
      );

      // Verify voting cards are not visible
      await roomPage.expectVotingCardsNotVisible();

      // Verify player node is still visible
      await roomPage.expectPlayerInList("Spectator User");
    });

    test("should show voting cards when joining as participant", async ({
      page,
    }) => {
      await mockClipboardAPI(page);

      // Create and join as participant
      const { roomPage } = await createAndJoinRoom(page, "Participant User");

      // Verify voting cards are visible
      await roomPage.expectVotingCardsVisible();
      const cardCount = await roomPage.getVotingCardsCount();
      expect(cardCount).toBeGreaterThan(0);
    });
  });

  test.describe("Toggle spectator mode via UserMenu", () => {
    test("should remove voting cards when toggling to spectator mode", async ({
      page,
    }) => {
      await mockClipboardAPI(page);

      // Create and join as participant
      const { roomPage } = await createAndJoinRoom(page, "Toggle User");

      // Verify voting cards are initially visible
      await roomPage.expectVotingCardsVisible();

      // Toggle to spectator mode
      await roomPage.toggleSpectatorMode();

      // Wait for cards to be removed
      await page.waitForTimeout(500);

      // Verify voting cards are no longer visible
      await roomPage.expectVotingCardsNotVisible();
    });

    test("should restore voting cards when toggling back to participant", async ({
      page,
    }) => {
      await mockClipboardAPI(page);

      // Create and join as participant
      const { roomPage } = await createAndJoinRoom(page, "Toggle User");

      // Toggle to spectator
      await roomPage.toggleSpectatorMode();
      await page.waitForTimeout(1000);
      await roomPage.expectVotingCardsNotVisible();

      // Wait for menu to fully close before reopening
      await page.waitForTimeout(500);

      // Toggle back to participant
      await roomPage.toggleSpectatorMode();
      await page.waitForTimeout(1000);

      // Verify voting cards reappear
      await roomPage.expectVotingCardsVisible();
    });

    test("should remove existing vote when becoming spectator", async ({
      page,
    }) => {
      await mockClipboardAPI(page);

      // Create and join as participant
      const { roomPage } = await createAndJoinRoom(page, "Voting User");

      // Cast a vote
      await roomPage.selectCard("5");
      await roomPage.expectCardSelected("5");

      // Verify vote indicator shows voted
      await roomPage.expectVoteIndicator("Voting User", true);

      // Toggle to spectator
      await roomPage.toggleSpectatorMode();
      await page.waitForTimeout(1000);

      // Verify voting cards are gone
      await roomPage.expectVotingCardsNotVisible();

      // Wait for menu to fully close before reopening
      await page.waitForTimeout(500);

      // Toggle back to participant
      await roomPage.toggleSpectatorMode();
      await page.waitForTimeout(1000);

      // Verify voting cards are back but no vote is selected
      await roomPage.expectVotingCardsVisible();

      // Vote indicator should show not voted (thinking emoji)
      await roomPage.expectVoteIndicator("Voting User", false);
    });
  });

  test.describe("Spectator toggle UI behavior", () => {
    test("should toggle spectator mode by clicking the row", async ({
      page,
    }) => {
      await mockClipboardAPI(page);

      // Create and join as participant
      const { roomPage } = await createAndJoinRoom(page, "Click Row User");

      // Verify initially participant (has voting cards)
      await roomPage.expectVotingCardsVisible();

      // Open user menu and click the spectator row (not the switch)
      await roomPage.openUserMenu();

      // Click on the text "Spectator" directly, not the switch
      const spectatorRow = page.locator('[role="menu"]').locator('div').filter({ hasText: /^Spectator$/ }).first();
      await spectatorRow.click();

      await page.waitForTimeout(500);

      // Verify spectator mode is enabled (no voting cards)
      await roomPage.expectVotingCardsNotVisible();
    });

    test("spectator switch should reflect correct state", async ({ page }) => {
      await mockClipboardAPI(page);

      // Create and join as participant
      const { roomPage } = await createAndJoinRoom(page, "Switch State User");

      // Check initial state - should be off (participant)
      const initialSpectatorState = await roomPage.isSpectatorModeEnabled();
      expect(initialSpectatorState).toBe(false);

      // Toggle to spectator
      await roomPage.toggleSpectatorMode();
      await page.waitForTimeout(500);

      // Check spectator state - should be on
      const spectatorState = await roomPage.isSpectatorModeEnabled();
      expect(spectatorState).toBe(true);
    });
  });

  test.describe("Multi-user spectator scenarios", () => {
    test("spectator should not affect vote count", async ({ browser }) => {
      // Create first user (participant)
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await mockClipboardAPI(page1);

      const { roomId, roomPage: roomPage1 } = await createAndJoinRoom(
        page1,
        "Participant 1"
      );

      // Create second user (spectator)
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await mockClipboardAPI(page2);

      await navigateToRoom(page2, roomId);
      const joinPage2 = new JoinRoomPage(page2);
      await joinPage2.joinAsSpectator("Spectator 1");

      const roomPage2 = new RoomPage(page2);
      await roomPage2.waitForRoomLoad();

      // Participant votes
      await roomPage1.selectCard("5");

      // Wait for sync
      await page1.waitForTimeout(500);

      // Verify both users see the participant
      await roomPage1.expectPlayerInList("Spectator 1");
      await roomPage2.expectPlayerInList("Participant 1");

      // Spectator should not have voting cards
      await roomPage2.expectVotingCardsNotVisible();

      // Cleanup
      await context1.close();
      await context2.close();
    });

    test("spectator toggling should be visible to other users", async ({
      browser,
    }) => {
      // Create first user (participant)
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await mockClipboardAPI(page1);

      const { roomId, roomPage: roomPage1 } = await createAndJoinRoom(
        page1,
        "User 1"
      );

      // Create second user (participant)
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await mockClipboardAPI(page2);

      await navigateToRoom(page2, roomId);
      const joinPage2 = new JoinRoomPage(page2);
      await joinPage2.joinAsParticipant("User 2");

      const roomPage2 = new RoomPage(page2);
      await roomPage2.waitForRoomLoad();

      // User 2 votes
      await roomPage2.selectCard("8");
      await page2.waitForTimeout(500);

      // User 1 should see User 2's vote indicator
      await roomPage1.expectVoteIndicator("User 2", true);

      // User 2 toggles to spectator
      await roomPage2.toggleSpectatorMode();
      await page2.waitForTimeout(1000);

      // User 2's voting cards should be gone
      await roomPage2.expectVotingCardsNotVisible();

      // User 2 should now show spectator indicator (vote was cleared, now spectating)
      await roomPage1.expectSpectatorIndicator("User 2");

      // Cleanup
      await context1.close();
      await context2.close();
    });
  });
});
