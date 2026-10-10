/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// Starting a vote from the issue list (convex/issues.ts). A round runs in one
// room and writes its status, timing and results onto its issue, so the issue
// has to be in that room.

const modules = import.meta.glob("./**/*.*s");

const as = (t: T, subject: string) => t.withIdentity({ subject });

/** A user row whose name doubles as its auth subject. */
const seedUser = (t: T, subject: string) => seedNamedUser(t, subject, subject);

/** Joins a room the way the app does. */
const join = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/** "ann" opens and joins room A, "bob" room B, and each adds an issue to their room. */
async function seedTwoRooms(t: T) {
  await seedUser(t, "ann");
  await seedUser(t, "bob");
  const roomA = await as(t, "ann").mutation(api.rooms.create, { name: "Room A" });
  await join(t, roomA, "ann");
  const roomB = await as(t, "bob").mutation(api.rooms.create, { name: "Room B" });
  await join(t, roomB, "bob");
  const issueA = await as(t, "ann").mutation(api.issues.create, { roomId: roomA, title: "Room A issue" });
  const issueB = await as(t, "bob").mutation(api.issues.create, { roomId: roomB, title: "Room B issue" });
  return { roomA, roomB, issueA, issueB };
}

const issueRow = (t: T, issueId: Id<"issues">) => t.run((ctx) => ctx.db.get("issues", issueId));

const timingsFor = (t: T, issueId: Id<"issues">) =>
  t.run((ctx) =>
    ctx.db.query("votingTimestamps").withIndex("by_issue", (q) => q.eq("issueId", issueId)).collect()
  );

describe("issues.startVoting", () => {
  it("starts a round on an issue in the room", async () => {
    const t = convexTest(schema, modules);
    const { roomA, issueA } = await seedTwoRooms(t);

    await as(t, "ann").mutation(api.issues.startVoting, { roomId: roomA, issueId: issueA });

    expect(await as(t, "ann").query(api.issues.getCurrent, { roomId: roomA })).toMatchObject({
      _id: issueA,
      status: "voting",
    });
    expect(await timingsFor(t, issueA)).toHaveLength(1);
  });

  it("refuses an issue from another room and leaves that issue untouched", async () => {
    const t = convexTest(schema, modules);
    const { roomA, roomB, issueB } = await seedTwoRooms(t);
    const before = await issueRow(t, issueB);
    const startInA = () => as(t, "ann").mutation(api.issues.startVoting, { roomId: roomA, issueId: issueB });

    await expect(startInA()).rejects.toThrow("Issue not found");
    // Being in room B as well changes nothing: room A's round would still write onto B's issue.
    await join(t, roomB, "ann");
    await expect(startInA()).rejects.toThrow("Issue not found");

    expect(await issueRow(t, issueB)).toEqual(before);
    expect(await timingsFor(t, issueB)).toEqual([]);
    expect(await as(t, "ann").query(api.issues.getCurrent, { roomId: roomA })).toBeNull();
  });
});

describe("a write addressed by an issue", () => {
  // It lands in the issue's own room: the room-scoped step loads the issue and
  // seats the caller in that room, whatever room the caller is in.

  const WRITES = [
    {
      write: "updateTitle",
      run: (who: ReturnType<typeof as>, issueId: Id<"issues">) =>
        who.mutation(api.issues.updateTitle, { issueId, title: "Renamed" }),
    },
    {
      write: "updateEstimate",
      run: (who: ReturnType<typeof as>, issueId: Id<"issues">) =>
        who.mutation(api.issues.updateEstimate, { issueId, finalEstimate: "8" }),
    },
    {
      write: "remove",
      run: (who: ReturnType<typeof as>, issueId: Id<"issues">) => who.mutation(api.issues.remove, { issueId }),
    },
  ];

  it.each(WRITES)("$write refuses an issue from a room the caller isn't in, leaving it as it was", async ({ run }) => {
    const t = convexTest(schema, modules);
    const { issueB } = await seedTwoRooms(t);
    const before = await issueRow(t, issueB);

    await expect(run(as(t, "ann"), issueB)).rejects.toMatchObject({
      data: { code: "forbidden", message: "Not a member of this room" },
    });
    expect(await issueRow(t, issueB)).toEqual(before);
  });

  it.each(WRITES)("$write refuses an issue that is gone as missing", async ({ run }) => {
    const t = convexTest(schema, modules);
    const { issueA } = await seedTwoRooms(t);
    await as(t, "ann").mutation(api.issues.remove, { issueId: issueA });

    await expect(run(as(t, "ann"), issueA)).rejects.toMatchObject({
      data: { code: "missing", message: "Issue not found" },
    });
  });
});
