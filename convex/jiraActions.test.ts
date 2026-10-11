/// <reference types="vite/client" />
/**
 * The Jira adapter's registered actions, end to end, against the in-memory
 * Jira (integrations/jira.setup.ts) that stands behind the global fetch.
 * Every action acts on Jira through Jira access (integrations/jiraAccess.ts):
 * as the person calling, or as one connection, always on that connection's
 * site and with its own token, refreshed when stale; and each turns why Jira
 * can't be reached into its own policy. The calls Jira receives (their site,
 * token, path and body) are what these tests read.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as TokenVault from "./model/tokenVault";
import { inMemoryJira, TEST_VAULT_KEY, type InMemoryJira } from "./integrations/jira.setup";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

let jira: InMemoryJira;

beforeEach(() => {
  jira = inMemoryJira();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A person signed in as `subject`, with a users row. */
const seedPerson = (t: T, subject: string): Promise<Id<"users">> =>
  t.run((ctx) => ctx.db.insert("users", { authUserId: subject, name: subject, createdAt: Date.now() }));

const as = (t: T, subject: string) => t.withIdentity({ subject });

async function seedRoom(t: T): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
    })
  );
}

async function seat(t: T, roomId: Id<"rooms">, userId: Id<"users">): Promise<void> {
  await t.run((ctx) => ctx.db.insert("roomMemberships", { roomId, userId, isSpectator: false, joinedAt: Date.now() }));
}

/** A room mapped to PROJ through the connection, pushing estimates (so wanting a webhook). */
async function seedMapping(
  t: T,
  connectionId: Id<"integrationConnections">,
  record: { jiraWebhookId?: string; jiraWebhookConnectionId?: Id<"integrationConnections"> } = {}
): Promise<Id<"integrationMappings">> {
  const roomId = await seedRoom(t);
  return t.run((ctx) =>
    ctx.db.insert("integrationMappings", {
      roomId,
      connectionId,
      provider: "jira",
      jiraProjectKey: "PROJ",
      storyPointsFieldId: "customfield_10016",
      autoImport: false,
      autoPushEstimates: true,
      createdAt: Date.now(),
      ...record,
      ...(record.jiraWebhookId ? { jiraWebhookRegisteredAt: Date.now(), jiraWebhookProjectKey: "PROJ" } : {}),
    })
  );
}

const mappingRow = (t: T, mappingId: Id<"integrationMappings">) =>
  t.run((ctx) => ctx.db.get("integrationMappings", mappingId));

const connectionRow = (t: T, connectionId: Id<"integrationConnections">) =>
  t.run((ctx) => ctx.db.get("integrationConnections", connectionId));

async function scheduled(t: T, suffix: string) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.name.endsWith(suffix) && job.state.kind === "pending");
}

