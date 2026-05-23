import { Page, Locator, expect } from "@playwright/test";
import { safeClick } from "../utils/test-helpers";

export class RoomPage {
  readonly page: Page;
  readonly votingCards: Locator;
  readonly revealButton: Locator;
  readonly resetButton: Locator;
  readonly voteCountIndicator: Locator;
  readonly playerList: Locator;
  readonly roomTitle: Locator;
  readonly copyUrlButton: Locator;
  readonly timerButton: Locator;
  readonly resultsSection: Locator;
  readonly resultsNode: Locator;
  readonly canvasContainer: Locator;
  readonly roomNameInHeader: Locator;
  readonly userCountInHeader: Locator;
  readonly roomNameInHeaderMobile: Locator;
  readonly userCountInHeaderMobile: Locator;
  readonly autoRevealCountdown: Locator;

  constructor(page: Page) {
    this.page = page;

    // Voting elements - React Flow nodes have specific structure
    this.votingCards = page.locator('[role="button"][aria-label*="Vote"]');
    this.revealButton = page.getByRole("button", { name: /Reveal (all )?([Cc]ards|[Vv]otes)/i });
    this.resetButton = page.getByRole("button", { name: /New Round|Start (a )?new (voting )?round/i });
    this.voteCountIndicator = page.locator('[aria-label="Voting progress"]').locator('..').locator('span.text-xs');

    // Room information
    this.roomTitle = page.locator('.font-semibold').filter({ hasText: "Planning Session" });
    this.copyUrlButton = page.getByRole("button", { name: "Copy room URL" });

    // Room name in navigation header (left nav bar)
    this.roomNameInHeader = page.locator('[data-testid="canvas-navigation"] .font-semibold');

    // User avatars in navigation header
    this.userCountInHeader = page.locator('[data-testid="desktop-user-avatars"]');

    // Mobile navigation elements
    this.roomNameInHeaderMobile = page.locator('[data-testid="mobile-room-name"]');
    this.userCountInHeaderMobile = page.locator('[data-testid="mobile-user-avatars"]');

    // Auto-reveal countdown display in session node. While counting down the
    // session node shows a cancel button labelled "Auto-revealing in N seconds…".
    this.autoRevealCountdown = page
      .locator('.react-flow__node-session')
      .getByRole('button', { name: /Auto-revealing in/i });

    // Player elements - these are React Flow nodes
    this.playerList = page.locator(".react-flow__node-player");

    // Timer and results (results shown in results node when voting revealed)
    this.timerButton = page.locator(".react-flow__node-timer");
    this.resultsSection = page.locator(".react-flow__node-results");
    this.resultsNode = page.locator(".react-flow__node-results");

    // Canvas
    this.canvasContainer = page.locator(".react-flow");
  }

