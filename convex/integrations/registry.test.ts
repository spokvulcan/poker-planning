/**
 * The provider registry: pure descriptor tests. The end-to-end routing (which
 * scheduled action a model write lands on) is covered in
 * integrationsModel.test.ts / roomAggregate.test.ts via the scheduled-jobs
 * assertions.
 */
import { describe, it, expect } from "vitest";
import {
  getProviderHandler,
  registeredProviders,
} from "./registry";
import type { Doc } from "../_generated/dataModel";

describe("registeredProviders", () => {
  it("registers exactly jira today", () => {
    expect(registeredProviders()).toEqual(["jira"]);
  });
});

describe("getProviderHandler", () => {
  it("returns the jira handler with every seam wired", () => {
    const handler = getProviderHandler("jira");
    expect(handler.registerWebhook).toBeDefined();
    expect(handler.deregisterWebhook).toBeDefined();
    expect(handler.finalizeDisconnect).toBeDefined();
    expect(typeof handler.webhookIdOf).toBe("function");
    expect(typeof handler.hasWebhookTarget).toBe("function");
    expect(typeof handler.refreshConnection).toBe("function");
  });

  it("throws on a provider with no registered adapter", () => {
    // "github" is in the schema union but has no adapter yet (spec 07) — a
    // silent skip would leak remote webhooks, so this must throw.
    expect(() => getProviderHandler("github")).toThrow(
      'No integration handler registered for provider "github"'
    );
  });
});

describe("jira handler accessors", () => {
  const mapping = {
    jiraWebhookId: "wh-1",
  } as Doc<"integrationMappings">;

  it("webhookIdOf reads the jira webhook column", () => {
    const handler = getProviderHandler("jira");
    expect(handler.webhookIdOf(mapping)).toBe("wh-1");
    expect(
      handler.webhookIdOf({} as Doc<"integrationMappings">)
    ).toBeUndefined();
  });

  it("hasWebhookTarget requires the project key", () => {
    const handler = getProviderHandler("jira");
    expect(handler.hasWebhookTarget({ projectKey: "PROJ" })).toBe(true);
    expect(handler.hasWebhookTarget({})).toBe(false);
  });
});
