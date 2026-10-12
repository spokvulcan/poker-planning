/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api } from "./_generated/api";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";
import {
  type Device,
  authRequest,
  signInAsGuest,
  signInByMagicLink,
  signInRows,
  stubAuthDeployment,
} from "./signIn.seeds";

// Signing out (CONTEXT.md: Guest): the server decides what goes, from the
// session's token, whatever the browser makes of it. A guest's account goes
// with its session, deleted the way Delete account deletes one, its rooms
// handed on and its sign-in with it (ADR-0029, ADR-0030, ADR-0033); a
// permanent account stays for when the person signs back in.

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

describe("the sign-in, as BetterAuth keeps it", () => {
  // Signed in through BetterAuth's own routes, as a browser is (signIn.seeds.ts).
  beforeEach(stubAuthDeployment);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** useSignOut: the server first, while the token still says who it is, then BetterAuth's sign-out. */
  const signOut = async (t: T, device: Device) => {
    await t.withIdentity(device.identity).mutation(api.users.signOut, {});
    return await authRequest(t, "/api/auth/sign-out", { method: "POST", cookie: device.cookie, body: {} });
  };

  it("goes with a guest's account, and BetterAuth's sign-out still clears the browser", async () => {
    const t = withComponents(convexTest(schema, modules));
    const guest = await signInAsGuest(t);
    await t.withIdentity(guest.identity).mutation(api.rooms.create, { name: "Planning" });

    const signedOut = await signOut(t, guest);

    expect(signedOut.status).toBe(200);
    expect(await signInRows(t, guest.identity.subject)).toEqual({ user: null, sessions: [], accounts: [] });
  });

  it("goes for a guest who only continued as one, with no users row yet", async () => {
    const t = withComponents(convexTest(schema, modules));
    const guest = await signInAsGuest(t);

    await signOut(t, guest);

    expect(await signInRows(t, guest.identity.subject)).toEqual({ user: null, sessions: [], accounts: [] });
  });

  it("stays for a permanent account: signing out ends only that device's session", async () => {
    const t = withComponents(convexTest(schema, modules));
    const laptop = await signInByMagicLink(t, "ada@example.com");
    const phone = await signInByMagicLink(t, "ada@example.com");

    await signOut(t, laptop);

    expect(await signInRows(t, laptop.identity.subject)).toMatchObject({
      user: { email: "ada@example.com" },
      sessions: [expect.objectContaining({ _id: phone.identity.sessionId })],
    });
    expect(await t.withIdentity(phone.identity).query(api.users.getGlobalUser, {})).toMatchObject({
      email: "ada@example.com",
    });
  });
});
