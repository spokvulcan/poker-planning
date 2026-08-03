/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import * as Integrations from "./model/integrations";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

// convex-test dispatches runAfter(0) jobs through a real setTimeout, which
// can fire mid-test — racing the _scheduled_functions assertions and running
// Jira actions that need env vars. Faking setTimeout keeps scheduled jobs
// pending for the duration of each test.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedRoom(t: T): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    })
  );
}

async function seedUser(t: T, authUserId: string): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId,
      name: "U",
      createdAt: Date.now(),
    })
  );
}

async function seedConnection(
  t: T,
  userId: Id<"users">
): Promise<Id<"integrationConnections">> {
  return t.run((ctx) =>
    ctx.db.insert("integrationConnections", {
      userId,
      provider: "jira",
      encryptedAccessToken: "enc-access",
      accessTokenIv: "iv",
      accessTokenAuthTag: "tag",
      encryptedRefreshToken: "enc-refresh",
      refreshTokenIv: "riv",
      refreshTokenAuthTag: "rtag",
      expiresAt: Date.now() + 3_600_000,
      cloudId: "cloud-1",
      siteUrl: "https://team.atlassian.net",
      providerUserId: "jira-user-1",
      providerUserEmail: "u@example.com",
      scopes: ["read:jira-work"],
      connectedAt: Date.now(),
      lastRefreshedAt: Date.now(),
    })
  );
}

async function seedMapping(
  t: T,
  roomId: Id<"rooms">,
  connectionId: Id<"integrationConnections">,
  opts: { jiraWebhookId?: string } = {}
): Promise<Id<"integrationMappings">> {
  return t.run((ctx) =>
    ctx.db.insert("integrationMappings", {
      roomId,
      connectionId,
      provider: "jira",
      jiraProjectKey: "PROJ",
      jiraWebhookId: opts.jiraWebhookId,
      jiraWebhookRegisteredAt: opts.jiraWebhookId ? Date.now() : undefined,
      autoImport: false,
      autoPushEstimates: true,
      createdAt: Date.now(),
    })
  );
}

async function seedIssue(
  t: T,
  roomId: Id<"rooms">
): Promise<Id<"issues">> {
  return t.run((ctx) =>
    ctx.db.insert("issues", {
      roomId,
      sequentialId: 1,
      title: "PROJ-1 - Old summary",
      status: "pending",
      createdAt: Date.now(),
      order: 0,
    })
  );
}

async function seedIssueLink(
  t: T,
  issueId: Id<"issues">,
  externalId: string
): Promise<Id<"issueLinks">> {
  return t.run((ctx) =>
    ctx.db.insert("issueLinks", {
      issueId,
      provider: "jira",
      externalId,
      externalUrl: `https://team.atlassian.net/browse/${externalId}`,
      lastSyncedAt: Date.now(),
    })
  );
}

async function countRows(
  t: T,
  table: "integrationConnections" | "integrationMappings" | "issueLinks" | "webhookEvents"
): Promise<number> {
  return t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
}

async function scheduledByName(t: T, suffix: string) {
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  );
  return scheduled.filter((s) => s.name.endsWith(suffix));
}

describe("processJiraWebhookEvent", () => {
  it("applies a redelivered event only once", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId);
    await seedIssueLink(t, issueId, "PROJ-1");

    const event = {
      eventKey: "jira:10001:1700000000000",
      eventType: "jira:issue_updated",
      issueKey: "PROJ-1",
      issueSummary: "First summary",
    };
    await t.mutation(internal.integrations.jira.processJiraWebhook, event);
    // Redelivery of the same event key must no-op — even carrying a
    // different summary, the title must not move again.
    await t.mutation(internal.integrations.jira.processJiraWebhook, {
      ...event,
      issueSummary: "Second summary",
    });

    const issue = await t.run((ctx) => ctx.db.get(issueId));
    expect(issue?.title).toBe("PROJ-1 - First summary");
    expect(await countRows(t, "webhookEvents")).toBe(1);
  });

  it("jira:issue_deleted removes the link but keeps the local issue", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId);
    await seedIssueLink(t, issueId, "PROJ-1");

    await t.mutation(internal.integrations.jira.processJiraWebhook, {
      eventKey: "jira:10001:1700000000001",
      eventType: "jira:issue_deleted",
      issueKey: "PROJ-1",
    });

    expect(await countRows(t, "issueLinks")).toBe(0);
    expect(await t.run((ctx) => ctx.db.get(issueId))).not.toBeNull();
  });
});

