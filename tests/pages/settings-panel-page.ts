import { Page, Locator, expect } from "@playwright/test";
import { safeClick } from "../utils/test-helpers";

export class SettingsPanelPage {
  readonly page: Page;
  readonly settingsButton: Locator;
  readonly settingsPanel: Locator;
  readonly closeButton: Locator;
  readonly roomNameInput: Locator;
  readonly saveButton: Locator;
  readonly autoRevealSwitch: Locator;
  readonly themeButtons: {
    light: Locator;
    dark: Locator;
    system: Locator;
  };
  readonly userList: Locator;
  readonly participantCount: Locator;

  constructor(page: Page) {
    this.page = page;

    // Settings button in navigation
    this.settingsButton = page.getByRole("button", {
      name: "Room settings",
    });

    // The settings panel. On desktop this is a docked panel (a plain div that
    // animates from w-0 to w-[380px]); on mobile it's a Sheet dialog. Both
    // carry data-testid="room-settings-panel". When closed the desktop panel
    // has zero width, so toBeVisible() reflects the open/closed state.
    this.settingsPanel = page.getByTestId("room-settings-panel");

    // Close button
    this.closeButton = page.getByRole("button", { name: "Close settings" });

    // Room name section
    this.roomNameInput = page.locator("#room-name");
    this.saveButton = this.settingsPanel.getByRole("button", { name: "Save" });

    // Auto-reveal toggle (the Switch component from Base UI)
    // Find the switch using its data-slot attribute within the settings panel
    this.autoRevealSwitch = this.settingsPanel.locator('[data-slot="switch"]');

    // Theme buttons
    this.themeButtons = {
      light: this.settingsPanel.getByRole("button", { name: "Light" }),
      dark: this.settingsPanel.getByRole("button", { name: "Dark" }),
      system: this.settingsPanel.getByRole("button", { name: "System" }),
    };

    // Participant list. Each row carries data-testid="participant-row" and a
    // data-user-name attribute; the current user is listed too (no remove ctrl).
    this.userList = this.settingsPanel.getByTestId("participant-list");

    // Participant count in settings header
    this.participantCount = this.settingsPanel.locator(
      'span:has-text("user"), span:has-text("users")'
    );
  }

  async openSettings(): Promise<void> {
    await safeClick(this.settingsButton);
    await expect(this.settingsPanel).toBeVisible({ timeout: 5000 });
  }

  async closeSettings(): Promise<void> {
    await safeClick(this.closeButton);
    await expect(this.settingsPanel).not.toBeVisible({ timeout: 5000 });
  }

  async closeByEscape(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await expect(this.settingsPanel).not.toBeVisible({ timeout: 5000 });
  }

  async isOpen(): Promise<boolean> {
    return await this.settingsPanel.isVisible();
  }

  async getRoomName(): Promise<string> {
    return await this.roomNameInput.inputValue();
  }

  async renameRoom(newName: string): Promise<void> {
    await this.roomNameInput.clear();
    await this.roomNameInput.fill(newName);
    await safeClick(this.saveButton);
    // Wait for save to complete - button becomes disabled when name matches saved value
    await this.page.waitForTimeout(500);
    await expect(this.saveButton).toBeDisabled({ timeout: 5000 });
  }

  async renameRoomWithEnter(newName: string): Promise<void> {
    await this.roomNameInput.clear();
    await this.roomNameInput.fill(newName);
    await this.roomNameInput.press("Enter");
    // Wait for save to complete - button becomes disabled when name matches saved value
    await this.page.waitForTimeout(500);
    await expect(this.saveButton).toBeDisabled({ timeout: 5000 });
  }

  async isSaveButtonDisabled(): Promise<boolean> {
    return await this.saveButton.isDisabled();
  }

  async isAutoRevealEnabled(): Promise<boolean> {
    // Base UI uses data-checked attribute when switch is on
    const hasDataChecked = await this.autoRevealSwitch.getAttribute("data-checked");
    return hasDataChecked !== null;
  }

  async toggleAutoReveal(): Promise<void> {
    const wasEnabled = await this.isAutoRevealEnabled();
    await this.autoRevealSwitch.click();
    // Wait for toggle to take effect
    await this.page.waitForTimeout(500);
    if (wasEnabled) {
      // Should no longer have data-checked
      await expect(this.autoRevealSwitch).not.toHaveAttribute(
        "data-checked",
        { timeout: 3000 }
      );
    } else {
      // Should now have data-checked
      await expect(this.autoRevealSwitch).toHaveAttribute(
        "data-checked",
        "",
        { timeout: 3000 }
      );
    }
  }

  async setTheme(theme: "light" | "dark" | "system"): Promise<void> {
    await safeClick(this.themeButtons[theme]);
  }

  async getUserNames(): Promise<string[]> {
    const rows = this.settingsPanel.getByTestId("participant-row");
    const count = await rows.count();
    const names: string[] = [];

    for (let i = 0; i < count; i++) {
      const name = await rows.nth(i).getAttribute("data-user-name");
      if (name) names.push(name.trim());
    }

    return names;
  }

  async removeUser(userName: string): Promise<void> {
    const row = this.settingsPanel.locator(
      `[data-testid="participant-row"][data-user-name="${userName}"]`
    );
    await expect(row).toBeVisible();
    const confirmDialog = this.page.getByRole("alertdialog");

    // The remove control is only revealed on hover (desktop). Retry hover+click
    // until the confirmation dialog actually opens — the opacity reveal can race
    // with the click, especially under parallel load.
    await expect(async () => {
      await row.hover();
      await row
        .getByRole("button", { name: `Remove ${userName}` })
        .click({ force: true });
      await expect(confirmDialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });

    await confirmDialog.getByRole("button", { name: "Remove" }).click();
    // Row disappears once the membership is deleted
    await expect(row).not.toBeVisible();
  }

  async getParticipantCountText(): Promise<string> {
    return (await this.participantCount.textContent()) || "";
  }

  async expectUserInList(userName: string): Promise<void> {
    await expect(
      this.settingsPanel.locator(
        `[data-testid="participant-row"][data-user-name="${userName}"]`
      )
    ).toBeVisible();
  }

  async expectUserNotInList(userName: string): Promise<void> {
    await expect(
      this.settingsPanel.locator(
        `[data-testid="participant-row"][data-user-name="${userName}"]`
      )
    ).not.toBeVisible();
  }

  async expectNoOtherParticipants(): Promise<void> {
    // Assert on participant rows, not Remove buttons: a participant the viewer
    // can't remove renders no "Remove <name>" button, so a button-count check
    // would false-pass. Exactly one row means only the current user remains.
    await expect(
      this.settingsPanel.locator('[data-testid="participant-row"]')
    ).toHaveCount(1);
  }
}
