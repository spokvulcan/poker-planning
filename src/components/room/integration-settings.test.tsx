/**
 * The room's Jira settings show a failed webhook registration. The reconcile
 * records why the registration failed on the mapping, and the section reads
 * it from the mapping it already subscribes to, so the person who saved the
 * mapping sees it moments after the save.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Stable fakes: the section's effects depend on these references.
const convex = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  mutate: () => Promise.resolve(undefined),
  act: () => Promise.resolve([]),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (query: Parameters<typeof getFunctionName>[0]) =>
      convex.results.get(getFunctionName(query)),
    useMutation: () => convex.mutate,
    useAction: () => convex.act,
  };
});

vi.mock("@/lib/toast", () => ({
  toast: { success: () => {}, error: () => {} },
}));

import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { IntegrationSettingsSection } from "./integration-settings";

const ROOM_ID = "room-1" as Id<"rooms">;
const CONNECTION_ID = "connection-1" as Id<"integrationConnections">;

function showMapping(fields: Partial<Doc<"integrationMappings">>) {
  convex.results.set(getFunctionName(api.integrations.getConnections), [
    { _id: CONNECTION_ID, provider: "jira", connectedAt: 0, scopes: [] },
  ]);
  convex.results.set(getFunctionName(api.integrations.getRoomMapping), {
    _id: "mapping-1",
    _creationTime: 0,
    roomId: ROOM_ID,
    connectionId: CONNECTION_ID,
    provider: "jira",
    jiraProjectKey: "PROJ",
    autoImport: false,
    autoPushEstimates: true,
    createdAt: 0,
    ...fields,
  });
  render(<IntegrationSettingsSection roomId={ROOM_ID} />);
}

afterEach(() => {
  cleanup();
  convex.results.clear();
});

describe("a failed webhook registration", () => {
  it("says the server has no webhook secret when that is why", () => {
    showMapping({ jiraWebhookFailure: "missingSecret" });

    expect(screen.getByRole("alert").textContent).toContain(
      "the server has no Jira webhook secret configured"
    );
  });

  it("says Jira refused the webhook, and that saving again retries", () => {
    showMapping({ jiraWebhookFailure: "jiraError" });

    expect(screen.getByRole("alert").textContent).toContain(
      "Jira didn't accept the webhook. Save again to retry."
    );
  });

  it("shows nothing while no registration has failed", () => {
    showMapping({ jiraWebhookId: "wh-live" });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
