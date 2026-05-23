import { Page, Locator, expect } from "@playwright/test";
import { safeClick } from "../utils/test-helpers";

export class HomePage {
  readonly page: Page;
  readonly heroHeading: Locator;
  readonly heroDescription: Locator;
  readonly startGameButton: Locator;
  readonly githubLink: Locator;
  readonly skipToMainLink: Locator;
  readonly trustIndicators: {
    freeForever: Locator;
    noAccount: Locator;
    realtime: Locator;
  };

  constructor(page: Page) {
    this.page = page;

    // Hero section elements
    this.heroHeading = page.locator("h1");
    this.heroDescription = page.locator(
      "text=A radically simple estimation tool"
    );
    this.startGameButton = page.getByTestId("hero-start-button");
    this.githubLink = page.getByTestId("hero-github-link").first();
    this.skipToMainLink = page.getByRole("link", {
      name: /skip to main content/i,
    });

    // Trust indicators
    this.trustIndicators = {
      freeForever: page.locator("text=Free to Use").first(),
      noAccount: page.locator("text=No Account Required").first(),
      realtime: page.locator("text=Real-time Collaboration").first(),
    };
  }

  async goto(): Promise<void> {
    await this.page.goto("/");
    // Wait for the hero CTA instead of "networkidle": an authenticated user
    // returning home keeps Convex/auth connections busy, so networkidle never
    // settles. The hero button is server-rendered and always present.
    await this.page.waitForLoadState("domcontentloaded");
    await expect(this.startGameButton.first()).toBeVisible();
  }

  async verifyPageTitle(titlePattern: RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(titlePattern);
  }

  async verifyHeroSection(): Promise<void> {
    await expect(this.heroHeading).toBeVisible();
    await expect(this.heroHeading).toContainText("Planning poker");

    await expect(this.heroDescription).toBeVisible();
    await expect(this.heroDescription).toContainText("estimation tool");
  }

  async verifyTrustIndicators(): Promise<void> {
    const mainContent = this.page.locator("main").first();

    await expect(
      mainContent.locator("text=Free to Use").first()
    ).toBeVisible();
    await expect(
      mainContent.locator("text=No Account Required").first()
    ).toBeVisible();
    await expect(
      mainContent.locator("text=Real-time Collaboration").first()
    ).toBeVisible();
  }

  async createNewRoom(): Promise<string> {
    // Wait for button to be ready
    await expect(this.startGameButton.first()).toBeVisible();

    // Click to navigate to /room/new
    await safeClick(this.startGameButton.first());
    await this.page.waitForURL(/\/room\/new/);

    // Click "Create Game" button on the create page
    const createButton = this.page.getByRole("button", { name: /create game/i });
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();

    // Click and wait for navigation to the actual room (not /room/new)
    await safeClick(createButton);
    await this.page.waitForURL(/\/room\/(?!new)[a-z0-9]+/);

    // Extract and return room ID
    const url = this.page.url();
    const roomId = url.split("/room/")[1]?.split(/[?#]/)[0];
    return roomId;
  }

  async getClipboardText(): Promise<string> {
    return await this.page.evaluate(() => {
      return window.clipboardText || "";
    });
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );
    await this.page.waitForTimeout(500); // Wait for scroll animation
  }

  async countSections(): Promise<number> {
    const sections = this.page.locator("section");
    return await sections.count();
  }

  async verifyFooter(): Promise<void> {
    await expect(this.page.locator("footer")).toBeVisible();
  }

  async focusSkipLink(): Promise<void> {
    await this.page.keyboard.press("Tab");
    await expect(this.skipToMainLink).toBeVisible();
  }

  async clickSkipLink(): Promise<void> {
    await this.skipToMainLink.click({ force: true });
    const mainContent = this.page.locator("#main-content");
    await expect(mainContent).toBeInViewport();
  }

  async verifyGitHubLink(): Promise<void> {
    await expect(this.githubLink).toBeVisible();
    await expect(this.githubLink).toHaveAttribute(
      "href",
      "https://github.com/spokvulcan/poker-planning"
    );
    await expect(this.githubLink).toHaveAttribute("target", "_blank");
    await expect(this.githubLink).toHaveAttribute("rel", "noopener noreferrer");
  }

  async waitForToast(text: string): Promise<void> {
    // Sonner toasts are rendered in a specific container
    // Try multiple selectors to find the toast
    const toastSelectors = [
      `[data-sonner-toaster] >> text=${text}`,
      `[role="status"] >> text=${text}`,
      `li:has-text("${text}")`,
      `text=${text}`,
    ];

    let found = false;
    for (const selector of toastSelectors) {
      try {
        const toast = this.page.locator(selector);
        await expect(toast).toBeVisible({ timeout: 2000 });
        found = true;
        break;
      } catch {
        // Try next selector
      }
    }

    if (!found) {
      // Last resort: check if any toast-like element exists with partial text match
      const anyToast = this.page.locator(`text="${text}"`);
      await expect(anyToast).toBeVisible({ timeout: 3000 });
    }
  }

  async isButtonEnabled(): Promise<boolean> {
    return await this.startGameButton.first().isEnabled();
  }

  async getCallToActionButtonCount(): Promise<number> {
    // CTA elements are now links to /room/new
    const ctaLinks = this.page
      .locator('a[href="/room/new"]');
    return await ctaLinks.count();
  }
}
