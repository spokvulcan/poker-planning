/**
 * The Jira webhook reconcile's decision table, run without Jira: what a
 * mapping wants, what its record says, and what reconciling the two does.
 * The wiring (which caller hands over which case, which scheduled action a
 * decision lands on) is covered in integrationsModel.test.ts and
 * roomAggregate.test.ts.
 */
import { describe, it, expect } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  planDisconnect,
  planWebhook,
  recordedWebhookOf,
  settleRegistration,
  wantedWebhookOf,
  type RecordedWebhook,
  type Registration,
  type WantedWebhook,
} from "./jiraWebhookReconcile";

const C1 = "connection-1" as Id<"integrationConnections">;
const C2 = "connection-2" as Id<"integrationConnections">;

function mapping(fields: Partial<Doc<"integrationMappings">> = {}): Doc<"integrationMappings"> {
  return {
    _id: "mapping-1" as Id<"integrationMappings">,
    _creationTime: 0,
    roomId: "room-1" as Id<"rooms">,
    connectionId: C1,
    provider: "jira",
    jiraProjectKey: "PROJ",
    autoImport: false,
    autoPushEstimates: true,
    createdAt: 0,
    ...fields,
  };
}

describe("the webhook a mapping wants", () => {
  it("is one for its project, made with its own connection, while auto-push is on", () => {
    expect(wantedWebhookOf(mapping())).toEqual({ connectionId: C1, projectKey: "PROJ" });
  });

  it("is none with auto-push off", () => {
    expect(wantedWebhookOf(mapping({ autoPushEstimates: false }))).toBeNull();
  });

  it("is none without a project", () => {
    expect(wantedWebhookOf(mapping({ jiraProjectKey: undefined }))).toBeNull();
  });
});

describe("the webhook on record", () => {
  it("is none without a webhook id", () => {
    expect(recordedWebhookOf(mapping())).toBeNull();
  });

  it("is its id, the connection that made it and the project it was made for", () => {
    expect(
      recordedWebhookOf(
        mapping({
          connectionId: C2,
          jiraWebhookId: "wh-1",
          jiraWebhookConnectionId: C1,
          jiraWebhookProjectKey: "OLD",
        })
      )
    ).toEqual({ webhookId: "wh-1", connectionId: C1, projectKey: "OLD" });
  });

  it("falls back to the mapping's own connection, and no known project, for a webhook recorded before either was", () => {
    expect(recordedWebhookOf(mapping({ jiraWebhookId: "wh-1" }))).toEqual({
      webhookId: "wh-1",
      connectionId: C1,
      projectKey: undefined,
    });
  });
});

describe("planWebhook: wanted against recorded", () => {
  const wanted: WantedWebhook = { connectionId: C1, projectKey: "PROJ" };
  const serving: RecordedWebhook = { webhookId: "wh-1", connectionId: C1, projectKey: "PROJ" };

  it.each([
    ["nothing wanted, nothing recorded: nothing to do", null, null, { kind: "keep" }],
    ["nothing wanted, one recorded: remove it", null, serving, { kind: "remove", recorded: serving }],
    ["one wanted, nothing recorded: register it", wanted, null, { kind: "register", wanted }],
    ["the recorded one serves what is wanted: keep it", wanted, serving, { kind: "keep" }],
  ] as const)("%s", (_case, want, record, plan) => {
    expect(planWebhook(want, record, { renewal: false })).toEqual(plan);
  });

  it("replaces a webhook another connection made: the old one goes with its own connection", () => {
    const made = { webhookId: "wh-1", connectionId: C2, projectKey: "PROJ" };
    expect(planWebhook(wanted, made, { renewal: false })).toEqual({
      kind: "replace",
      recorded: made,
      wanted,
    });
  });

  it("replaces a webhook made for another project", () => {
    const made = { webhookId: "wh-1", connectionId: C1, projectKey: "OLD" };
    expect(planWebhook(wanted, made, { renewal: false })).toEqual({
      kind: "replace",
      recorded: made,
      wanted,
    });
  });

  it("replaces a webhook recorded before its project was, since nothing says it serves", () => {
    const legacy = { webhookId: "wh-1", connectionId: C1, projectKey: undefined };
    expect(planWebhook(wanted, legacy, { renewal: false })).toEqual({
      kind: "replace",
      recorded: legacy,
      wanted,
    });
  });

  it("renews even a serving webhook, before Jira drops it at 30 days", () => {
    expect(planWebhook(wanted, serving, { renewal: true })).toEqual({
      kind: "replace",
      recorded: serving,
      wanted,
    });
  });
});

describe("settleRegistration: a registration that landed", () => {
  const registered: Registration = {
    kind: "registered",
    webhookId: "wh-new",
    connectionId: C1,
    projectKey: "PROJ",
  };
  const made = { webhookId: "wh-new", connectionId: C1, projectKey: "PROJ" };

  it("records a webhook the mapping still wants", () => {
    expect(settleRegistration(mapping(), registered)).toEqual({
      kind: "record",
      webhook: made,
      superseded: null,
    });
  });

  it("records the newest webhook and removes the one it supersedes", () => {
    const older = mapping({
      jiraWebhookId: "wh-old",
      jiraWebhookConnectionId: C1,
      jiraWebhookProjectKey: "PROJ",
    });
    expect(settleRegistration(older, registered)).toEqual({
      kind: "record",
      webhook: made,
      superseded: { webhookId: "wh-old", connectionId: C1, projectKey: "PROJ" },
    });
  });

  it.each([
    ["auto-push was turned off", mapping({ autoPushEstimates: false })],
    ["the mapping moved to another connection", mapping({ connectionId: C2 })],
    ["the mapping moved to another project", mapping({ jiraProjectKey: "OTHER" })],
    ["the mapping is gone", null],
  ])("removes a webhook nobody wants any more, never recording it: %s", (_case, now) => {
    expect(settleRegistration(now, registered)).toEqual({ kind: "discard", webhook: made });
  });
});

describe("settleRegistration: a registration that failed", () => {
  const failed: Registration = {
    kind: "failed",
    failure: "missingSecret",
    connectionId: C1,
    projectKey: "PROJ",
  };

  it("records the failure on a mapping that still wants the webhook", () => {
    expect(settleRegistration(mapping(), failed)).toEqual({ kind: "fail", failure: "missingSecret" });
  });

  it.each([
    ["auto-push was turned off", mapping({ autoPushEstimates: false })],
    ["the mapping is gone", null],
    ["another registration put a live webhook on record", mapping({ jiraWebhookId: "wh-live" })],
  ])("ignores a failure that no longer says anything: %s", (_case, now) => {
    expect(settleRegistration(now, failed)).toEqual({ kind: "ignore" });
  });
});

describe("planDisconnect: a going connection's webhooks", () => {
  it("sends the ones it made through its tail, removes any other with its own connection, and skips mappings without one", () => {
    const plan = planDisconnect(C1, [
      mapping({ jiraWebhookId: "wh-made-here", jiraWebhookConnectionId: C1 }),
      mapping({ jiraWebhookId: "wh-recorded-before-connections-were" }),
      mapping({ jiraWebhookId: "wh-made-elsewhere", jiraWebhookConnectionId: C2, jiraWebhookProjectKey: "PROJ" }),
      mapping(),
    ]);

    expect(plan).toEqual({
      tail: ["wh-made-here", "wh-recorded-before-connections-were"],
      separately: [{ webhookId: "wh-made-elsewhere", connectionId: C2, projectKey: "PROJ" }],
    });
  });
});
