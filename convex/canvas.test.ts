/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// Discussion notes on the planning canvas (convex/canvas.ts). A note lives in
// one room and shows its issue's title to everyone there, so a call made in
// one room never reaches an issue or a note in another.

const modules = import.meta.glob("./**/*.*s");

const as = (t: T, subject: string) => t.withIdentity({ subject });

/** A user row whose name doubles as its auth subject. */
const seedUser = (t: T, subject: string) => seedNamedUser(t, subject, subject);

/** Joins a room the way the app does. */
const join = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/** "ann" opens and joins room A, "bob" room B, and each adds an issue to their room. */
async function seedTwoRooms(t: T) {
  const annId = await seedUser(t, "ann");
  const bobId = await seedUser(t, "bob");
  const roomA = await as(t, "ann").mutation(api.rooms.create, { name: "Room A" });
  await join(t, roomA, "ann");
  const roomB = await as(t, "bob").mutation(api.rooms.create, { name: "Room B" });
  await join(t, roomB, "bob");
  const issueA = await as(t, "ann").mutation(api.issues.create, { roomId: roomA, title: "Room A issue" });
  const issueB = await as(t, "bob").mutation(api.issues.create, { roomId: roomB, title: "Room B issue" });
  return { roomA, annId, roomB, bobId, issueA, issueB };
}

const notesIn = async (t: T, who: string, roomId: Id<"rooms">) =>
  (await as(t, who).query(api.canvas.getCanvasNodes, { roomId })).filter((n) => n.type === "note");

describe("canvas.createNote", () => {
  it("makes one note for an issue in the room, carrying its title", async () => {
    const t = convexTest(schema, modules);
    const { roomA, annId, issueA } = await seedTwoRooms(t);
    const noteInA = () =>
      as(t, "ann").mutation(api.canvas.createNote, { roomId: roomA, issueId: issueA, userId: annId });

    const noteId = await noteInA();
    // Asking again hands back the same note instead of adding a second one.
    expect(await noteInA()).toBe(noteId);

    expect(await notesIn(t, "ann", roomA)).toEqual([
      expect.objectContaining({
        nodeId: `note-${issueA}`,
        data: expect.objectContaining({ issueTitle: "Room A issue", content: "" }),
      }),
    ]);
  });

  it("refuses an issue from another room and copies nothing into the caller's", async () => {
    const t = convexTest(schema, modules);
    const { roomA, annId, roomB, issueB } = await seedTwoRooms(t);
    const noteInA = () =>
      as(t, "ann").mutation(api.canvas.createNote, { roomId: roomA, issueId: issueB, userId: annId });

    await expect(noteInA()).rejects.toThrow("Issue not found");
    // Being in room B as well changes nothing: the title would still show to all of room A.
    await join(t, roomB, "ann");
    await expect(noteInA()).rejects.toThrow("Issue not found");

    expect(await notesIn(t, "ann", roomA)).toEqual([]);
  });
});

describe("canvas.updateNoteContent and canvas.deleteNote", () => {
  it("can't reach a note in another room", async () => {
    const t = convexTest(schema, modules);
    const { roomA, annId, roomB, bobId, issueB } = await seedTwoRooms(t);
    await as(t, "bob").mutation(api.canvas.createNote, { roomId: roomB, issueId: issueB, userId: bobId });
    const nodeId = `note-${issueB}`;
    const ann = as(t, "ann");

    await expect(
      ann.mutation(api.canvas.updateNoteContent, { roomId: roomA, nodeId, content: "Overwritten", userId: annId })
    ).rejects.toThrow("Note node not found");
    await expect(ann.mutation(api.canvas.deleteNote, { roomId: roomA, nodeId, userId: annId })).rejects.toThrow(
      "Note node not found"
    );

    expect(await notesIn(t, "bob", roomB)).toEqual([
      expect.objectContaining({ nodeId, data: expect.objectContaining({ issueTitle: "Room B issue", content: "" }) }),
    ]);
  });
});