describe("disconnect", () => {
  it("cascades the connection's mappings and schedules a deregistration per live webhook", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const connectionId = await seedConnection(t, userId);
    const roomA = await seedRoom(t);
    const roomB = await seedRoom(t);
    await seedMapping(t, roomA, connectionId, { jiraWebhookId: "wh-a" });
    await seedMapping(t, roomB, connectionId, { jiraWebhookId: "wh-b" });

    const asU = t.withIdentity({ subject: "auth-u" });
    await asU.mutation(api.integrations.disconnect, { connectionId });

    expect(await countRows(t, "integrationMappings")).toBe(0);

    const deregistrations = await scheduledByName(t, ":deregisterWebhook");
    expect(deregistrations).toHaveLength(2);
    const deregisteredIds = deregistrations
      .map(
        (s) =>
          (s.args as [{ connectionId: string; jiraWebhookId: string }])[0]
            .jiraWebhookId
      )
      .sort();
    expect(deregisteredIds).toEqual(["wh-a", "wh-b"]);

    // The connection row stays until the deregistrations have read its
    // credentials — deletion is the scheduled tail of the cascade.
    expect(await countRows(t, "integrationConnections")).toBe(1);
    expect(await scheduledByName(t, ":deleteConnection")).toHaveLength(1);
  });

  it("deletes the connection directly when no webhook is live", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const connectionId = await seedConnection(t, userId);
    const roomId = await seedRoom(t);
    await seedMapping(t, roomId, connectionId); // no jiraWebhookId

    const asU = t.withIdentity({ subject: "auth-u" });
    await asU.mutation(api.integrations.disconnect, { connectionId });

    expect(await countRows(t, "integrationMappings")).toBe(0);
    expect(await countRows(t, "integrationConnections")).toBe(0);
    expect(await scheduledByName(t, ":deregisterWebhook")).toHaveLength(0);
    expect(await scheduledByName(t, ":deleteConnection")).toHaveLength(0);
  });
});

describe("removeRoomMapping", () => {
  it("deregisters the mapping's own webhook", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const connectionId = await seedConnection(t, userId);
    const roomId = await seedRoom(t);
    await seedMapping(t, roomId, connectionId, { jiraWebhookId: "wh-room" });

    await t.run((ctx) => Integrations.removeRoomMapping(ctx, roomId));

    expect(await countRows(t, "integrationMappings")).toBe(0);

    const deregistrations = await scheduledByName(t, ":deregisterWebhook");
    expect(deregistrations).toHaveLength(1);
    expect(
      (deregistrations[0].args as [{ jiraWebhookId: string }])[0].jiraWebhookId
    ).toBe("wh-room");

    // The connection survives the mapping — the scheduled action uses its
    // credentials for the remote delete.
    expect(await countRows(t, "integrationConnections")).toBe(1);
  });
});

describe("saveRoomMapping", () => {
  it("upsert preserves createdAt on update and schedules re-registration", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const connectionId = await seedConnection(t, userId);
    const roomId = await seedRoom(t);

    const mappingId = await t.run((ctx) =>
      Integrations.saveRoomMapping(ctx, {
        roomId,
        connectionId,
        provider: "jira",
        jiraProjectKey: "PROJ",
        autoImport: false,
        autoPushEstimates: true,
      })
    );

    // Backdate createdAt to a sentinel so preservation is observable.
    const sentinel = 1_000_000;
    await t.run((ctx) => ctx.db.patch(mappingId, { createdAt: sentinel }));

    const again = await t.run((ctx) =>
      Integrations.saveRoomMapping(ctx, {
        roomId,
        connectionId,
        provider: "jira",
        jiraProjectKey: "PROJ",
        storyPointsFieldId: "customfield_10016",
        autoImport: false,
        autoPushEstimates: true,
      })
    );

    expect(again).toBe(mappingId);
    const mapping = await t.run((ctx) => ctx.db.get(mappingId));
    expect(mapping?.createdAt).toBe(sentinel);
    expect(mapping?.storyPointsFieldId).toBe("customfield_10016");
    expect(await countRows(t, "integrationMappings")).toBe(1);

    // Both the insert and the update scheduled a webhook (re-)registration.
    expect(await scheduledByName(t, ":registerWebhook")).toHaveLength(2);
  });
});

describe("toConnectionView", () => {
  it("never exposes encrypted token fields", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const connectionId = await seedConnection(t, userId);

    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    const view = Integrations.toConnectionView(connection!);

    expect(Object.keys(view).sort()).toEqual([
      "_id",
      "connectedAt",
      "provider",
      "providerUserEmail",
      "scopes",
      "siteUrl",
    ]);
    expect(view).toMatchObject({
      _id: connectionId,
      provider: "jira",
      siteUrl: "https://team.atlassian.net",
      providerUserEmail: "u@example.com",
      scopes: ["read:jira-work"],
    });
  });
});

describe("setMappingWebhook", () => {
  it("replaces the webhook id on re-registration and clears it on removal", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const connectionId = await seedConnection(t, userId);
    const roomId = await seedRoom(t);
    const mappingId = await seedMapping(t, roomId, connectionId, {
      jiraWebhookId: "wh-old",
    });
    await t.run((ctx) =>
      ctx.db.patch(mappingId, { jiraWebhookRegisteredAt: 1_000_000 })
    );

    await t.run((ctx) =>
      Integrations.setMappingWebhook(ctx, mappingId, "wh-new")
    );
    const replaced = await t.run((ctx) => ctx.db.get(mappingId));
    expect(replaced?.jiraWebhookId).toBe("wh-new");
    expect(replaced?.jiraWebhookRegisteredAt).toBeGreaterThan(1_000_000);

    await t.run((ctx) =>
      Integrations.setMappingWebhook(ctx, mappingId, undefined)
    );
    const cleared = await t.run((ctx) => ctx.db.get(mappingId));
    expect(cleared?.jiraWebhookId).toBeUndefined();
    expect(cleared?.jiraWebhookRegisteredAt).toBeUndefined();
  });
});