describe("acting on Jira as the person calling", () => {
  it("reads their own site's projects, boards, sprints, issues and fields, as their own connection", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team", { issues: { "PROJ-1": "Login form", "PROJ-2": "Signup" } });
    team.issues.get("PROJ-1")!.sprint = 7;
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team);
    const ann = as(t, "ann");

    expect(await ann.action(api.integrations.jira.getJiraProjects, {})).toEqual([
      { id: "10000", key: "PROJ", name: "Project" },
    ]);
    expect(await ann.action(api.integrations.jira.getJiraBoards, { projectKey: "PROJ" })).toEqual([
      expect.objectContaining({ id: 1, name: "PROJ board" }),
    ]);
    expect(await ann.action(api.integrations.jira.getJiraSprints, { boardId: 1 })).toEqual([
      expect.objectContaining({ id: 7, name: "Sprint 7" }),
    ]);
    const sprint = await ann.action(api.integrations.jira.getJiraIssues, { projectKey: "PROJ", sprintId: 7 });
    expect(sprint.map((issue) => issue.key)).toEqual(["PROJ-1"]);
    const backlog = await ann.action(api.integrations.jira.getJiraIssues, { projectKey: "PROJ" });
    expect(backlog.map((issue) => issue.key)).toEqual(["PROJ-2"]);
    expect(await ann.action(api.integrations.jira.detectStoryPointsField, {})).toBe("customfield_10016");

    // Every call reached Ann's site with Ann's token.
    expect(jira.restCalls()).toHaveLength(6);
    for (const call of jira.restCalls()) {
      expect(call).toMatchObject({ site: team.url, token: jira.tokenOf(connectionId) });
    }
  });

  it("refreshes a stale token first, and keeps the new pair only as vault ciphertext", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team, { stale: true });
    const seeded = jira.tokenOf(connectionId);

    await as(t, "ann").action(api.integrations.jira.getJiraProjects, {});

    const refreshed = jira.tokenOf(connectionId);
    expect(refreshed).not.toBe(seeded);
    expect(jira.calls.map((call) => `${call.method} ${call.site}${call.path}`)).toEqual([
      "POST auth/oauth/token",
      `GET ${team.url}/rest/api/3/project/search`,
    ]);
    expect(jira.calls[1].token).toBe(refreshed);
    const stored = (await connectionRow(t, connectionId))!;
    expect(JSON.stringify(stored)).not.toContain(refreshed);
    expect(await TokenVault.decryptAccessToken(stored, TEST_VAULT_KEY)).toBe(refreshed);
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  it("refuses in words the person can act on when Jira can't be reached as them, and asks Jira nothing", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    await seedPerson(t, "nobody-connected");
    await jira.connect(t, await seedPerson(t, "siteless"), null);
    const revoked = await jira.connect(t, await seedPerson(t, "revoked"), team, { stale: true });
    jira.revoke(revoked);
    const projectsAs = (subject: string) => as(t, subject).action(api.integrations.jira.getJiraProjects, {});

    await expect(projectsAs("nobody-connected")).rejects.toMatchObject({
      data: { code: "missing", message: "Connect Jira first, in Settings > Integrations." },
    });
    await expect(projectsAs("siteless")).rejects.toMatchObject({
      data: { code: "missing", message: "Your Jira connection has no site address; reconnect Jira." },
    });
    await expect(projectsAs("revoked")).rejects.toMatchObject({
      data: { code: "missing", message: "Jira no longer accepts your connection; reconnect Jira." },
    });
    // The revoked connection tried a refresh, and nothing reached Jira itself.
    expect(jira.restCalls()).toEqual([]);
  });
});

describe("importing issues", () => {
  it("reads each key from the importer's own site, as their connection, and links it to its page there", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team", { issues: { "PROJ-1": "Login form", "PROJ-2": "Signup" } });
    const other = jira.site("other", { issues: { "PROJ-1": "Another team's issue" } });
    const roomId = await seedRoom(t);
    const annId = await seedPerson(t, "ann");
    await seat(t, roomId, annId);
    const annsConnection = await jira.connect(t, annId, team);
    await jira.connect(t, await seedPerson(t, "bob"), other);

    const result = await as(t, "ann").action(api.integrations.jira.importIssues, {
      roomId,
      jiraIssueKeys: ["PROJ-1", "PROJ-2"],
    });

    expect(result).toEqual({ imported: 2, skipped: 0, refused: [] });
    const links = await t.run((ctx) => ctx.db.query("issueLinks").collect());
    expect(links.map((link) => link.externalUrl)).toEqual([
      "https://team.atlassian.net/browse/PROJ-1",
      "https://team.atlassian.net/browse/PROJ-2",
    ]);
    const issues = await t.run((ctx) => ctx.db.query("issues").collect());
    expect(issues.map((issue) => issue.title)).toEqual(["PROJ-1 - Login form", "PROJ-2 - Signup"]);
    expect(jira.restCalls().map(({ site, token, path }) => ({ site, token, path }))).toEqual([
      { site: team.url, token: jira.tokenOf(annsConnection), path: "/rest/api/3/issue/PROJ-1?fields=summary,issuetype,status,priority" },
      { site: team.url, token: jira.tokenOf(annsConnection), path: "/rest/api/3/issue/PROJ-2?fields=summary,issuetype,status,priority" },
    ]);
  });

  it("refuses every key, saying why, when Jira can't be reached as the importer", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const annId = await seedPerson(t, "ann");
    await seat(t, roomId, annId);
    await jira.connect(t, annId, null); // a connection that names no site

    const result = await as(t, "ann").action(api.integrations.jira.importIssues, {
      roomId,
      jiraIssueKeys: ["PROJ-1", "PROJ-2"],
    });

    const reason = "Your Jira connection has no site address; reconnect Jira.";
    expect(result).toEqual({
      imported: 0,
      skipped: 0,
      refused: [
        { key: "PROJ-1", reason },
        { key: "PROJ-2", reason },
      ],
    });
    expect(jira.calls).toEqual([]);
  });
});

