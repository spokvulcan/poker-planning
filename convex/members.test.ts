/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";

// A member's own writes in a room (convex/users.ts): renaming themselves,
// sitting out as a spectator and leaving. They are whoever is signed in: the
// user id old browsers still send with one is accepted and ignored, never
// compared.

const modules = import.meta.glob("./**/*.*s");

/** A planning poker room its owner opened, with the guest "ann" in it. */
async function pokerRoomWithAnn(t: T) {
  const ownerId = await seedUser(t, "owner");
  const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
  const annId = await join(t, roomId, "ann");
  return { roomId, ownerId, annId };
}

const seatOf = (t: T, roomId: Id<"rooms">, userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db
      .query("roomMemberships")
      .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .first()
  );

const nameOf = async (t: T, userId: Id<"users">) => (await t.run((ctx) => ctx.db.get("users", userId)))?.name;

describe("who a member's own write is from", () => {
  it("an edit is the caller's, whatever user id comes with it, or none", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId, annId } = await pokerRoomWithAnn(t);

    await as(t, "ann").mutation(api.users.edit, { roomId, userId: ownerId, name: "Ann B", isSpectator: true });
    await as(t, "owner").mutation(api.users.edit, { roomId, name: "Olga" });

    expect(await seatOf(t, roomId, annId)).toMatchObject({ isSpectator: true });
    expect(await nameOf(t, annId)).toBe("Ann B");
    expect(await seatOf(t, roomId, ownerId)).toMatchObject({ isSpectator: false });
    expect(await nameOf(t, ownerId)).toBe("Olga");
  });

  it("leaving is the caller's, whatever user id comes with it, or none", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, ownerId, annId } = await pokerRoomWithAnn(t);
    const bobId = await join(t, roomId, "bob");

    await as(t, "ann").mutation(api.users.leave, { roomId, userId: ownerId });
    await as(t, "bob").mutation(api.users.leave, { roomId });

    expect(await seatOf(t, roomId, annId)).toBeNull();
    expect(await seatOf(t, roomId, bobId)).toBeNull();
    expect(await seatOf(t, roomId, ownerId)).not.toBeNull();
  });
});

// The rule the memberships model keeps (CLAUDE.md): it is the one writer of
// room memberships, but for the owner role, which ownership gives (ADR-0029).
// Every module under convex/ as source text, but the tests, the seeds,
// generated code and the one-off migrations.
const sources = import.meta.glob(
  ["./**/*.ts", "!./**/*.test.ts", "!./**/*.seeds.ts", "!./_generated/**", "!./migrations.ts"],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

/** Inserts, patches, replaces or deletes a membership row, in code (not in comments). */
function writesMemberships(source: string): boolean {
  const code = source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  return /(insert|patch|replace|delete)\(\s*["']roomMemberships["']/.test(code);
}

describe("room memberships", () => {
  it("are written only by the memberships model, and their owner role by ownership", () => {
    const writers = Object.keys(sources).filter((path) => writesMemberships(sources[path]));

    expect(writers.sort()).toEqual(["./model/memberships.ts", "./model/ownership.ts"]);
  });
});
