import { Page, Browser, BrowserContext, expect } from "@playwright/test";
import { HomePage } from "../pages/home-page";
import { RoomPage } from "../pages/room-page";
import { JoinRoomPage } from "../pages/join-room-page";
import { mockClipboardAPI, waitForRoomNavigation } from "./test-helpers";

export interface RoomUser {
  page: Page;
  context: BrowserContext;
  roomPage: RoomPage;
  joinPage: JoinRoomPage;
  name: string;
  role: "participant" | "spectator";
}

/**
 * Create a new room and return the room ID
 */
export async function createRoom(page: Page): Promise<string> {
  const homePage = new HomePage(page);
  await homePage.goto();

  // Mock clipboard to avoid errors
  await mockClipboardAPI(page);

  const roomId = await homePage.createNewRoom();
  await waitForRoomNavigation(page);

  return roomId;
}

/**
 * Navigate directly to a room by ID
 */
export async function navigateToRoom(
  page: Page,
  roomId: string
): Promise<void> {
  await page.goto(`/room/${roomId}`);
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Rename the current user via the UserMenu ("Edit name" dialog).
 *
 * Names live on the single global `users.name` field, so this propagates to the
 * player node and every other view through Convex reactivity.
 */
export async function renameSelf(page: Page, newName: string): Promise<void> {
  const trigger = page.getByTestId("user-menu-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();

  await page.getByRole("menuitem", { name: "Edit name" }).click();

  const dialog = page.getByRole("dialog").filter({ hasText: "Edit your name" });
  const input = dialog.getByPlaceholder("Enter your name");
  await input.fill(newName);
  await dialog.getByRole("button", { name: "Save" }).click();

  // Dialog closes and the new name appears in the menu trigger once the
  // mutation round-trips.
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toContainText(newName);
}

/**
 * Create a room and end up in it as `userName`.
 *
 * Creating a room signs the user in anonymously and auto-joins them as a guest
 * (e.g. "Guest 4829") — no join dialog is shown to the creator. We then rename
 * the guest to the requested name, and optionally switch to spectator mode
 * (auto-join always lands as a participant).
 */
export async function createAndJoinRoom(
  page: Page,
  userName: string,
  role: "participant" | "spectator" = "participant"
): Promise<{ roomId: string; roomPage: RoomPage; joinPage: JoinRoomPage }> {
  const roomId = await createRoom(page);
  const roomPage = new RoomPage(page);
  const joinPage = new JoinRoomPage(page);

  // Creator is auto-joined as a guest — wait for the canvas, then take the name.
  await page.waitForSelector(".react-flow");
  await renameSelf(page, userName);

  if (role === "spectator") {
    await roomPage.toggleSpectatorMode();
  }

  return { roomId, roomPage, joinPage };
}

/**
 * Join an existing room
 */
export async function joinExistingRoom(
  page: Page,
  roomId: string,
  userName: string,
  role: "participant" | "spectator" = "participant"
): Promise<{ roomPage: RoomPage; joinPage: JoinRoomPage }> {
  await navigateToRoom(page, roomId);

  const roomPage = new RoomPage(page);
  const joinPage = new JoinRoomPage(page);

  // A fresh context (no session) gets the join dialog and the chosen name is
  // honored. A context that is already a member auto-rejoins straight to the
  // canvas, so the dialog is optional.
  try {
    await page.waitForSelector('h2:has-text("Join Room")');
    if (role === "participant") {
      await joinPage.joinAsParticipant(userName);
    } else {
      await joinPage.joinAsSpectator(userName);
    }
  } catch {
    // No dialog — already a member of this room.
  }

  // Wait for canvas to appear after joining
  await page.waitForSelector('.react-flow');

  return { roomPage, joinPage };
}

/**
 * Create multiple users for multi-user testing
 * All users are participants by default (spectator role was causing test issues)
 */
export async function createMultipleUsers(
  browser: Browser,
  count: number,
  roomId?: string
): Promise<RoomUser[]> {
  const users: RoomUser[] = [];

  for (let i = 0; i < count; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockClipboardAPI(page);

    const userName = `User${i + 1}`;
    const role: "participant" | "spectator" = "participant"; // All users are participants

    if (i === 0 && !roomId) {
      // First user creates the room
      const result = await createAndJoinRoom(page, userName, role);
      roomId = result.roomId;

      users.push({
        page,
        context,
        roomPage: result.roomPage,
        joinPage: result.joinPage,
        name: userName,
        role,
      });
    } else if (roomId) {
      // Other users join existing room
      const result = await joinExistingRoom(page, roomId, userName, role);

      users.push({
        page,
        context,
        roomPage: result.roomPage,
        joinPage: result.joinPage,
        name: userName,
        role,
      });
    }
  }

  return users;
}

/**
 * Clean up multiple user contexts
 */
export async function cleanupUsers(users: RoomUser[]): Promise<void> {
  for (const user of users) {
    await user.context.close();
  }
}

/**
 * Wait for all users to see a specific player count
 */
export async function waitForPlayerCount(
  users: RoomUser[],
  expectedCount: number,
  timeout: number = 5000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    let allMatch = true;

    for (const user of users) {
      // Count player nodes in the React Flow canvas
      const playerCount = await user.page.locator('.react-flow__node').count();
      if (playerCount !== expectedCount) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for player count ${expectedCount}`);
}

/**
 * Verify room persistence by checking if room data exists
 */
export async function verifyRoomPersistence(
  page: Page,
  roomId: string
): Promise<boolean> {
  try {
    await navigateToRoom(page, roomId);
    await page.waitForLoadState("domcontentloaded");

    // Check if we get redirected to home or if room loads
    const url = page.url();
    return url.includes(`/room/${roomId}`);
  } catch {
    return false;
  }
}

/**
 * Extract room ID from URL
 */
export function extractRoomIdFromUrl(url: string): string | null {
  const match = url.match(/\/room\/([a-z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Generate a test room name
 */
export function generateTestRoomName(prefix: string = "Test Room"): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix} ${timestamp}-${random}`;
}