describe("registering a mapping's webhook", () => {
  beforeEach(() => {
    vi.stubEnv("JIRA_WEBHOOK_SECRET", "s3cret");
    vi.stubEnv("CONVEX_SITE_URL", "https://agilekit.convex.site");
  });

  it("registers it as the mapping's connection, at an address naming that connection's site, and records it", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team);
    const mappingId = await seedMapping(t, connectionId);

    await t.action(internal.integrations.jira.registerWebhook, { mappingId });

    const [[webhookId, webhook]] = [...team.webhooks];
    expect(webhook).toEqual({
      url: "https://agilekit.convex.site/webhooks/jira?secret=s3cret&site=https%3A%2F%2Fteam.atlassian.net",
      jqlFilter: "project = PROJ",
      events: ["jira:issue_updated", "jira:issue_deleted"],
    });
    expect(jira.restCalls()).toEqual([
      expect.objectContaining({ method: "POST", site: team.url, token: jira.tokenOf(connectionId), path: "/rest/api/3/webhook" }),
    ]);
    expect(await mappingRow(t, mappingId)).toMatchObject({
      jiraWebhookId: webhookId,
      jiraWebhookConnectionId: connectionId,
      jiraWebhookProjectKey: "PROJ",
    });
  });

  it("deletes the webhook it replaces as the connection that made it, then registers the new one as the mapping's", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const annsConnection = await jira.connect(t, await seedPerson(t, "ann"), team);
    const bobsConnection = await jira.connect(t, await seedPerson(t, "bob"), team);
    team.webhooks.set("900", { url: "old", jqlFilter: "project = PROJ", events: [] });
    const mappingId = await seedMapping(t, bobsConnection);

    await t.action(internal.integrations.jira.registerWebhook, {
      mappingId,
      replacing: { connectionId: annsConnection, webhookId: "900" },
    });

    expect(jira.restCalls().map(({ method, path, token }) => ({ method, path, token }))).toEqual([
      { method: "DELETE", path: "/rest/api/3/webhook?webhookIds=900", token: jira.tokenOf(annsConnection) },
      { method: "POST", path: "/rest/api/3/webhook", token: jira.tokenOf(bobsConnection) },
    ]);
    expect([...team.webhooks.keys()]).not.toContain("900");
    expect(await mappingRow(t, mappingId)).toMatchObject({ jiraWebhookConnectionId: bobsConnection });
  });

  it("records a registration Jira refuses on the mapping, where the room's settings show it", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team);
    const mappingId = await seedMapping(t, connectionId);
    jira.refuseNext("POST", "/rest/api/3/webhook", 400);

    await t.action(internal.integrations.jira.registerWebhook, { mappingId });

    expect(await mappingRow(t, mappingId)).toMatchObject({ jiraWebhookFailure: "jiraError" });
    expect(team.webhooks.size).toBe(0);
  });

  it("records one the connection can't make, its grant revoked, without asking Jira", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team, { stale: true });
    jira.revoke(connectionId);
    const mappingId = await seedMapping(t, connectionId);

    await t.action(internal.integrations.jira.registerWebhook, { mappingId });

    expect(await mappingRow(t, mappingId)).toMatchObject({ jiraWebhookFailure: "jiraError" });
    expect(jira.restCalls()).toEqual([]);
  });

  it("records a missing webhook secret, without asking Jira", async () => {
    vi.stubEnv("JIRA_WEBHOOK_SECRET", undefined);
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const mappingId = await seedMapping(t, await jira.connect(t, await seedPerson(t, "ann"), team));

    await t.action(internal.integrations.jira.registerWebhook, { mappingId });

    expect(await mappingRow(t, mappingId)).toMatchObject({ jiraWebhookFailure: "missingSecret" });
    expect(jira.calls).toEqual([]);
  });
});

