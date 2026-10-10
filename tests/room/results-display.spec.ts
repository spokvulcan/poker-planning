import { test, expect } from "@playwright/test";
import { createMultipleUsers, cleanupUsers } from "../utils/room-helpers";

test.describe("Results Display Suite", () => {
  test.describe("Average calculation", () => {
    test("should calculate average correctly with numeric votes", async ({
      browser,
    }) => {
      // Create 3 users who will vote 3, 5, and 8
      const users = await createMultipleUsers(browser, 3);

      try {
        // Users vote: 3, 5, 8 -> Average = 5.3
        await users[0].roomPage.selectCard("3");
        await users[1].roomPage.selectCard("5");
        await users[2].roomPage.selectCard("8");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check average on results node
        const average = await users[0].roomPage.getResultsAverage();
        expect(average).toBe("5.3");
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should calculate average with mixed numeric and non-numeric votes", async ({
      browser,
    }) => {
      // Create 3 users: two vote numeric, one votes "?"
      const users = await createMultipleUsers(browser, 3);

      try {
        // Users vote: 5, 8, ? -> Average = 6.5 (only numeric counted)
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("8");
        await users[2].roomPage.selectCard("?");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check average (should only count 5 and 8)
        const average = await users[0].roomPage.getResultsAverage();
        expect(average).toBe("6.5");
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should show dash when only non-numeric votes", async ({ browser }) => {
      // Create 2 users who will both vote "?"
      const users = await createMultipleUsers(browser, 2);

      try {
        // Both users vote "?"
        await users[0].roomPage.selectCard("?");
        await users[1].roomPage.selectCard("?");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check average shows dash
        const average = await users[0].roomPage.getResultsAverage();
        expect(average).toBe("—");
      } finally {
        await cleanupUsers(users);
      }
    });
  });

  test.describe("Agreement percentage", () => {
    test("should show 100% agreement when all vote the same", async ({
      browser,
    }) => {
      const users = await createMultipleUsers(browser, 3);

      try {
        // All users vote 5
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("5");
        await users[2].roomPage.selectCard("5");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check agreement
        const agreement = await users[0].roomPage.getResultsAgreement();
        expect(agreement).toBe("100%");
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should calculate agreement based on most common vote", async ({
      browser,
    }) => {
      const users = await createMultipleUsers(browser, 4);

      try {
        // 3 vote 5, 1 votes 8 -> Agreement = 75%
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("5");
        await users[2].roomPage.selectCard("5");
        await users[3].roomPage.selectCard("8");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check agreement (3/4 = 75%)
        const agreement = await users[0].roomPage.getResultsAgreement();
        expect(agreement).toBe("75%");
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should show 50% agreement when votes are evenly split", async ({
      browser,
    }) => {
      const users = await createMultipleUsers(browser, 4);

      try {
        // 2 vote 3, 2 vote 8 -> Agreement = 50%
        await users[0].roomPage.selectCard("3");
        await users[1].roomPage.selectCard("3");
        await users[2].roomPage.selectCard("8");
        await users[3].roomPage.selectCard("8");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check agreement (2/4 = 50%)
        const agreement = await users[0].roomPage.getResultsAgreement();
        expect(agreement).toBe("50%");
      } finally {
        await cleanupUsers(users);
      }
    });
  });

  test.describe("Agreement color coding", () => {
    test("should show green for high agreement (>80%)", async ({ browser }) => {
      test.slow(); // 5 users requires more time
      const users = await createMultipleUsers(browser, 5);

      try {
        // 5 vote same -> 100% agreement (green)
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("5");
        await users[2].roomPage.selectCard("5");
        await users[3].roomPage.selectCard("5");
        await users[4].roomPage.selectCard("5");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check color is green
        const color = await users[0].roomPage.getAgreementColor();
        expect(color).toBe("green");
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should show amber for medium agreement (60-80%)", async ({
      browser,
    }) => {
      test.slow(); // 5 users requires more time
      const users = await createMultipleUsers(browser, 5);

      try {
        // 4 vote 5, 1 votes 8 -> 80% agreement (amber, since >80 is green)
        // Need 3/5 = 60% to trigger amber
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("5");
        await users[2].roomPage.selectCard("5");
        await users[3].roomPage.selectCard("8");
        await users[4].roomPage.selectCard("3");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check color is amber (60% agreement)
        const color = await users[0].roomPage.getAgreementColor();
        expect(color).toBe("amber");
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should show gray for low agreement (<60%)", async ({ browser }) => {
      const users = await createMultipleUsers(browser, 4);

      try {
        // All different votes -> 25% agreement (gray)
        await users[0].roomPage.selectCard("1");
        await users[1].roomPage.selectCard("3");
        await users[2].roomPage.selectCard("5");
        await users[3].roomPage.selectCard("8");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Check color is gray (25% agreement)
        const color = await users[0].roomPage.getAgreementColor();
        expect(color).toBe("gray");
      } finally {
        await cleanupUsers(users);
      }
    });
  });

  test.describe("Vote distribution bars", () => {
    test("should show distribution with correct counts", async ({ browser }) => {
      const users = await createMultipleUsers(browser, 4);

      try {
        // 2 vote 5, 1 votes 3, 1 votes 8
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("5");
        await users[2].roomPage.selectCard("3");
        await users[3].roomPage.selectCard("8");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Get distribution
        const distribution = await users[0].roomPage.getResultsDistribution();

        // Should have 3 entries sorted by value
        expect(distribution).toHaveLength(3);

        // Find each vote and verify count
        const vote3 = distribution.find((d) => d.label === "3");
        const vote5 = distribution.find((d) => d.label === "5");
        const vote8 = distribution.find((d) => d.label === "8");

        expect(vote3?.count).toBe("1");
        expect(vote5?.count).toBe("2");
        expect(vote8?.count).toBe("1");
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should sort distribution by numeric value", async ({ browser }) => {
      const users = await createMultipleUsers(browser, 3);

      try {
        // Vote in non-sorted order: 8, 3, 5
        await users[0].roomPage.selectCard("8");
        await users[1].roomPage.selectCard("3");
        await users[2].roomPage.selectCard("5");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Get distribution
        const distribution = await users[0].roomPage.getResultsDistribution();

        // Should be sorted: 3, 5, 8
        expect(distribution[0].label).toBe("3");
        expect(distribution[1].label).toBe("5");
        expect(distribution[2].label).toBe("8");
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should place non-numeric votes at the end", async ({ browser }) => {
      const users = await createMultipleUsers(browser, 3);

      try {
        // Mix numeric and non-numeric
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("?");
        await users[2].roomPage.selectCard("3");

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Get distribution
        const distribution = await users[0].roomPage.getResultsDistribution();

        // Should be sorted: 3, 5, ? (non-numeric at end)
        expect(distribution[0].label).toBe("3");
        expect(distribution[1].label).toBe("5");
        expect(distribution[2].label).toBe("?");
      } finally {
        await cleanupUsers(users);
      }
    });
  });

  test.describe("Results node visibility", () => {
    test("should show results node only after cards are revealed", async ({
      browser,
    }) => {
      const users = await createMultipleUsers(browser, 2);

      try {
        // Vote but don't reveal
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("8");

        // Results node should not be visible
        await users[0].roomPage.expectResultsNodeNotVisible();

        // Reveal cards
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Results node should now be visible
        await users[0].roomPage.expectResultsNodeVisible();
      } finally {
        await cleanupUsers(users);
      }
    });

    test("should hide results node after starting new round", async ({
      browser,
    }) => {
      const users = await createMultipleUsers(browser, 2);

      try {
        // Vote and reveal
        await users[0].roomPage.selectCard("5");
        await users[1].roomPage.selectCard("8");
        await users[0].roomPage.expectVoteCount(users.length);
        await users[0].roomPage.revealCards();

        // Results should be visible
        await users[0].roomPage.expectResultsNodeVisible();

        // Start new round
        await users[0].roomPage.resetVotes();

        // Results node should be hidden
        await users[0].roomPage.expectResultsNodeNotVisible();
      } finally {
        await cleanupUsers(users);
      }
    });
  });
});
