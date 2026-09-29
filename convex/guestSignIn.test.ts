/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { type T, seedRoom, seedUser, addMembership } from "./analytics.seeds";

// The two mutations a guest's first write goes through take the caller's
// authUserId as an argument (older browsers still send it). The session
// bootstrap waits until Convex has the session before either runs, so both
// refuse a caller they can't identify, or one who names someone else.

const modules = import.meta.glob("./**/*.*s");

const as = (t: T, subject: string) => t.withIdentity({ subject });

const userRow = (t: T, authUserId: string) =>
  t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .first()
  );

describe("ensureGlobalUser", () => {
  it("makes a signed-in guest's user row", async () => {
    const t = convexTest(schema, modules);
    await as(t, "guest").mutation(api.users.ensureGlobalUser, { authUserId: "guest", name: "Otter" });
    expect((await userRow(t, "guest"))?.name).toBe("Otter");
  });

  it("refuses a caller with no identity, even for a row that doesn't exist yet", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.ensureGlobalUser, { authUserId: "guest", name: "Otter" })
    ).rejects.toThrow("Not authenticated");
    expect(await userRow(t, "guest")).toBeNull();
  });

  it("refuses a caller naming someone else", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "victim", "Victim");
    await expect(
      as(t, "mallory").mutation(api.users.ensureGlobalUser, { authUserId: "victim", name: "Pwned" })
    ).rejects.toThrow("Auth identity mismatch");
    expect((await userRow(t, "victim"))?.name).toBe("Victim");
  });
});

describe("join", () => {
  it("joins a signed-in guest, making their user row with the typed name", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await as(t, "guest").mutation(api.users.join, { roomId, name: "Ada", authUserId: "guest" });
    expect((await userRow(t, "guest"))?.name).toBe("Ada");
    expect(await as(t, "guest").query(api.users.getMyMembership, { roomId })).not.toBeNull();
  });

  it("refuses a caller with no identity, new or rejoining", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await expect(
      t.mutation(api.users.join, { roomId, name: "Ada", authUserId: "guest" })
    ).rejects.toThrow("Not authenticated");
    expect(await userRow(t, "guest")).toBeNull();

    const memberId = await seedUser(t, "member", "Member");
    await addMembership(t, roomId, memberId, Date.now());
    await expect(
      t.mutation(api.users.join, { roomId, name: "Member", authUserId: "member" })
    ).rejects.toThrow("Not authenticated");
  });

  it("refuses a caller naming someone else", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seedUser(t, "victim", "Victim");
    await expect(
      as(t, "mallory").mutation(api.users.join, { roomId, name: "Pwned", authUserId: "victim" })
    ).rejects.toThrow("Auth identity mismatch");
    expect((await userRow(t, "victim"))?.name).toBe("Victim");
  });
});
