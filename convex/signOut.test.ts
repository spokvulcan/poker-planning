/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";

// Signing out (CONTEXT.md: Guest): the server decides what goes, from the
// session's token, whatever the browser makes of it. A guest's account goes
// with its session, deleted the way Delete account deletes one, its rooms
// handed on (ADR-0029, ADR-0030); a permanent account stays for when the
// person signs back in.

const modules = import.meta.glob("./**/*.*s");

/** Signed in through BetterAuth, whose token says whether the session is a guest's. */
const session = (t: T, subject: string, isAnonymous: boolean) => t.withIdentity({ subject, isAnonymous });

describe("signing out", () => {
  it("deletes a guest's account, handing each room it owns to whoever joined first", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedUser(t, "guest");
    const roomId = await as(t, "guest").mutation(api.rooms.create, { name: "Planning" });
    const firstId = await join(t, roomId, "first");
    await join(t, roomId, "second");

    await session(t, "guest", true).mutation(api.users.signOut, {});

    expect(await session(t, "guest", true).query(api.users.getGlobalUser, {})).toBeNull();
    const shown = await as(t, "first").query(api.rooms.get, { roomId });
    expect(shown?.room.ownerId).toBe(firstId);
    expect(shown?.users.find((u) => u._id === firstId)?.role).toBe("owner");
    expect(shown?.isOwnerAbsent).toBe(false);
  });

  it("keeps a permanent account for when the person signs back in, still owning its rooms", async () => {
    const t = withComponents(convexTest(schema, modules));
    const ownerId = await seedUser(t, "owner", "permanent");
    const roomId = await as(t, "owner").mutation(api.rooms.create, { name: "Planning" });
    await join(t, roomId, "member");

    await session(t, "owner", false).mutation(api.users.signOut, {});

    expect(await session(t, "owner", false).query(api.users.getGlobalUser, {})).toMatchObject({ _id: ownerId });
    expect(await as(t, "owner").query(api.users.getMyMembership, { roomId })).toMatchObject({ role: "owner" });
    expect((await as(t, "member").query(api.rooms.get, { roomId }))?.room.ownerId).toBe(ownerId);
  });

  it("goes by the session, not the row: a permanent account whose row has no kind is kept", async () => {
    const t = withComponents(convexTest(schema, modules));
    // The row a deleted account gets back when it signs in again has no kind.
    const userId = await seedUser(t, "returning");

    await session(t, "returning", false).mutation(api.users.signOut, {});

    expect(await session(t, "returning", false).query(api.users.getGlobalUser, {})).toMatchObject({ _id: userId });
  });

  it("deletes nothing with nobody signed in, so the browser can still clear its session", async () => {
    const t = withComponents(convexTest(schema, modules));
    // Convex has no token (a missing or expired one) while BetterAuth's session lives on.
    const guestId = await seedUser(t, "guest");

    await t.mutation(api.users.signOut, {});

    expect(await session(t, "guest", true).query(api.users.getGlobalUser, {})).toMatchObject({ _id: guestId });
  });

  it("deletes nobody whose session doesn't say it is a guest's", async () => {
    const t = withComponents(convexTest(schema, modules));
    const userId = await seedUser(t, "unsaid");

    await as(t, "unsaid").mutation(api.users.signOut, {});

    expect(await as(t, "unsaid").query(api.users.getGlobalUser, {})).toMatchObject({ _id: userId });
  });
});
