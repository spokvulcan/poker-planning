/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { withComponents } from "./components.setup";
import { api, internal } from "./_generated/api";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";
import type { FieldRule } from "./fieldRule";
import { DISCUSSION_NOTE, ISSUE_TITLE, PERSON_NAME, ROOM_NAME } from "./constants";
import { ACTION_ITEM_TEXT, COLUMN_EMOJI, COLUMN_TITLE, GIF_TITLE, STICKY_TEXT } from "./retroTemplates";

// Every writer of a text field keeps it by that field's rule (fieldRule.ts;
// the rules themselves are tested in fieldRules.test.ts): what a person
// wrote past the limit is refused in the rule's own words, as a coded
// refusal the browser can show, and what comes from outside is fitted.

const modules = import.meta.glob("./**/*.*s");

/**
 * A poker room the owner made, with an issue and its discussion note in it
 * and the guest "ann" at the table, and a retro the owner made, with a
 * sticky and an action item on its board.
 */
async function seedRooms(t: T) {
  const ownerId = await seedUser(t, "owner", "permanent");
  const owner = as(t, "owner");
  const pokerId = await owner.mutation(api.rooms.create, { name: "Planning" });
  const annId = await join(t, pokerId, "ann");
  const issueId = await owner.mutation(api.issues.create, { roomId: pokerId, title: "Checkout flow" });
  await owner.mutation(api.canvas.createNote, { roomId: pokerId, issueId, userId: ownerId });
  const retroId = await owner.mutation(api.retro.create, { name: "Sprint 41 retro" });
  const stickyId = await owner.mutation(api.retro.addSticky, {
    roomId: retroId,
    clientId: "sticky-1",
    columnId: "c1",
    text: "A thought",
    position: { x: 0, y: 0 },
  });
  const itemId = await owner.mutation(api.retro.addActionItem, { roomId: retroId, text: "Fix the flaky test" });
  return { ownerId, pokerId, annId, issueId, retroId, stickyId, itemId };
}

type Seeded = Awaited<ReturnType<typeof seedRooms>>;

/** The refusal a call is turned away with: its code and the message the person sees. */
async function refusalWith(call: Promise<unknown>): Promise<{ code: string; message?: string }> {
  try {
    await call;
    return { code: "resolved" };
  } catch (error) {
    if (error instanceof ConvexError) return error.data as { code: string; message: string };
    throw error;
  }
}

/** One character past the rule's limit. */
const tooLong = (rule: FieldRule) => "x".repeat(rule.maxLength + 1);

/** How the field's rule refuses a value, as the browser receives it. */
function ruleRefusal(rule: FieldRule, value: string) {
  const checked = rule.check(value);
  return checked.ok ? null : { code: "forbidden", message: checked.message };
}

const WRITERS: { writer: string; rule: FieldRule; write: (t: T, s: Seeded, value: string) => Promise<unknown> }[] = [
  {
    writer: "users.join",
    rule: PERSON_NAME,
    write: (t, s, name) =>
      as(t, "newcomer").mutation(api.users.join, { roomId: s.pokerId, name, authUserId: "newcomer" }),
  },
  {
    writer: "users.edit",
    rule: PERSON_NAME,
    write: (t, s, name) => as(t, "ann").mutation(api.users.edit, { roomId: s.pokerId, userId: s.annId, name }),
  },
  {
    writer: "users.editGlobalUser",
    rule: PERSON_NAME,
    write: (t, _s, name) => as(t, "ann").mutation(api.users.editGlobalUser, { name }),
  },
  {
    writer: "rooms.create",
    rule: ROOM_NAME,
    write: (t, _s, name) => as(t, "owner").mutation(api.rooms.create, { name }),
  },
  {
    writer: "rooms.rename",
    rule: ROOM_NAME,
    write: (t, s, name) => as(t, "owner").mutation(api.rooms.rename, { roomId: s.pokerId, name }),
  },
  {
    writer: "retro.create",
    rule: ROOM_NAME,
    write: (t, _s, name) => as(t, "owner").mutation(api.retro.create, { name }),
  },
  {
    writer: "retro.rename",
    rule: ROOM_NAME,
    write: (t, s, name) => as(t, "owner").mutation(api.retro.rename, { roomId: s.retroId, name }),
  },
  {
    writer: "issues.create",
    rule: ISSUE_TITLE,
    write: (t, s, title) => as(t, "owner").mutation(api.issues.create, { roomId: s.pokerId, title }),
  },
  {
    writer: "issues.updateTitle",
    rule: ISSUE_TITLE,
    write: (t, s, title) => as(t, "owner").mutation(api.issues.updateTitle, { issueId: s.issueId, title }),
  },
  {
    writer: "canvas.updateNoteContent",
    rule: DISCUSSION_NOTE,
    write: (t, s, content) =>
      as(t, "owner").mutation(api.canvas.updateNoteContent, {
        roomId: s.pokerId,
        nodeId: `note-${s.issueId}`,
        content,
        userId: s.ownerId,
      }),
  },
  {
    writer: "retro.addColumn (title)",
    rule: COLUMN_TITLE,
    write: (t, s, title) =>
      as(t, "owner").mutation(api.retro.addColumn, { roomId: s.retroId, title, emoji: "🎉", color: "orange" }),
  },
  {
    writer: "retro.addColumn (emoji)",
    rule: COLUMN_EMOJI,
    write: (t, s, emoji) =>
      as(t, "owner").mutation(api.retro.addColumn, { roomId: s.retroId, title: "Kudos", emoji, color: "orange" }),
  },
  {
    writer: "retro.updateColumn (title)",
    rule: COLUMN_TITLE,
    write: (t, s, title) => as(t, "owner").mutation(api.retro.updateColumn, { roomId: s.retroId, columnId: "c1", title }),
  },
  {
    writer: "retro.updateColumn (emoji)",
    rule: COLUMN_EMOJI,
    write: (t, s, emoji) => as(t, "owner").mutation(api.retro.updateColumn, { roomId: s.retroId, columnId: "c1", emoji }),
  },
  {
    writer: "retro.addSticky",
    rule: STICKY_TEXT,
    write: (t, s, text) =>
      as(t, "owner").mutation(api.retro.addSticky, {
        roomId: s.retroId,
        clientId: "sticky-2",
        columnId: "c1",
        text,
        position: { x: 0, y: 300 },
      }),
  },
  {
    writer: "retro.updateSticky",
    rule: STICKY_TEXT,
    write: (t, s, text) => as(t, "owner").mutation(api.retro.updateSticky, { stickyId: s.stickyId, text }),
  },
  {
    writer: "retro.addActionItem",
    rule: ACTION_ITEM_TEXT,
    write: (t, s, text) => as(t, "owner").mutation(api.retro.addActionItem, { roomId: s.retroId, text }),
  },
  {
    writer: "retro.updateActionItem",
    rule: ACTION_ITEM_TEXT,
    write: (t, s, text) => as(t, "owner").mutation(api.retro.updateActionItem, { itemId: s.itemId, text }),
  },
];

