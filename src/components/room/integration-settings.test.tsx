/**
 * The room's Jira settings show a failed webhook registration and how the
 * last estimate's push went. The reconcile records why a registration failed
 * on the mapping, and the estimate push how the last push went; the section
 * reads both from the mapping it already subscribes to, so the person who
 * saved the mapping sees a failed registration moments after the save: the
 * save's toast waits for the registration, and says when it failed. A mapping
 * that pushes estimates can't be saved without the field they go to.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ConvexError } from "convex/values";

// Stable fakes: the section's effects depend on these references.
const convex = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  saved: vi.fn(() => Promise.resolve(undefined as unknown)),
  act: () => Promise.resolve([]),
}));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (query: Parameters<typeof getFunctionName>[0]) =>
      convex.results.get(getFunctionName(query)),
    useMutation: () => convex.saved,
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
    storyPointsFieldId: "customfield_10016",
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
  convex.saved.mockReset();
  convex.saved.mockImplementation(() => Promise.resolve(undefined));
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

describe("pushing estimates", () => {
  const updateButton = () => screen.getByRole("button", { name: "Update Mapping" }) as HTMLButtonElement;

  it("won't save auto-push without the field estimates go to, and says so", async () => {
    showMapping({ storyPointsFieldId: undefined, jiraWebhookId: "wh-live" });

    expect(screen.getByText("Choose the story points field to push estimates to.")).not.toBeNull();
    expect(updateButton().disabled).toBe(true);

    await act(async () =>
      fireEvent.change(screen.getByPlaceholderText("e.g., customfield_10016"), {
        target: { value: "customfield_10016" },
      })
    );
    expect(updateButton().disabled).toBe(false);
  });

  it("keeps what is being typed when an estimate is pushed meanwhile", async () => {
    const section = showMapping({ storyPointsFieldId: undefined, jiraWebhookId: "wh-live" });
    const field = screen.getByPlaceholderText("e.g., customfield_10016") as HTMLInputElement;
    await act(async () => fireEvent.change(field, { target: { value: "customfield_100" } }));

    // A reveal records how its push went on the mapping, while the field is half typed.
    section.serverHas({
      storyPointsFieldId: undefined,
      jiraWebhookId: "wh-live",
      lastPush: { at: 1, issueKey: "PROJ-1", estimate: "5", outcome: "noField" },
    });

    expect(field.value).toBe("customfield_100");
  });

  it("shows the server's words when it refuses a save", async () => {
    convex.saved.mockImplementation(() =>
      Promise.reject(new ConvexError({ code: "forbidden", message: "Only facilitators and the owner can do this." }))
    );
    const section = showMapping({});

    await section.save();

    expect(toasts.error).toHaveBeenCalledWith("Only facilitators and the owner can do this.");
  });

  it("says the last estimate went, and to which issue", () => {
    showMapping({ lastPush: { at: 0, issueKey: "PROJ-1", estimate: "5", outcome: "pushed" } });

    expect(screen.getByRole("status").textContent).toBe("Last estimate pushed: 5 to PROJ-1.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why the last estimate didn't go, with Jira's own words when Jira refused it", () => {
    showMapping({
      lastPush: {
        at: 0,
        issueKey: "PROJ-1",
        estimate: "5",
        outcome: "refused",
        message: "Field 'customfield_10016' cannot be set.",
      },
    });

    const alert = screen.getByRole("alert").textContent;
    expect(alert).toContain("PROJ-1's estimate wasn't pushed: Jira refused it.");
    expect(alert).toContain("Field 'customfield_10016' cannot be set.");
  });

  it("says an issue from another site wasn't pushed to the same key on this one", () => {
    showMapping({ lastPush: { at: 0, issueKey: "PROJ-1", estimate: "5", outcome: "otherSite" } });

    expect(screen.getByRole("alert").textContent).toContain("imported from another Jira site");
  });

  it("says nothing of the last push while the mapping doesn't push estimates", () => {
    showMapping({
      autoPushEstimates: false,
      lastPush: { at: 0, issueKey: "PROJ-1", estimate: "XL", outcome: "notANumber" },
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
