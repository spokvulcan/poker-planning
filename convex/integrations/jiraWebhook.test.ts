/**
 * The Jira webhook boundary: secret verification + payload parsing, driven
 * directly with Request objects — no HTTP action harness required.
 */
import { describe, it, expect } from "vitest";
import { jiraWebhookAddress, verifyAndParseJiraWebhook } from "./jiraWebhook";

const SECRET = "test-webhook-secret";
const SITE = "https://team.atlassian.net";

function delivery(
  body: unknown,
  opts: { querySecret?: string; headerSecret?: string; site?: string | null } = {}
): Request {
  const query = new URLSearchParams();
  if (opts.querySecret) query.set("secret", opts.querySecret);
  const site = opts.site === undefined ? SITE : opts.site;
  if (site) query.set("site", site);
  const url = `https://deployment.convex.site/webhooks/jira?${query}`;
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headerSecret ? { "x-hub-secret": opts.headerSecret } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID_PAYLOAD = {
  webhookEvent: "jira:issue_updated",
  timestamp: 1_700_000_000_000,
  issue: {
    id: "10001",
    key: "PROJ-1",
    fields: { summary: "A summary" },
  },
};

describe("verifyAndParseJiraWebhook", () => {
  it("fails closed when no secret is configured", async () => {
    const result = await verifyAndParseJiraWebhook(
      delivery(VALID_PAYLOAD, { querySecret: SECRET }),
      undefined
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects a wrong or missing secret", async () => {
    for (const req of [
      delivery(VALID_PAYLOAD, { querySecret: "wrong" }),
      delivery(VALID_PAYLOAD),
    ]) {
      const result = await verifyAndParseJiraWebhook(req, SECRET);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    }
  });

  it("accepts the secret as query param or header and parses the event", async () => {
    for (const req of [
      delivery(VALID_PAYLOAD, { querySecret: SECRET }),
      delivery(VALID_PAYLOAD, { headerSecret: SECRET }),
    ]) {
      const result = await verifyAndParseJiraWebhook(req, SECRET);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event).toEqual({
          eventKey: "jira:https://team.atlassian.net:10001:1700000000000",
          eventType: "jira:issue_updated",
          site: "https://team.atlassian.net",
          issueKey: "PROJ-1",
          issueSummary: "A summary",
        });
      }
    }
  });

  it("reads the site from the address a webhook was registered at", async () => {
    const address = jiraWebhookAddress("https://deployment.convex.site", {
      secret: SECRET,
      site: "https://other-team.atlassian.net",
    });
    const request = new Request(address, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    const result = await verifyAndParseJiraWebhook(request, SECRET);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.site).toBe("https://other-team.atlassian.net");
  });

  it("acks and skips a delivery to an address that names no site (a webhook registered before addresses did)", async () => {
    const result = await verifyAndParseJiraWebhook(
      delivery(VALID_PAYLOAD, { querySecret: SECRET, site: null }),
      SECRET
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(200);
  });

  it("acks deliveries without a tracked issue key (200, nothing to process)", async () => {
    const result = await verifyAndParseJiraWebhook(
      delivery(
        { webhookEvent: "jira:issue_updated", timestamp: 1 },
        { querySecret: SECRET }
      ),
      SECRET
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(200);
  });

  it("acks deliveries without Jira's timestamp — never dedups on Date.now()", async () => {
    const result = await verifyAndParseJiraWebhook(
      delivery(
        {
          webhookEvent: "jira:issue_updated",
          issue: { id: "10001", key: "PROJ-1", fields: { summary: "S" } },
        },
        { querySecret: SECRET }
      ),
      SECRET
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(200);
  });
});
