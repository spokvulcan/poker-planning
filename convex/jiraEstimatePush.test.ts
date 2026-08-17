/// <reference types="vite/client" />
/**
 * The reveal → Jira estimate push seam:
 *  - the voting round's reveal schedules the push exactly when the issue is
 *    Jira-linked and the room mapping has auto-push on (scheduled-jobs
 *    assertions — the job may fire mid-test on real timers and fail closed on
 *    the seed tokens; the row persists either way, so assertions match on
 *    args, not state);
 *  - the push itself is covered through pushEstimateWithClient with an
 *    injected client — the registered action is only ctx plumbing around it.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import * as VotingRound from "./model/votingRound";
import { pushEstimateWithClient } from "./integrations/jira";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

async function scheduledPushes(t: T) {
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  );
  return scheduled.filter((s) => s.name.endsWith(":pushEstimateToJira"));
}

async function seedUser(t: T): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId: `auth-${crypto.randomUUID()}`,
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
      expiresAt: Date.now() + 3_600_000,
      cloudId: "cloud-1",
      siteUrl: "https://team.atlassian.net",
      scopes: [],
      connectedAt: Date.now(),
      lastRefreshedAt: Date.now(),
    })
  );
}

/** A room mid-round on an issue target, with two agreeing votes (consensus "5"). */
async function seedRoomMidRound(t: T): Promise<{
  roomId: Id<"rooms">;
  issueId: Id<"issues">;
}> {
  return t.run(async (ctx) => {
    const roomId = await ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    });
    const issueId = await ctx.db.insert("issues", {
      roomId,
      sequentialId: 1,
      title: "PROJ-1 - Thing",
      status: "voting",
      createdAt: Date.now(),
      order: 0,
    });
    await ctx.db.patch(roomId, { currentIssueId: issueId });
    for (const auth of ["auth-v1", "auth-v2"]) {
      const voterId = await ctx.db.insert("users", {
        authUserId: auth,
        name: "V",
        createdAt: Date.now(),
      });
      await ctx.db.insert("votes", {
        roomId,
        userId: voterId,
        cardLabel: "5",
        cardValue: 5,
      });
    }
    return { roomId, issueId };
  });
}

async function seedMapping(
  t: T,
  roomId: Id<"rooms">,
  connectionId: Id<"integrationConnections">,
  autoPushEstimates: boolean
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("integrationMappings", {
      roomId,
      connectionId,
      provider: "jira",
      jiraProjectKey: "PROJ",
      storyPointsFieldId: "customfield_10016",
      autoImport: false,
      autoPushEstimates,
      createdAt: Date.now(),
    })
  );
}

describe("reveal schedules the Jira estimate push", () => {
  it("schedules pushEstimateToJira with the consensus estimate when linked + auto-push on", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const connectionId = await seedConnection(t, userId);
    const { roomId, issueId } = await seedRoomMidRound(t);
    await seedMapping(t, roomId, connectionId, true);
    await t.run((ctx) =>
      ctx.db.insert("issueLinks", {
        issueId,
        provider: "jira",
        externalId: "PROJ-1",
        externalUrl: "https://team.atlassian.net/browse/PROJ-1",
        lastSyncedAt: Date.now(),
      })
    );

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));

    const pushes = await scheduledPushes(t);
    expect(pushes).toHaveLength(1);
    expect(
      (pushes[0].args as [{ issueId: string; finalEstimate: string }])[0]
    ).toEqual({ issueId, finalEstimate: "5" });
  });

  it("schedules nothing when auto-push is off or the issue is not linked", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const connectionId = await seedConnection(t, userId);
    const { roomId } = await seedRoomMidRound(t);
    await seedMapping(t, roomId, connectionId, false); // off

    await t.run((ctx) => VotingRound.reveal(ctx, roomId));
    expect(await scheduledPushes(t)).toHaveLength(0);
  });
});

describe("pushEstimateWithClient (injected client)", () => {
  function recordingClient() {
    return {
      updateStoryPoints: vi.fn(async () => {}),
      addComment: vi.fn(async () => {}),
    };
  }

  it("pushes the numeric estimate and the AgileKit comment", async () => {
    const client = recordingClient();
    const pushed = await pushEstimateWithClient(client, {
      externalId: "PROJ-1",
      storyPointsFieldId: "customfield_10016",
      finalEstimate: "5",
    });
    expect(pushed).toBe(true);
    expect(client.updateStoryPoints).toHaveBeenCalledWith(
      "PROJ-1",
      "customfield_10016",
      5
    );
    expect(client.addComment).toHaveBeenCalledWith(
      "PROJ-1",
      "Estimated at 5 points via AgileKit"
    );
  });

  it("singularizes the comment for a 1-point estimate", async () => {
    const client = recordingClient();
    await pushEstimateWithClient(client, {
      externalId: "PROJ-1",
      storyPointsFieldId: "customfield_10016",
      finalEstimate: "1",
    });
    expect(client.addComment).toHaveBeenCalledWith(
      "PROJ-1",
      "Estimated at 1 point via AgileKit"
    );
  });

  it("skips non-numeric estimates without touching Jira", async () => {
    const client = recordingClient();
    const pushed = await pushEstimateWithClient(client, {
      externalId: "PROJ-1",
      storyPointsFieldId: "customfield_10016",
      finalEstimate: "XL",
    });
    expect(pushed).toBe(false);
    expect(client.updateStoryPoints).not.toHaveBeenCalled();
    expect(client.addComment).not.toHaveBeenCalled();
  });

  it("skips when no story points field is configured", async () => {
    const client = recordingClient();
    const pushed = await pushEstimateWithClient(client, {
      externalId: "PROJ-1",
      finalEstimate: "5",
    });
    expect(pushed).toBe(false);
    expect(client.updateStoryPoints).not.toHaveBeenCalled();
  });

  it("swallows a Jira failure — the push is a reveal side effect", async () => {
    const client = {
      updateStoryPoints: vi.fn(async () => {
        throw new Error("Jira API down");
      }),
      addComment: vi.fn(async () => {}),
    };
    const pushed = await pushEstimateWithClient(client, {
      externalId: "PROJ-1",
      storyPointsFieldId: "customfield_10016",
      finalEstimate: "5",
    });
    expect(pushed).toBe(false);
  });
});