  async goto(roomId: string): Promise<void> {
    await this.page.goto(`/room/${roomId}`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async waitForRoomLoad(): Promise<void> {
    // Wait for the canvas or main room container to be visible
    await expect(
      this.canvasContainer.or(this.page.locator(".react-flow"))
    ).toBeVisible();
  }

  async selectCard(value: string): Promise<void> {
    const card = this.votingCards.filter({ hasText: value }).first();
    await safeClick(card);
    // Check if card is selected by its aria-pressed attribute
    await expect(card).toHaveAttribute("aria-pressed", "true");
  }

  async revealCards(): Promise<void> {
    await safeClick(this.revealButton);
    await expect(this.resultsSection).toBeVisible({ timeout: 5000 });
  }

  async resetVotes(): Promise<void> {
    await safeClick(this.resetButton);
    await expect(this.resultsSection).not.toBeVisible();
  }

  async expectVoteCount(count: number): Promise<void> {
    await expect(this.voteCountIndicator).toContainText(`${count}`);
  }

  async expectPlayerInList(playerName: string): Promise<void> {
    // Players are shown in React Flow nodes with class react-flow__node-player
    const player = this.page.locator(".react-flow__node-player").filter({ hasText: playerName });
    await expect(player).toBeVisible();
  }

  async expectVoteIndicator(
    playerName: string,
    hasVoted: boolean = true
  ): Promise<void> {
    // Vote indicators are shown in player nodes as emojis
    // ✅ = has voted (hidden), 🤔 = thinking/not voted yet
    const player = this.page.locator(".react-flow__node-player").filter({ hasText: playerName });
    if (hasVoted) {
      // Look for checkmark emoji indicating player has voted
      await expect(player.locator("text=✅")).toBeVisible();
    } else {
      // Look for thinking emoji indicating player hasn't voted
      await expect(player.locator("text=🤔")).toBeVisible();
    }
  }

  async expectSpectatorIndicator(playerName: string): Promise<void> {
    // Spectators show 👀 emoji
    const player = this.page.locator(".react-flow__node-player").filter({ hasText: playerName });
    await expect(player.locator("text=👀")).toBeVisible();
  }

  async copyRoomUrl(): Promise<void> {
    await safeClick(this.copyUrlButton);
  }

  async getRoomId(): Promise<string> {
    const url = this.page.url();
    const match = url.match(/\/room\/([a-z0-9]+)/);
    if (!match) {
      throw new Error("Could not extract room ID from URL");
    }
    return match[1];
  }

  async expectRoomTitle(title: string): Promise<void> {
    await expect(this.roomTitle).toContainText(title);
  }

  async isJoinDialogVisible(): Promise<boolean> {
    // Check for the join room container
    const joinDialog = this.page.locator(".max-w-md.w-full.space-y-6.bg-card").first();
    try {
      return await joinDialog.isVisible({ timeout: 1000 });
    } catch {
      return false;
    }
  }

  async expectCardSelected(value: string): Promise<void> {
    const card = this.votingCards.filter({ hasText: value }).first();
    await expect(card).toHaveAttribute("aria-pressed", "true");
  }

  async expectResultsVisible(): Promise<void> {
    await expect(this.resultsSection).toBeVisible();
  }

  async expectResultsNotVisible(): Promise<void> {
    await expect(this.resultsSection).not.toBeVisible();
  }

  async getVoteResults(): Promise<
    { value: string; count: number; voters: string[] }[]
  > {
    await this.expectResultsVisible();

    const results = await this.resultsSection
      .locator("[data-vote-result]")
      .all();
    const voteResults = [];

    for (const result of results) {
      const value = (await result.getAttribute("data-vote-value")) || "";
      const count = parseInt(
        (await result.getAttribute("data-vote-count")) || "0"
      );
      const votersText =
        (await result.locator("[data-voters]").textContent()) || "";
      const voters = votersText
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v);

      voteResults.push({ value, count, voters });
    }

    return voteResults;
  }

  async getRoomNameFromHeader(): Promise<string> {
    const locator = this.roomNameInHeader.or(this.roomNameInHeaderMobile);
    await expect(locator.first()).toBeVisible({ timeout: 5000 });
    return (await locator.first().textContent()) || "";
  }

  async getParticipantCount(): Promise<number> {
    // Wait for canvas navigation or mobile navigation to be visible
    const desktopNav = this.page.locator('[data-testid="canvas-navigation"]');
    const mobileNav = this.page.locator('[data-testid="mobile-navigation"]');

    // Wait for either to be visible
    await expect(async () => {
      const desktopVisible = await desktopNav.isVisible();
      const mobileVisible = await mobileNav.isVisible();
      expect(desktopVisible || mobileVisible).toBe(true);
    }).toPass({ timeout: 5000 });

    // Get the count by evaluating the DOM directly - find visible avatar group
    const count = await this.page.evaluate(() => {
      // Check desktop first (visible when offsetParent is not null)
      let group = document.querySelector('[data-testid="desktop-user-avatars"] [data-slot="avatar-group"]');
      const desktopEl = group as HTMLElement | null;
      if (!desktopEl || desktopEl.offsetParent === null) {
        // Fall back to mobile
        group = document.querySelector('[data-testid="mobile-user-avatars"] [data-slot="avatar-group"]');
      }
      if (!group) return 0;

      // Count tooltip-trigger elements (avatars wrapped in TooltipTrigger)
      const avatars = group.querySelectorAll('[data-slot="tooltip-trigger"]');
      let total = avatars.length;

      // Check for overflow count (also wrapped in tooltip-trigger, but contains +N text)
      const overflow = group.querySelector('[data-slot="avatar-group-count"]');
      if (overflow) {
        const text = overflow.textContent || '';
        const match = text.match(/\+(\d+)/);
        if (match) {
          total += parseInt(match[1]);
          // The overflow count itself is also a tooltip-trigger, so subtract 1
          total -= 1;
        }
      }

      return total;
    });

    return count;
  }

  async expectRoomNameInHeader(name: string): Promise<void> {
    const locator = this.roomNameInHeader.or(this.roomNameInHeaderMobile);
    await expect(locator.first()).toContainText(name, { timeout: 5000 });
  }

  async expectParticipantCount(count: number): Promise<void> {
    // Wait for the avatar group to reflect the expected count
    // Use longer timeout for real-time database updates to propagate
    // Explicit timeout: expect.timeout does not apply to toPass(), so without
    // it a mismatch retries until the 60s per-test timeout and fails with a
    // generic timeout instead of "expected N, got M".
    await expect(async () => {
      const actualCount = await this.getParticipantCount();
      expect(actualCount).toBe(count);
    }).toPass({ timeout: 10000 });
  }

  async expectAutoRevealCountdown(): Promise<void> {
    await expect(this.autoRevealCountdown).toBeVisible({ timeout: 5000 });
  }

  async expectNoAutoRevealCountdown(): Promise<void> {
    await expect(this.autoRevealCountdown).not.toBeVisible({ timeout: 3000 });
  }

  // Results Node methods
  async expectResultsNodeVisible(): Promise<void> {
    await expect(this.resultsNode).toBeVisible({ timeout: 5000 });
  }

  async expectResultsNodeNotVisible(): Promise<void> {
    await expect(this.resultsNode).not.toBeVisible({ timeout: 3000 });
  }

  async getResultsAverage(): Promise<string> {
    await this.expectResultsNodeVisible();
    // Get the average value from the results node (Avg label followed by value)
    const avgText = await this.resultsNode.locator("text=Avg").locator("..").locator("span.text-lg").textContent();
    return avgText?.trim() || "";
  }

  async getResultsAgreement(): Promise<string> {
    await this.expectResultsNodeVisible();
    // Get the agreement value from the results node (Agree label followed by value)
    const agreeText = await this.resultsNode.locator("text=Agree").locator("..").locator("span.text-lg").textContent();
    return agreeText?.trim() || "";
  }

  async getResultsDistribution(): Promise<{ label: string; count: string }[]> {
    await this.expectResultsNodeVisible();
    const bars = await this.resultsNode.locator(".flex.items-center.gap-1\\.5.h-4").all();
    const distribution: { label: string; count: string }[] = [];

    for (const bar of bars) {
      const label = await bar.locator("span").first().textContent();
      const count = await bar.locator("span").last().textContent();
      distribution.push({
        label: label?.trim() || "",
        count: count?.trim() || "",
      });
    }

    return distribution;
  }

  async getAgreementColor(): Promise<"green" | "amber" | "gray"> {
    await this.expectResultsNodeVisible();
    const agreeSpan = this.resultsNode.locator("text=Agree").locator("..").locator("span.text-lg");
    const classes = await agreeSpan.getAttribute("class") || "";

    if (classes.includes("text-green")) {
      return "green";
    } else if (classes.includes("text-amber")) {
      return "amber";
    }
    return "gray";
  }

  // User menu methods
  async openUserMenu(): Promise<void> {
    const userMenuTrigger = this.page.getByTestId("user-menu-trigger");
    await safeClick(userMenuTrigger);
    // Wait for dropdown to appear
    await expect(this.page.locator('[data-slot="dropdown-menu-content"]')).toBeVisible({ timeout: 5000 });
  }

  async toggleSpectatorMode(): Promise<void> {
    await this.openUserMenu();
    // Click the spectator row (the entire div is clickable)
    const spectatorRow = this.page.getByTestId("spectator-toggle-row");
    await expect(spectatorRow).toBeVisible({ timeout: 5000 });
    // Use force click as the menu may close during the click
    await spectatorRow.click({ force: true });
    // Wait for state to update
    await this.page.waitForTimeout(300);
    // Press Escape to ensure menu closes
    await this.page.keyboard.press("Escape");
    // Wait for menu to close
    await this.page.waitForTimeout(300);
  }

  async isSpectatorModeEnabled(): Promise<boolean> {
    await this.openUserMenu();
    // The Switch uses data-checked attribute when enabled
    const spectatorRow = this.page.getByTestId("spectator-toggle-row");
    const spectatorSwitch = spectatorRow.locator('[data-slot="switch"]');
    const isChecked = await spectatorSwitch.getAttribute("data-checked");
    // Close menu by pressing Escape
    await this.page.keyboard.press("Escape");
    // data-checked attribute exists (empty string) when checked, null when not
    return isChecked !== null;
  }

  async expectVotingCardsVisible(): Promise<void> {
    await expect(this.votingCards.first()).toBeVisible();
  }

  async expectVotingCardsNotVisible(): Promise<void> {
    await expect(this.votingCards.first()).not.toBeVisible();
  }

  async getVotingCardsCount(): Promise<number> {
    return await this.votingCards.count();
  }
}