describe.each(WRITERS)("$writer", ({ rule, write }) => {
  it("refuses a value past the field's limit in the rule's words", async () => {
    const t = withComponents(convexTest(schema, modules));
    const seeded = await seedRooms(t);

    expect(await refusalWith(write(t, seeded, tooLong(rule)))).toEqual(ruleRefusal(rule, tooLong(rule)));
  });
});

const userRow = (t: T, authUserId: string) =>
  t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .first()
  );

/** A Google display name ten characters past the person-name limit. */
const LONG_GOOGLE_NAME = "  Maximiliana Alexandra Konstantinopoulou-Vanderbilt the Third ";

describe("a GIF's title, as its source names it", () => {
  it("is fitted to the GIF title rule on the sticky it's put on", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { retroId } = await seedRooms(t);
    const gif = { url: "https://media.giphy.com/media/abc/giphy.gif", width: 480, height: 270 };

    const stickyId = await as(t, "owner").mutation(api.retro.addSticky, {
      roomId: retroId,
      clientId: "sticky-gif",
      columnId: "c1",
      text: "",
      gif: { ...gif, title: `  ${"x".repeat(GIF_TITLE.maxLength + 10)}` },
      position: { x: 0, y: 300 },
    });

    const sticky = await t.run((ctx) => ctx.db.get("retroStickies", stickyId));
    expect(sticky?.gif?.title).toBe("x".repeat(GIF_TITLE.maxLength));
  });
});

describe("a name a sign-in provider gives", () => {
  it("is fitted to the person-name rule when the account is made", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.users.ensureGlobalUserFromAuth, {
      authUserId: "google-user",
      name: LONG_GOOGLE_NAME,
      email: "max@example.com",
    });

    expect((await userRow(t, "google-user"))?.name).toBe("Maximiliana Alexandra Konstantinopoulou-Vanderbilt");
  });

  it("is the email's local part, fitted, when the provider has none (a magic link)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.users.ensureGlobalUserFromAuth, {
      authUserId: "magic-user",
      name: "",
      email: "dr.maximiliana.alexandra.konstantinopoulou.vanderbilt@example.com",
    });

    expect((await userRow(t, "magic-user"))?.name).toBe("dr.maximiliana.alexandra.konstantinopoulou.vanderb");
  });

  it("is fitted to the person-name rule when the account's first room write makes its row", async () => {
    const t = withComponents(convexTest(schema, modules));
    const session = t.withIdentity({ subject: "google-user", isAnonymous: false, email: "max@example.com", name: LONG_GOOGLE_NAME });

    await session.mutation(api.rooms.create, { name: "Planning" });

    expect((await userRow(t, "google-user"))?.name).toBe("Maximiliana Alexandra Konstantinopoulou-Vanderbilt");
  });

  it("is fitted, not refused, when the room page joins a room under the name a row made before the rule holds", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { pokerId } = await seedRooms(t);
    await seedNamedUser(t, "old-timer", LONG_GOOGLE_NAME.trim());

    // The room page joins a person with a name under the one their row has.
    await as(t, "old-timer").mutation(api.users.join, { roomId: pokerId, name: LONG_GOOGLE_NAME.trim() });

    expect(await as(t, "old-timer").query(api.users.getMyMembership, { roomId: pokerId })).toMatchObject({
      name: "Maximiliana Alexandra Konstantinopoulou-Vanderbilt",
    });
  });

  it("is fitted to the person-name rule when a guest with no name signs in", async () => {
    const t = withComponents(convexTest(schema, modules));
    await seedNamedUser(t, "guest", "", "anonymous");

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "guest",
      newAuthUserId: "google-user",
      email: "max@example.com",
      name: LONG_GOOGLE_NAME,
    });

    expect((await userRow(t, "google-user"))?.name).toBe("Maximiliana Alexandra Konstantinopoulou-Vanderbilt");
  });
});