describe("deregistering a webhook", () => {
  it("deletes it as the connection that made it", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team);
    team.webhooks.set("900", { url: "x", jqlFilter: "project = PROJ", events: [] });

    await t.action(internal.integrations.jira.deregisterWebhook, { connectionId, webhookId: "900" });

    expect(team.webhooks.size).toBe(0);
    expect(jira.restCalls()).toEqual([
      expect.objectContaining({ method: "DELETE", token: jira.tokenOf(connectionId), path: "/rest/api/3/webhook?webhookIds=900" }),
    ]);
    expect(await scheduled(t, ":deregisterWebhook")).toEqual([]);
  });

  it("retries once when Jira refuses, then stops, leaving it to expire", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team);
    team.webhooks.set("900", { url: "x", jqlFilter: "project = PROJ", events: [] });
    jira.refuseNext("DELETE", "/rest/api/3/webhook", 503);
    jira.refuseNext("DELETE", "/rest/api/3/webhook", 503);

    await t.action(internal.integrations.jira.deregisterWebhook, { connectionId, webhookId: "900" });

    const [retry] = await scheduled(t, ":deregisterWebhook");
    expect(retry.args[0]).toEqual({ connectionId, webhookId: "900", attemptsLeft: 0 });
    expect(retry.scheduledTime - Date.now()).toBeGreaterThan(4 * 60 * 1000);

    // The retry is refused as well, and schedules no other.
    await t.action(internal.integrations.jira.deregisterWebhook, retry.args[0] as never);
    expect(await scheduled(t, ":deregisterWebhook")).toHaveLength(1);
    expect(team.webhooks.has("900")).toBe(true);
  });

  it("retries a connection whose token is refused, but not one that is gone", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const refused = await jira.connect(t, await seedPerson(t, "ann"), team, { stale: true });
    jira.revoke(refused);
    const gone = await jira.connect(t, await seedPerson(t, "bob"), team);
    await t.run((ctx) => ctx.db.delete("integrationConnections", gone));

    await t.action(internal.integrations.jira.deregisterWebhook, { connectionId: refused, webhookId: "901" });
    await t.action(internal.integrations.jira.deregisterWebhook, { connectionId: gone, webhookId: "902" });

    const retries = await scheduled(t, ":deregisterWebhook");
    expect(retries.map((job) => job.args[0])).toEqual([{ connectionId: refused, webhookId: "901", attemptsLeft: 0 }]);
    expect(jira.restCalls()).toEqual([]);
  });
});

describe("disconnecting a connection", () => {
  it("deletes each of its webhooks as the connection, before its row goes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const annId = await seedPerson(t, "ann");
    const connectionId = await jira.connect(t, annId, team);
    team.webhooks.set("900", { url: "x", jqlFilter: "project = PROJ", events: [] });
    team.webhooks.set("901", { url: "y", jqlFilter: "project = PROJ", events: [] });
    await seedMapping(t, connectionId, { jiraWebhookId: "900", jiraWebhookConnectionId: connectionId });
    await seedMapping(t, connectionId, { jiraWebhookId: "901", jiraWebhookConnectionId: connectionId });
    const token = jira.tokenOf(connectionId);

    await as(t, "ann").mutation(api.integrations.disconnect, { connectionId });
    expect(await connectionRow(t, connectionId)).not.toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(team.webhooks.size).toBe(0);
    expect(jira.restCalls().map(({ method, token }) => ({ method, token }))).toEqual([
      { method: "DELETE", token },
      { method: "DELETE", token },
    ]);
    expect(await connectionRow(t, connectionId)).toBeNull();
  });

  it("leaves a webhook Jira won't delete to expire, and the row still goes", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team);
    team.webhooks.set("900", { url: "x", jqlFilter: "project = PROJ", events: [] });
    team.webhooks.set("901", { url: "y", jqlFilter: "project = PROJ", events: [] });
    jira.refuseNext("DELETE", "/rest/api/3/webhook?webhookIds=900", 500);

    await t.action(internal.integrations.jira.finalizeDisconnect, { connectionId, webhookIds: ["900", "901"] });

    expect([...team.webhooks.keys()]).toEqual(["900"]);
    expect(await connectionRow(t, connectionId)).toBeNull();
  });

  it("deletes the row of a connection that can't act, its webhooks left to expire", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team, { stale: true });
    jira.revoke(connectionId);
    team.webhooks.set("900", { url: "x", jqlFilter: "project = PROJ", events: [] });

    await t.action(internal.integrations.jira.finalizeDisconnect, { connectionId, webhookIds: ["900"] });

    expect(team.webhooks.has("900")).toBe(true);
    expect(jira.restCalls()).toEqual([]);
    expect(await connectionRow(t, connectionId)).toBeNull();
  });
});

