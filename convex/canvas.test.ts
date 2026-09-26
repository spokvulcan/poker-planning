/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// The room canvas (model/canvas.ts): what each node type's life looks like,
// told through the acts that shape the board.

const modules = import.meta.glob("./**/*.*s");

const seedUser = (t: T, authUserId: string) => seedNamedUser(t, authUserId, authUserId);
const as = (t: T, subject: string) => t.withIdentity({ subject });
const join = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });
const nodesOf = (t: T, roomId: Id<"rooms">) =>
  t.run((ctx) =>
    ctx.db
      .query("canvasNodes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
const nodeIds = async (t: T, roomId: Id<"rooms">) => (await nodesOf(t, roomId)).map((n) => n.nodeId).sort();

async function pokerRoom(t: T) {
  const ownerId = await seedUser(t, "owner");
  const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
  return { roomId, ownerId };
}

describe("a new board", () => {
  it("a poker room starts with its timer, its session node and its owner's player node", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId } = await pokerRoom(t);

    expect(await nodeIds(t, roomId)).toEqual([`player-${ownerId}`, "session-current", "timer"].sort());
  });

  it("a retro starts with its retro node, timer, action items and a pad per column, and no player nodes", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "owner");
    const roomId = await as(t, "owner").mutation(api.retro.create, { name: "Sprint 41 retro" });
    await join(t, roomId, "ann");

    expect(await nodeIds(t, roomId)).toEqual(["actions", "pad-c1", "pad-c2", "pad-c3", "retro", "timer"]);
  });
});

describe("members", () => {
  it("a poker member's player node comes and goes with them", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await pokerRoom(t);
    const annId = await join(t, roomId, "ann");
    expect(await nodeIds(t, roomId)).toContain(`player-${annId}`);

    await as(t, "ann").mutation(api.users.leave, { roomId, userId: annId });
    expect(await nodeIds(t, roomId)).not.toContain(`player-${annId}`);
  });

  it("a legacy room with no roomType is planning poker, player nodes and all", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await t.run((ctx) =>
      ctx.db.insert("rooms", {
        name: "Legacy",
        autoCompleteVoting: false,
        isGameOver: false,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        retained: false,
      })
    );
    const annId = await join(t, roomId, "ann");

    expect(await nodeIds(t, roomId)).toContain(`player-${annId}`);
  });
});

describe("the round", () => {
  it("a reveal brings the results node, once", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await pokerRoom(t);

    await as(t, "owner").mutation(api.rooms.showCards, { roomId });
    await as(t, "owner").mutation(api.rooms.resetGame, { roomId });
    await as(t, "owner").mutation(api.rooms.showCards, { roomId });

    expect((await nodeIds(t, roomId)).filter((id) => id === "results")).toHaveLength(1);
  });
});

describe("discussion notes", () => {
  async function withIssue(t: T, roomId: Id<"rooms">, title: string) {
    return t.run((ctx) =>
      ctx.db.insert("issues", { roomId, sequentialId: 1, title, status: "pending", createdAt: Date.now(), order: 0 })
    );
  }

  it("opens only for an issue of the room itself", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId } = await pokerRoom(t);
    await seedUser(t, "other");
    const otherRoom = await as(t, "other").mutation(api.rooms.create, { name: "Elsewhere" });
    const secret = await withIssue(t, otherRoom, "Someone else's secret");

    await expect(
      as(t, "owner").mutation(api.canvas.createNote, { roomId, issueId: secret, userId: ownerId })
    ).rejects.toThrow("Issue not found");
    expect(JSON.stringify(await nodesOf(t, roomId))).not.toContain("secret");
  });

  it("goes with its issue", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId } = await pokerRoom(t);
    const issueId = await withIssue(t, roomId, "Login");
    await as(t, "owner").mutation(api.canvas.createNote, { roomId, issueId, userId: ownerId });
    expect(await nodeIds(t, roomId)).toContain(`note-${issueId}`);

    await as(t, "owner").mutation(api.issues.remove, { issueId });

    expect(await nodeIds(t, roomId)).not.toContain(`note-${issueId}`);
  });

  it("isn't a retro's", async () => {
    const t = withComponents(convexTest(schema, modules));
    const ownerId = await seedUser(t, "owner");
    const retroId = await as(t, "owner").mutation(api.retro.create, { name: "Sprint 41 retro" });
    const issueId = await withIssue(t, retroId, "Stray");

    await expect(
      as(t, "owner").mutation(api.canvas.createNote, { roomId: retroId, issueId, userId: ownerId })
    ).rejects.toThrow("does not apply");
  });
});

describe("moving nodes", () => {
  it("puts every node of a drop where it was dropped, in one write, skipping one that went away", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId } = await pokerRoom(t);

    await as(t, "owner").mutation(api.canvas.moveNodes, {
      roomId,
      userId: ownerId,
      moves: [
        { nodeId: "timer", position: { x: 10, y: 20 } },
        { nodeId: "session-current", position: { x: 30, y: 40 } },
        { nodeId: "gone", position: { x: 0, y: 0 } },
      ],
    });

    const byId = new Map((await nodesOf(t, roomId)).map((n) => [n.nodeId, n.position]));
    expect(byId.get("timer")).toEqual({ x: 10, y: 20 });
    expect(byId.get("session-current")).toEqual({ x: 30, y: 40 });
  });

  it("refuses a place that is off the board", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId } = await pokerRoom(t);

    await expect(
      as(t, "owner").mutation(api.canvas.moveNodes, {
        roomId,
        userId: ownerId,
        moves: [{ nodeId: "timer", position: { x: Number.NaN, y: 0 } }],
      })
    ).rejects.toThrow();
  });
});
