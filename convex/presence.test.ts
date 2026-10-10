/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";

// Presence (convex/presence.ts): each browser in a room heartbeats, and the
// room lists who is online. The presence component lists whichever user a
// heartbeat names, so a heartbeat names its user, and the server takes it
// only from the person signed in, seated in that room.

const modules = import.meta.glob("./**/*.*s");

/** A planning poker room its owner opened, with the guest "ann" in it. */
async function pokerRoomWithAnn(t: T) {
  const ownerId = await seedUser(t, "owner");
  const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
  const annId = await join(t, roomId, "ann");
  return { roomId, ownerId, annId };
}

/** A heartbeat from the browser signed in as `subject`, naming `userId`, as the presence hook sends it. */
const heartbeat = (t: T, subject: string, roomId: Id<"rooms">, userId: Id<"users">) =>
  as(t, subject).mutation(api.presence.heartbeat, { roomId, userId, sessionId: `${subject}-tab`, interval: 10_000 });

describe("who a heartbeat is from", () => {
  it("a member heartbeats as themselves, and the room lists them online", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, annId } = await pokerRoomWithAnn(t);

    const { roomToken } = await heartbeat(t, "ann", roomId, annId);

    expect(await t.query(api.presence.list, { roomToken })).toMatchObject([{ userId: annId, online: true }]);
  });

  it("a member can't heartbeat as someone else in the room", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId } = await pokerRoomWithAnn(t);

    await expect(heartbeat(t, "ann", roomId, ownerId)).rejects.toThrow("Cannot heartbeat as another user");
  });

  it("someone outside the room can't heartbeat into it, as themselves or as a member", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, annId } = await pokerRoomWithAnn(t);
    const bobId = await seedUser(t, "bob");
    const outsider = { data: { code: "forbidden", message: "Not a member of this room" } };

    await expect(heartbeat(t, "bob", roomId, bobId)).rejects.toMatchObject(outsider);
    await expect(heartbeat(t, "bob", roomId, annId)).rejects.toMatchObject(outsider);
  });
});
