/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { type T, seedRoom, seedUser, addMembership } from "./analytics.seeds";

// Two mutations still take the caller's authUserId, which older browsers
// send: join, and ensureGlobalUser, which only older browsers call before a
// create. Both accept it and ignore it, acting for whoever is signed in, and
// refuse a caller they can't identify.

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
  it("makes a signed-in guest's row as creating a room would, ignoring the name it is sent", async () => {
    const t = convexTest(schema, modules);
    const guest = t.withIdentity({ subject: "guest", isAnonymous: true });
    await guest.mutation(api.users.ensureGlobalUser, { authUserId: "guest", name: "Otter" });
    const row = await guest.query(api.users.getGlobalUser, {});
    expect(row).toMatchObject({ accountType: "anonymous" });
    expect(row?.name).toMatch(/^Guest \d{4}$/);
  });

  it("leaves an existing row's name alone", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "guest", "Ada");
    await as(t, "guest").mutation(api.users.ensureGlobalUser, { authUserId: "guest", name: "Otter" });
    expect((await userRow(t, "guest"))?.name).toBe("Ada");
  });

  it("refuses a caller with no identity, even for a row that doesn't exist yet", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.ensureGlobalUser, { authUserId: "guest", name: "Otter" })
    ).rejects.toThrow("Not authenticated");
    expect(await userRow(t, "guest")).toBeNull();
  });

  it("ignores the authUserId it is sent, making the row of whoever is signed in", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "victim", "Victim");
    await as(t, "mallory").mutation(api.users.ensureGlobalUser, { authUserId: "victim", name: "Pwned" });
    expect(await as(t, "mallory").query(api.users.getGlobalUser, {})).not.toBeNull();
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

  it("joins without the authUserId older browsers send", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await as(t, "guest").mutation(api.users.join, { roomId, name: "Ada" });
    expect(await as(t, "guest").query(api.users.getMyMembership, { roomId })).toMatchObject({ name: "Ada" });
  });

  it("ignores the authUserId it is sent, joining whoever is signed in", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seedUser(t, "victim", "Victim");
    await as(t, "mallory").mutation(api.users.join, { roomId, name: "Pwned", authUserId: "victim" });
    expect(await as(t, "mallory").query(api.users.getMyMembership, { roomId })).toMatchObject({ name: "Pwned" });
    expect((await userRow(t, "victim"))?.name).toBe("Victim");
    expect(await as(t, "victim").query(api.users.getMyMembership, { roomId })).toBeNull();
  });
});