describe("pushing an estimate", () => {
  // From the reveal on, through the decision, in jiraEstimatePush.test.ts.
  it("writes the story points and a comment to the issue, as the push's connection, and reports back", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team", { issues: { "PROJ-1": "Login form" } });
    const connectionId = await jira.connect(t, await seedPerson(t, "ann"), team);
    const mappingId = await seedMapping(t, connectionId);

    await t.action(internal.integrations.jira.pushEstimate, {
      push: {
        mappingId,
        connectionId,
        site: team.url,
        issueKey: "PROJ-1",
        fieldId: "customfield_10016",
        estimate: { label: "1", value: 1 },
        settledAt: 1_000,
      },
    });

    const issue = team.issues.get("PROJ-1")!;
    expect(issue.fields).toEqual({ customfield_10016: 1 });
    expect(issue.comments).toEqual(["Estimated at 1 point via AgileKit"]);
    for (const call of jira.restCalls()) expect(call).toMatchObject({ site: team.url, token: jira.tokenOf(connectionId) });
    expect((await mappingRow(t, mappingId))?.lastPush).toEqual({
      at: 1_000,
      issueKey: "PROJ-1",
      estimate: "1",
      outcome: "pushed",
    });
  });
});

describe("the token-refresh sweep", () => {
  it("refreshes each expiring connection through Atlassian, and one that is refused stops none of the rest", async () => {
    const t = convexTest(schema, modules);
    const team = jira.site("team");
    const expiring = await jira.connect(t, await seedPerson(t, "ann"), team, { stale: true });
    const revoked = await jira.connect(t, await seedPerson(t, "bob"), team, { stale: true });
    const fresh = await jira.connect(t, await seedPerson(t, "cy"), team);
    jira.revoke(revoked);
    const [revokedBefore, freshBefore] = await Promise.all([connectionRow(t, revoked), connectionRow(t, fresh)]);

    await t.action(internal.integrations.tokenRefresh.refreshExpiringTokens, {});

    const refreshed = (await connectionRow(t, expiring))!;
    expect(await TokenVault.decryptAccessToken(refreshed, TEST_VAULT_KEY)).toBe(jira.tokenOf(expiring));
    expect(refreshed.expiresAt).toBeGreaterThan(Date.now());
    expect(await connectionRow(t, revoked)).toEqual(revokedBefore);
    expect(await connectionRow(t, fresh)).toEqual(freshBefore);
    expect(jira.calls.filter((call) => call.site === "auth")).toHaveLength(2);
  });
});

/** Every module but tests, seeds and setups, as source text. */
const sources = import.meta.glob(
  ["./**/*.ts", "!./**/*.test.ts", "!./**/*.seeds.ts", "!./**/*.setup.ts", "!./_generated/**"],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

describe("Jira access is the one way to act on Jira", () => {
  it("no module but Jira access builds a Jira client (jiraAuth defines how)", () => {
    const building = Object.entries(sources)
      .filter(([, source]) => /\bbuildJiraClient\(|new JiraClient\(/.test(source))
      .map(([path]) => path);

    expect(building.sort()).toEqual(["./integrations/jiraAccess.ts", "./integrations/jiraAuth.ts"]);
  });
});
