/**
 * The room's Jira settings show a failed webhook registration. The reconcile
 * records why the registration failed on the mapping, and the section reads
 * it from the mapping it already subscribes to, so the person who saved the
 * mapping sees it moments after the save: the save's toast waits for the
 * registration, and says when it failed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

// Stable fakes: the section's effects depend on these references.
const convex = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  mutate: () => Promise.resolve(undefined),
  act: () => Promise.resolve([]),
}));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (query: Parameters<typeof getFunctionName>[0]) =>
      convex.results.get(getFunctionName(query)),
    useMutation: () => convex.mutate,
    useAction: () => convex.act,
  };
});

vi.mock("@/lib/toast", () => ({ toast: toasts }));

import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { IntegrationSettingsSection } from "./integration-settings";

const ROOM_ID = "room-1" as Id<"rooms">;
const CONNECTION_ID = "connection-1" as Id<"integrationConnections">;

/** The room's mapping as the section's subscription has it. */
function mappingIs(fields: Partial<Doc<"integrationMappings">>) {
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
}

function showMapping(fields: Partial<Doc<"integrationMappings">>) {
  convex.results.set(getFunctionName(api.integrations.getConnections), [
    { _id: CONNECTION_ID, provider: "jira", connectedAt: 0, scopes: [] },
  ]);
  mappingIs(fields);
  const view = render(<IntegrationSettingsSection roomId={ROOM_ID} />);
  return {
    save: () => act(async () => fireEvent.click(screen.getByRole("button", { name: "Update Mapping" }))),
    /** The mapping changes on the server, and the subscription brings it. */
    serverHas: (next: Partial<Doc<"integrationMappings">>) => {
      mappingIs(next);
      view.rerender(<IntegrationSettingsSection roomId={ROOM_ID} />);
    },
  };
}

afterEach(() => {
  cleanup();
  convex.results.clear();
  toasts.success.mockClear();
  toasts.error.mockClear();
});

describe("saving the mapping", () => {
  it("says it's saved once the webhook it wants is registered", async () => {
    // Just saved: the webhook the mapping wants is being registered.
    const section = showMapping({});
    await section.save();
    expect(toasts.success).not.toHaveBeenCalled();

    section.serverHas({ jiraWebhookId: "wh-new" });

    expect(toasts.success).toHaveBeenCalledWith("Jira mapping saved");
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("says the webhook failed, and why, when its registration fails", async () => {
    const section = showMapping({});
    await section.save();

    section.serverHas({ jiraWebhookFailure: "missingSecret" });

    expect(toasts.success).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("Jira mapping saved, but its webhook failed", {
      description: expect.stringContaining("the server has no Jira webhook secret configured"),
    });
  });

  it("says it's saved at once when the mapping wants no webhook, or keeps the one it has", async () => {
    await showMapping({ autoPushEstimates: false }).save();
    cleanup();
    await showMapping({ jiraWebhookId: "wh-live" }).save();

    expect(toasts.success.mock.calls).toEqual([["Jira mapping saved"], ["Jira mapping saved"]]);
  });
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
