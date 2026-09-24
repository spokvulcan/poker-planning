import { test, expect, type Browser, type Page } from "@playwright/test";
import { mockClipboardAPI, waitForRoomNavigation } from "../utils/test-helpers";

/**
 * The retro whiteboard with two people in two browsers: stickies stay
 * face-down until the facilitator reveals them, votes add up per topic, the
 * discussion's spotlight follows the most-voted topic for everyone, and the
 * action items are shared.
 */

async function openRetro(browser: Browser): Promise<{ host: Page; url: string }> {
  const host = await (await browser.newContext()).newPage();
  await mockClipboardAPI(host);
  await host.goto("/retro/new");
  await host.getByLabel("Retro Name").fill("Sprint 42 retro");
  await host.getByRole("button", { name: "Start Retro" }).click();
  await waitForRoomNavigation(host);
  await expect(host.getByTestId("retro-node")).toBeVisible();
  return { host, url: host.url() };
}

async function joinAs(browser: Browser, url: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await mockClipboardAPI(page);
  await page.goto(url);
  await page.getByLabel("Your Name").fill(name);
  await page.getByRole("button", { name: "Join Retro" }).click();
  await expect(page.getByTestId("retro-node")).toBeVisible();
  return page;
}

async function writeSticky(page: Page, column: string, text: string): Promise<void> {
  await page.getByRole("button", { name: `Add a sticky to ${column}` }).click();
  const editor = page.getByLabel("Sticky text");
  await expect(editor).toBeFocused();
  await editor.fill(text);
  await editor.press("Enter");
  await expect(page.getByTestId("retro-sticky").filter({ hasText: text })).toBeVisible();
}

const sticky = (page: Page, text: string) => page.getByTestId("retro-sticky").filter({ hasText: text });

/** Brings the whole board into view, as a person would before reaching for the retro node. */
const fitView = (page: Page) => page.getByRole("button", { name: "Fit view" }).click();

test.describe("Retro board", () => {
  test("write face-down, reveal, vote, discuss and leave with an action item", async ({ browser }) => {
    const { host, url } = await openRetro(browser);
    const guest = await joinAs(browser, url, "Bea");

    await writeSticky(host, "Went well", "Deploys got faster");
    await writeSticky(guest, "To improve", "Standups run long");

    // Each sees the other's sticky face-down, and never its words.
    await expect(guest.locator('[data-testid="retro-sticky"][data-hidden]')).toHaveCount(1);
    await expect(host.locator('[data-testid="retro-sticky"][data-hidden]')).toHaveCount(1);
    await expect(guest.getByText("Deploys got faster")).toHaveCount(0);
    await expect(host.getByText("Standups run long")).toHaveCount(0);

    // Only the facilitator reveals.
    await fitView(host);
    await fitView(guest);
    await expect(guest.getByTestId("retro-node").getByRole("button", { name: /Only facilitators/ })).toBeDisabled();
    await host.getByRole("button", { name: "Reveal all stickies" }).click();
    await expect(guest.getByText("Deploys got faster")).toBeVisible();
    await expect(host.getByText("Standups run long")).toBeVisible();

    // Both vote for one topic; the totals stay hidden until the discussion.
    await sticky(host, "Standups run long").getByRole("button", { name: "Vote" }).click();
    await sticky(guest, "Standups run long").getByRole("button", { name: "Vote" }).click();
    await expect(host.getByTestId("retro-node")).toContainText("2/6 votes");
    await expect(sticky(host, "Standups run long").getByLabel("2 votes")).toHaveCount(0);

    // The discussion opens on the most-voted topic, for everyone.
    await fitView(host);
    await host.getByRole("button", { name: "Start discussion" }).click();
    await expect(guest.locator('[data-testid="retro-sticky"][data-focused]')).toContainText("Standups run long");
    await expect(sticky(guest, "Standups run long").getByLabel("2 votes")).toBeVisible();

    // Anyone can add an action item; everyone sees it.
    await fitView(guest);
    await guest.getByLabel("New action item").fill("Timebox standups to 15 minutes");
    await guest.getByLabel("New action item").press("Enter");
    await expect(host.getByTestId("retro-action-item")).toContainText("Timebox standups to 15 minutes");

    // Only the voted topic is walked, so it is the last one: finish.
    await fitView(host);
    await host.getByRole("button", { name: "Finish retro" }).click();
    await expect(guest.getByTestId("retro-node")).toHaveAttribute("data-step", "done");
  });

  test("the next retro carries the open action items over", async ({ browser }) => {
    const { host } = await openRetro(browser);
    await host.getByLabel("New action item").fill("Write the runbook");
    await host.getByLabel("New action item").press("Enter");
    await host.getByLabel("New action item").fill("Fix the flaky test");
    await host.getByLabel("New action item").press("Enter");
    await host.getByRole("checkbox", { name: "Done: Fix the flaky test" }).click();

    await host.getByRole("button", { name: "Go to Discuss" }).click();
    await host.getByRole("button", { name: "Finish retro" }).click();
    const previous = host.url();
    await host.getByRole("button", { name: "Start the next retro" }).click();
    await host.waitForURL((url) => url.toString() !== previous && /\/room\//.test(url.toString()));

    await expect(host.getByTestId("retro-node")).toContainText("Sprint 43 retro");
    const items = host.getByTestId("retro-action-item");
    await expect(items).toHaveCount(1);
    await expect(items).toContainText("Write the runbook");
    await expect(host.getByTestId("retro-actions")).toContainText("From last retro");
  });
});
