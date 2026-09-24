/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_PERMISSIONS } from "./permissions";
import { columnsFromTemplate } from "./retroTemplates";
import { FACE_DOWN_HEIGHT, nextPadPosition, nextStickyPosition, padPositions } from "./retroLayout";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// The whiteboard retro through its API (convex/retro.ts): what a new retro
// holds, who sees what on the board in each step, stickies and stacks,
// votes and the discussion walk, action items, the next retro, columns, and
// who may do what at the default permissions. The pure rules (totals, the
// walk's order, GIF links) are in retroRules.test.ts.

const modules = import.meta.glob("./**/*.*s");

const as = (t: T, subject: string) => t.withIdentity({ subject });

/** A user row whose name doubles as its auth subject. */
const seedUser = (t: T, subject: string, accountType?: "anonymous" | "permanent") =>
  seedNamedUser(t, subject, subject, accountType);

/** Joins a room the way the app does; the first join creates a guest's user row. */
const join = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/**
 * "Sprint 41 retro", opened by "owner" (a permanent account), who joins it
 * and takes the owner role, with the guests "ann" and "bob" as participants.
 */
async function seedRetro(t: T, templateId?: string) {
  const ownerId = await seedUser(t, "owner", "permanent");
  const roomId = await as(t, "owner").mutation(api.retro.create, {
    name: "Sprint 41 retro",
    ...(templateId ? { templateId } : {}),
  });
  await join(t, roomId, "owner");
  const annId = await join(t, roomId, "ann");
  const bobId = await join(t, roomId, "bob");
  return { roomId, ownerId, annId, bobId };
}

const GIPHY_MEDIA = "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif";

/** Sticks a sticky on the board as `who`: some words in the first column unless told otherwise. */
function stick(
  t: T,
  who: string,
  roomId: Id<"rooms">,
  opts: {
    text?: string;
    columnId?: string;
    clientId?: string;
    gif?: { url: string; width: number; height: number; title?: string };
    position?: { x: number; y: number };
  } = {}
) {
  return as(t, who).mutation(api.retro.addSticky, {
    roomId,
    clientId: opts.clientId ?? crypto.randomUUID(),
    columnId: opts.columnId ?? "c1",
    text: opts.text ?? "A thought",
    ...(opts.gif ? { gif: opts.gif } : {}),
    position: opts.position ?? { x: 0, y: 0 },
  });
}

/** The owner moves the retro to a step. */
const setStep = (t: T, roomId: Id<"rooms">, step: "write" | "vote" | "discuss" | "done") =>
  as(t, "owner").mutation(api.retro.setStep, { roomId, step });

const vote = (t: T, who: string, stickyId: Id<"retroStickies">) =>
  as(t, who).mutation(api.retro.toggleVote, { stickyId });

const stack = (t: T, who: string, stickyId: Id<"retroStickies">, ontoId: Id<"retroStickies">) =>
  as(t, who).mutation(api.retro.stackSticky, { stickyId, ontoId });

/** One sticky as `who` sees it on the board. */
async function seen(t: T, who: string, roomId: Id<"rooms">, stickyId: Id<"retroStickies">) {
  const board = await as(t, who).query(api.retro.board, { roomId });
  return board.stickies.find((s) => s._id === stickyId)!;
}

async function retroState(t: T, roomId: Id<"rooms">) {
  return (await t.run((ctx) => ctx.db.get(roomId)))!.retro!;
}

async function stickyRow(t: T, stickyId: Id<"retroStickies">) {
  return (await t.run((ctx) => ctx.db.get(stickyId)))!;
}

async function stickiesIn(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db.query("retroStickies").withIndex("by_room", (q) => q.eq("roomId", roomId)).collect()
  );
}

async function votesIn(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db.query("retroStickyVotes").withIndex("by_room", (q) => q.eq("roomId", roomId)).collect()
  );
}

async function padsIn(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("canvasNodes")
      .withIndex("by_room_type", (q) => q.eq("roomId", roomId).eq("type", "pad"))
      .collect()
  );
}

/** The refusal code a call is turned away with, or "resolved" when it goes through. */
async function refusalOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "resolved";
  } catch (error) {
    if (error instanceof ConvexError) return (error.data as { code: string }).code;
    throw error;
  }
}

/**
 * Lets scheduled jobs run to the end. convex-test fires runAfter(0) on real
 * timers, and the room cascade reschedules itself until the room is gone.
 */
async function drainScheduled(t: T): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.finishInProgressScheduledFunctions();
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    if (!jobs.some((job) => job.state.kind === "pending")) return;
  }
  throw new Error("scheduled functions did not drain");
}

const FACILITATORS_ONLY = "Only facilitators and the owner can do this.";

describe("retro.create", () => {
  it("opens a retro at `write` with the template's columns and the board's fixed nodes", async () => {
    const t = convexTest(schema, modules);
    const { roomId, ownerId } = await seedRetro(t, "4ls");

    const room = (await t.run((ctx) => ctx.db.get(roomId)))!;
    expect(room).toMatchObject({ name: "Sprint 41 retro", roomType: "retro", ownerId, retained: true });
    expect(room.retro).toEqual({
      step: "write",
      columns: columnsFromTemplate("4ls"),
      votesPerPerson: 3,
      showAuthors: false,
    });

    const nodes = await as(t, "owner").query(api.canvas.getCanvasNodes, { roomId });
    expect(Object.fromEntries(nodes.map((n) => [n.nodeId, n.type]))).toEqual({
      retro: "retro",
      timer: "timer",
      actions: "actions",
      "pad-c1": "pad",
      "pad-c2": "pad",
      "pad-c3": "pad",
      "pad-c4": "pad",
    });
    expect(nodes.find((n) => n.nodeId === "pad-c3")?.data).toEqual({ columnId: "c3" });

    // Joining their own retro makes the creator its owner.
    const membership = await t.run((ctx) =>
      ctx.db
        .query("roomMemberships")
        .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", ownerId))
        .unique()
    );
    expect(membership?.role).toBe("owner");
  });

  it("a guest's retro is not retained", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "guest");

    const roomId = await as(t, "guest").mutation(api.retro.create, { name: "R" });

    expect((await t.run((ctx) => ctx.db.get(roomId)))?.retained).toBe(false);
  });
});

describe("the board — who sees what", () => {
  it("while writing, someone else's sticky is face-down: its place, never its words, GIF or author", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    await as(t, "owner").mutation(api.retro.updateSettings, { roomId, showAuthors: true });
    const stickyId = await stick(t, "ann", roomId, {
      text: "Deploys are slow",
      columnId: "c2",
      gif: { url: GIPHY_MEDIA, width: 200, height: 150 },
      position: { x: 10, y: 20 },
    });

    const toBob = await seen(t, "bob", roomId, stickyId);
    expect(toBob).toMatchObject({ hidden: true, mine: false, columnId: "c2", position: { x: 10, y: 20 } });
    expect(toBob).not.toHaveProperty("text");
    expect(toBob).not.toHaveProperty("gif");
    expect(toBob).not.toHaveProperty("authorName");

    expect(await seen(t, "ann", roomId, stickyId)).toMatchObject({
      hidden: false,
      mine: true,
      text: "Deploys are slow",
      gif: { url: GIPHY_MEDIA },
    });
  });

  it("the vote step reveals every sticky's words to everyone", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const stickyId = await stick(t, "ann", roomId, { text: "Deploys are slow" });

    await setStep(t, roomId, "vote");

    expect(await seen(t, "bob", roomId, stickyId)).toMatchObject({
      hidden: false,
      mine: false,
      text: "Deploys are slow",
    });
  });

  it("authors travel only when the retro shows them, and only once revealed", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const stickyId = await stick(t, "ann", roomId);
    await setStep(t, roomId, "vote");
    expect(await seen(t, "bob", roomId, stickyId)).not.toHaveProperty("authorName");

    await as(t, "owner").mutation(api.retro.updateSettings, { roomId, showAuthors: true });
    expect((await seen(t, "bob", roomId, stickyId)).authorName).toBe("ann");

    // Back to writing: face-down again, and no name travels, not even to the author.
    await setStep(t, roomId, "write");
    expect(await seen(t, "bob", roomId, stickyId)).not.toHaveProperty("authorName");
    expect(await seen(t, "ann", roomId, stickyId)).not.toHaveProperty("authorName");
  });

  it("a sticky's height is kept from its author's browser only, and sent to nobody", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const stickyId = await stick(t, "ann", roomId);
    const measure = (who: string, height: number) =>
      as(t, who).mutation(api.retro.measureStickies, { roomId, heights: [{ stickyId, height }] });

    await measure("bob", 300);
    expect((await stickyRow(t, stickyId)).height).toBeUndefined();
    await measure("ann", 243.6);
    expect((await stickyRow(t, stickyId)).height).toBe(244);

    expect(await seen(t, "bob", roomId, stickyId)).not.toHaveProperty("height");
    expect(await seen(t, "ann", roomId, stickyId)).not.toHaveProperty("height");
    await setStep(t, roomId, "vote");
    expect(await seen(t, "bob", roomId, stickyId)).not.toHaveProperty("height");
  });
});

describe("the reveal", () => {
  /**
   * Ann's GIF sticky under the first pad, which her browser draws 244 px
   * tall, and Bob's, which his pad put under its face-down size.
   */
  async function bobUnderAnnsGif(t: T, roomId: Id<"rooms">) {
    const [pad] = padPositions(3);
    const annAt = nextStickyPosition(pad, []);
    const annId = await stick(t, "ann", roomId, { gif: { url: GIPHY_MEDIA, width: 480, height: 270 }, position: annAt });
    await as(t, "ann").mutation(api.retro.measureStickies, { roomId, heights: [{ stickyId: annId, height: 244 }] });
    const bobAt = nextStickyPosition(pad, [{ position: annAt, height: FACE_DOWN_HEIGHT }]);
    const bobId = await stick(t, "bob", roomId, { position: bobAt });
    return { annAt, annId, bobAt, bobId };
  }

  it("moves a sticky put under a face-down one clear of it, by the height its author's browser measured", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const { annAt, annId, bobAt, bobId } = await bobUnderAnnsGif(t, roomId);

    await setStep(t, roomId, "vote");

    expect((await seen(t, "bob", roomId, bobId)).position).toEqual({ x: bobAt.x, y: annAt.y + 244 + 16 });
    expect((await seen(t, "bob", roomId, annId)).position).toEqual(annAt);
  });

  it("is the only step that moves stickies", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const { bobAt, bobId } = await bobUnderAnnsGif(t, roomId);
    await setStep(t, roomId, "vote");

    // Face-up, anyone can see the overlap: moved back on purpose, it stays.
    await as(t, "owner").mutation(api.retro.moveStickies, { roomId, moves: [{ stickyId: bobId, position: bobAt }] });
    await setStep(t, roomId, "discuss");
    await setStep(t, roomId, "done");

    expect((await stickyRow(t, bobId)).position).toEqual(bobAt);
  });

  it("goes by face-down size when nobody measured a sticky", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const [pad] = padPositions(3);
    const annAt = nextStickyPosition(pad, []);
    await stick(t, "ann", roomId, { position: annAt });
    const bobAt = nextStickyPosition(pad, [{ position: annAt, height: FACE_DOWN_HEIGHT }]);
    const bobId = await stick(t, "bob", roomId, { position: bobAt });

    await setStep(t, roomId, "vote");

    expect((await stickyRow(t, bobId)).position).toEqual(bobAt);
  });
});

describe("retro.addSticky", () => {
  it("a repeated clientId is the same sticky", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);

    const first = await stick(t, "ann", roomId, { clientId: "dup", text: "Once" });
    const again = await stick(t, "ann", roomId, { clientId: "dup", text: "Twice" });

    expect(again).toBe(first);
    expect((await stickiesIn(t, roomId)).map((s) => s.text)).toEqual(["Once"]);
  });

  it("refuses a sticky with neither words nor a GIF, and one for a column that is gone", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);

    expect(await refusalOf(stick(t, "ann", roomId, { text: "   " }))).toBe("forbidden");
    expect(await refusalOf(stick(t, "ann", roomId, { columnId: "c9" }))).toBe("missing");
    expect(await stickiesIn(t, roomId)).toEqual([]);
  });

  it("refuses a GIF from a host outside the allowlist", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);

    const call = stick(t, "ann", roomId, {
      text: "",
      gif: { url: "https://example.com/cat.gif", width: 200, height: 200 },
    });

    expect(await refusalOf(call)).toBe("forbidden");
  });

  it("takes a GIPHY page link and stores its media file, words optional", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);

    const stickyId = await stick(t, "ann", roomId, {
      text: "",
      gif: { url: "https://giphy.com/gifs/funny-cat-3o7TKSjRrfIPjeiVyM", width: 480, height: 270, title: "Cat" },
    });

    expect((await stickyRow(t, stickyId)).gif).toEqual({ url: GIPHY_MEDIA, width: 480, height: 270, title: "Cat" });
  });
});

describe("stacks", () => {
  it("while writing, only your own stickies stack", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const ann1 = await stick(t, "ann", roomId);
    const ann2 = await stick(t, "ann", roomId);
    const bob1 = await stick(t, "bob", roomId);

    expect(await refusalOf(stack(t, "ann", ann1, bob1))).toBe("stage");
    expect(await refusalOf(stack(t, "bob", bob1, ann1))).toBe("stage");

    await stack(t, "ann", ann2, ann1);
    expect((await stickyRow(t, ann2)).stackId).toBe(ann1);
  });

  it("once revealed, a sticky dropped on another joins that sticky's stack, and a stack's top brings its stack", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const a = await stick(t, "ann", roomId);
    const b = await stick(t, "bob", roomId);
    const c = await stick(t, "ann", roomId);
    const d = await stick(t, "bob", roomId);
    await setStep(t, roomId, "vote");

    await stack(t, "bob", a, b);
    expect((await stickyRow(t, a)).stackId).toBe(b);

    // Dropped on a stacked sticky, it joins the stack, not the sticky.
    await stack(t, "bob", c, a);
    expect((await stickyRow(t, c)).stackId).toBe(b);

    await stack(t, "ann", b, d);
    for (const id of [a, b, c]) {
      expect((await stickyRow(t, id)).stackId).toBe(d);
    }
  });

  it("unstacking takes a sticky out and puts it down where it was dropped", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const a = await stick(t, "ann", roomId);
    const b = await stick(t, "bob", roomId);
    await setStep(t, roomId, "vote");
    await stack(t, "bob", a, b);

    await as(t, "bob").mutation(api.retro.unstackSticky, { stickyId: a, position: { x: 400, y: 300 } });

    const row = await stickyRow(t, a);
    expect(row.stackId).toBeUndefined();
    expect(row.position).toEqual({ x: 400, y: 300 });
  });

  it("deleting a stack's top promotes its oldest sticky, which keeps the rest and the stack's votes", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const top = await stick(t, "ann", roomId, { position: { x: 50, y: 60 } });
    const older = await stick(t, "bob", roomId);
    const younger = await stick(t, "bob", roomId);
    await setStep(t, roomId, "vote");
    await stack(t, "ann", younger, top);
    await stack(t, "ann", older, top);
    // Every vote on a stack is filed under its top.
    await vote(t, "bob", top);
    await vote(t, "owner", younger);

    await as(t, "ann").mutation(api.retro.deleteSticky, { stickyId: top });

    const heir = await stickyRow(t, older);
    expect(heir.stackId).toBeUndefined();
    expect(heir.position).toEqual({ x: 50, y: 60 });
    expect((await stickyRow(t, younger)).stackId).toBe(older);
    await setStep(t, roomId, "discuss");
    expect(await seen(t, "bob", roomId, older)).toMatchObject({ votes: 2, myVote: true });
  });

  it("deleting a loose sticky takes its votes with it", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const a = await stick(t, "ann", roomId);
    await setStep(t, roomId, "vote");
    await vote(t, "bob", a);

    await as(t, "ann").mutation(api.retro.deleteSticky, { stickyId: a });

    expect(await votesIn(t, roomId)).toEqual([]);
  });
});

describe("votes", () => {
  it("are cast only in the vote step", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const a = await stick(t, "ann", roomId);

    expect(await refusalOf(vote(t, "bob", a))).toBe("stage");
    await setStep(t, roomId, "vote");
    await vote(t, "bob", a);
    await setStep(t, roomId, "discuss");
    expect(await refusalOf(vote(t, "bob", a))).toBe("stage");
    expect(await votesIn(t, roomId)).toHaveLength(1);
  });

  it("one per person per topic: voting again takes it back", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const a = await stick(t, "ann", roomId);
    await setStep(t, roomId, "vote");

    await vote(t, "bob", a);
    expect(await seen(t, "bob", roomId, a)).toMatchObject({ myVote: true });

    await vote(t, "bob", a);
    expect(await seen(t, "bob", roomId, a)).toMatchObject({ myVote: false });
    expect(await votesIn(t, roomId)).toEqual([]);
  });

  it("a vote on any sticky of a stack is a vote for the stack", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const top = await stick(t, "ann", roomId);
    const member = await stick(t, "bob", roomId);
    await setStep(t, roomId, "vote");
    await stack(t, "ann", member, top);

    await vote(t, "owner", member);
    expect((await votesIn(t, roomId)).map((v) => v.stickyId)).toEqual([top]);
    expect(await seen(t, "owner", roomId, top)).toMatchObject({ myVote: true });

    // The stack is one topic: a vote on its top is the same vote, taken back.
    await vote(t, "owner", top);
    expect(await votesIn(t, roomId)).toEqual([]);
  });

  it("stay within the retro's budget", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    await as(t, "owner").mutation(api.retro.updateSettings, { roomId, votesPerPerson: 2 });
    const a = await stick(t, "ann", roomId);
    const b = await stick(t, "ann", roomId);
    const c = await stick(t, "ann", roomId);
    await setStep(t, roomId, "vote");

    await vote(t, "bob", a);
    await vote(t, "bob", b);
    expect(await refusalOf(vote(t, "bob", c))).toBe("budget");

    // Taking one back frees it.
    await vote(t, "bob", a);
    await vote(t, "bob", c);
    expect((await as(t, "bob").query(api.retro.board, { roomId })).myVotes).toBe(2);
  });

  it("totals stay hidden while voting and show from the discussion on, a stack's on its top", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const top = await stick(t, "ann", roomId);
    const member = await stick(t, "bob", roomId);
    const loose = await stick(t, "bob", roomId);
    await setStep(t, roomId, "vote");
    // Ann votes for the member while it's loose; then it joins the stack.
    await vote(t, "ann", member);
    await stack(t, "ann", member, top);
    await vote(t, "bob", top);

    const whileVoting = await as(t, "ann").query(api.retro.board, { roomId });
    expect(whileVoting.myVotes).toBe(1);
    expect(await as(t, "ann").query(api.retro.votesCast, { roomId })).toBe(2);
    const topWhileVoting = whileVoting.stickies.find((s) => s._id === top)!;
    expect(topWhileVoting.myVote).toBe(true);
    expect(topWhileVoting).not.toHaveProperty("votes");
    // A stacked sticky is not a topic of its own.
    const memberWhileVoting = whileVoting.stickies.find((s) => s._id === member)!;
    expect(memberWhileVoting).not.toHaveProperty("myVote");
    expect(memberWhileVoting).not.toHaveProperty("votes");

    await setStep(t, roomId, "discuss");
    expect(await seen(t, "owner", roomId, top)).toMatchObject({ votes: 2, myVote: false });
    expect(await seen(t, "ann", roomId, top)).toMatchObject({ votes: 2, myVote: true });
    expect(await seen(t, "owner", roomId, loose)).toMatchObject({ votes: 0 });
    expect(await seen(t, "owner", roomId, member)).not.toHaveProperty("votes");
  });
});

describe("the discussion", () => {
  /** Three stickies in the vote step, with 2, 1 and 0 votes. */
  async function seedVoted(t: T) {
    const { roomId } = await seedRetro(t);
    const most = await stick(t, "ann", roomId);
    const some = await stick(t, "bob", roomId);
    const none = await stick(t, "ann", roomId);
    await setStep(t, roomId, "vote");
    await vote(t, "ann", most);
    await vote(t, "bob", most);
    await vote(t, "bob", some);
    return { roomId, most, some, none };
  }

  const focus = (t: T, roomId: Id<"rooms">, stickyId: Id<"retroStickies">) =>
    as(t, "owner").mutation(api.retro.focusTopic, { roomId, stickyId });

  it("opens on the most-voted topic", async () => {
    const t = convexTest(schema, modules);
    const { roomId, most } = await seedVoted(t);

    await setStep(t, roomId, "discuss");

    expect(await retroState(t, roomId)).toMatchObject({ step: "discuss", focusStickyId: most });
  });

  it("next and previous walk the voted topics in vote order, and stay put at either end", async () => {
    const t = convexTest(schema, modules);
    const { roomId, most, some } = await seedVoted(t);
    await setStep(t, roomId, "discuss");
    const walk = async (direction: "next" | "previous") => {
      await as(t, "owner").mutation(api.retro.stepDiscussion, { roomId, direction });
      return (await retroState(t, roomId)).focusStickyId;
    };

    expect(await walk("next")).toBe(some);
    expect(await walk("next")).toBe(some);
    expect(await walk("previous")).toBe(most);
    expect(await walk("previous")).toBe(most);
  });

  it("any topic can take the spotlight once revealed, voted for or not, and a stacked sticky brings its stack", async () => {
    const t = convexTest(schema, modules);
    const { roomId, most, some, none } = await seedVoted(t);

    // From the vote step, the spotlight opens the discussion.
    await focus(t, roomId, none);
    expect(await retroState(t, roomId)).toMatchObject({ step: "discuss", focusStickyId: none });

    await stack(t, "ann", some, most);
    await focus(t, roomId, some);
    expect((await retroState(t, roomId)).focusStickyId).toBe(most);
  });

  it("going back to writing drops the walk, and nothing takes the spotlight while writing", async () => {
    const t = convexTest(schema, modules);
    const { roomId, none } = await seedVoted(t);
    await setStep(t, roomId, "discuss");

    await setStep(t, roomId, "write");

    expect(await retroState(t, roomId)).not.toHaveProperty("focusStickyId");
    expect(await refusalOf(focus(t, roomId, none))).toBe("stage");
  });
});

describe("permissions at the retro defaults", () => {
  it("a participant can't move the retro through its steps or change its settings", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const ann = as(t, "ann");

    await expect(ann.mutation(api.retro.setStep, { roomId, step: "vote" })).rejects.toThrow(FACILITATORS_ONLY);
    await expect(ann.mutation(api.retro.stepDiscussion, { roomId, direction: "next" })).rejects.toThrow(
      FACILITATORS_ONLY
    );
    await expect(ann.mutation(api.retro.startNext, { roomId })).rejects.toThrow(FACILITATORS_ONLY);
    await expect(ann.mutation(api.retro.updateSettings, { roomId, votesPerPerson: 10 })).rejects.toThrow(
      FACILITATORS_ONLY
    );
    await expect(
      ann.mutation(api.retro.addColumn, { roomId, title: "Mine", emoji: "🙂", color: "blue" })
    ).rejects.toThrow(FACILITATORS_ONLY);
    await expect(ann.mutation(api.retro.rename, { roomId, name: "Ann's retro" })).rejects.toThrow(
      FACILITATORS_ONLY
    );

    expect(await retroState(t, roomId)).toMatchObject({ step: "write", votesPerPerson: 3 });
  });

  it("a participant writes, moves anyone's sticky, votes and adds action items", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const bobs = await stick(t, "bob", roomId);

    await as(t, "ann").mutation(api.retro.moveStickies, {
      roomId,
      moves: [{ stickyId: bobs, position: { x: 300, y: 200 } }],
    });
    expect((await stickyRow(t, bobs)).position).toEqual({ x: 300, y: 200 });

    await setStep(t, roomId, "vote");
    await vote(t, "ann", bobs);
    await as(t, "ann").mutation(api.retro.addActionItem, { roomId, text: "Pair on the deploy script" });

    expect(await votesIn(t, roomId)).toHaveLength(1);
    expect(await as(t, "ann").query(api.retro.actionItems, { roomId })).toHaveLength(1);
  });

  it("before the reveal only the author touches a sticky, not even the owner", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const stickyId = await stick(t, "ann", roomId, { text: "Face-down" });

    expect(await refusalOf(as(t, "owner").mutation(api.retro.updateSticky, { stickyId, text: "Owner's" }))).toBe("stage");
    expect(await refusalOf(as(t, "owner").mutation(api.retro.deleteSticky, { stickyId }))).toBe("stage");
    await as(t, "ann").mutation(api.retro.updateSticky, { stickyId, text: "Still mine" });
    expect((await stickyRow(t, stickyId)).text).toBe("Still mine");
  });

  it("once revealed, only the author or a facilitator rewrites or removes a sticky", async () => {
    const t = convexTest(schema, modules);
    const { roomId, bobId } = await seedRetro(t);
    const first = await stick(t, "ann", roomId, { text: "Mine" });
    const second = await stick(t, "ann", roomId, { text: "Also mine" });
    await setStep(t, roomId, "vote");

    expect(await refusalOf(as(t, "bob").mutation(api.retro.updateSticky, { stickyId: first, text: "Bob's" }))).toBe(
      "forbidden"
    );
    expect(await refusalOf(as(t, "bob").mutation(api.retro.deleteSticky, { stickyId: first }))).toBe("forbidden");

    await as(t, "ann").mutation(api.retro.updateSticky, { stickyId: first, text: "Still mine" });
    await as(t, "owner").mutation(api.retro.updateSticky, { stickyId: first, text: "Tidied by the owner" });
    expect((await stickyRow(t, first)).text).toBe("Tidied by the owner");
    await as(t, "owner").mutation(api.retro.deleteSticky, { stickyId: first });

    await as(t, "owner").mutation(api.roles.promoteFacilitator, { roomId, targetUserId: bobId });
    await as(t, "bob").mutation(api.retro.deleteSticky, { stickyId: second });
    expect(await stickiesIn(t, roomId)).toEqual([]);
  });

  it("someone outside the retro can't write on it", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    await seedUser(t, "outsider");

    await expect(stick(t, "outsider", roomId)).rejects.toThrow("Not a member of this room");
  });

  it("the owner alone changes the permissions, and may open the steps to everyone", async () => {
    const t = convexTest(schema, modules);
    const { roomId, bobId } = await seedRetro(t);
    await as(t, "owner").mutation(api.roles.promoteFacilitator, { roomId, targetUserId: bobId });
    const permissions = { ...DEFAULT_RETRO_PERMISSIONS, stageFlow: "everyone" as const };

    await expect(as(t, "bob").mutation(api.retro.updatePermissions, { roomId, permissions })).rejects.toThrow(
      "Only the owner can do this."
    );
    await as(t, "owner").mutation(api.retro.updatePermissions, { roomId, permissions });

    await as(t, "ann").mutation(api.retro.setStep, { roomId, step: "vote" });
    expect((await retroState(t, roomId)).step).toBe("vote");
  });
});

describe("action items", () => {
  it("anyone in the retro adds, updates and deletes them", async () => {
    const t = convexTest(schema, modules);
    const { roomId, annId } = await seedRetro(t);
    const items = () => as(t, "bob").query(api.retro.actionItems, { roomId });

    const itemId = await as(t, "ann").mutation(api.retro.addActionItem, { roomId, text: "  Fix the flaky test  " });
    const [added] = await items();
    expect(added).toMatchObject({ _id: itemId, text: "Fix the flaky test", done: false, carriedOver: false });
    expect(added).not.toHaveProperty("ownerId");

    await as(t, "bob").mutation(api.retro.updateActionItem, { itemId, done: true, ownerId: annId });
    expect((await items())[0]).toMatchObject({ done: true, ownerId: annId, ownerName: "ann" });

    await as(t, "bob").mutation(api.retro.updateActionItem, { itemId, ownerId: null });
    const [unowned] = await items();
    expect(unowned).toMatchObject({ text: "Fix the flaky test", done: true });
    expect(unowned).not.toHaveProperty("ownerId");
    expect(unowned).not.toHaveProperty("ownerName");

    await as(t, "ann").mutation(api.retro.deleteActionItem, { itemId });
    expect(await items()).toEqual([]);
  });

  it("are owned only by someone in the retro, and need a few words", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const outsiderId = await seedUser(t, "outsider");
    const ann = as(t, "ann");

    expect(await refusalOf(ann.mutation(api.retro.addActionItem, { roomId, text: "Do it", ownerId: outsiderId }))).toBe(
      "missing"
    );
    const itemId = await ann.mutation(api.retro.addActionItem, { roomId, text: "Do it" });
    expect(await refusalOf(ann.mutation(api.retro.updateActionItem, { itemId, ownerId: outsiderId }))).toBe("missing");
    expect(await refusalOf(ann.mutation(api.retro.addActionItem, { roomId, text: "   " }))).toBe("forbidden");
  });
});

describe("retro.startNext", () => {
  it("opens the next retro with the same columns and settings, carrying over only the open action items", async () => {
    const t = convexTest(schema, modules);
    const { roomId, ownerId, bobId } = await seedRetro(t);
    const owner = as(t, "owner");
    await owner.mutation(api.retro.updateSettings, { roomId, votesPerPerson: 5, showAuthors: true });
    await owner.mutation(api.retro.addColumn, { roomId, title: "Kudos", emoji: "🎉", color: "orange" });
    await as(t, "ann").mutation(api.retro.addActionItem, { roomId, text: "Still open", ownerId: bobId });
    const doneId = await owner.mutation(api.retro.addActionItem, { roomId, text: "Done already" });
    await owner.mutation(api.retro.updateActionItem, { itemId: doneId, done: true });
    await setStep(t, roomId, "done");

    const nextId = await owner.mutation(api.retro.startNext, { roomId });

    const previous = (await t.run((ctx) => ctx.db.get(roomId)))!;
    const next = (await t.run((ctx) => ctx.db.get(nextId)))!;
    expect(next).toMatchObject({ name: "Sprint 42 retro", roomType: "retro", ownerId, retained: true });
    expect(next.retro).toEqual({
      step: "write",
      columns: previous.retro!.columns,
      votesPerPerson: 5,
      showAuthors: true,
    });
    expect(previous.retro!.nextRoomId).toBe(nextId);
    expect(await padsIn(t, nextId)).toHaveLength(4);

    const carried = await t.run((ctx) =>
      ctx.db.query("retroActionItems").withIndex("by_room", (q) => q.eq("roomId", nextId)).collect()
    );
    expect(carried).toEqual([
      expect.objectContaining({ text: "Still open", done: false, ownerId: bobId, carriedOver: true }),
    ]);

    // Asking again follows the link rather than opening another.
    expect(await owner.mutation(api.retro.startNext, { roomId })).toBe(nextId);
    expect(await t.run((ctx) => ctx.db.query("rooms").collect())).toHaveLength(2);
  });
});

describe("columns", () => {
  it("a new column gets its pad one step right of the rightmost", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const before = await padsIn(t, roomId);

    const columnId = await as(t, "owner").mutation(api.retro.addColumn, {
      roomId,
      title: "Kudos",
      emoji: "🎉",
      color: "orange",
    });

    expect(columnId).toBe("c4");
    expect((await retroState(t, roomId)).columns.at(-1)).toEqual({
      id: "c4",
      title: "Kudos",
      emoji: "🎉",
      color: "orange",
    });
    const pad = (await padsIn(t, roomId)).find((p) => p.nodeId === "pad-c4");
    expect(pad).toMatchObject({
      data: { columnId: "c4" },
      position: nextPadPosition(before.map((p) => p.position)),
    });
  });

  it("a column with stickies stays, and so does the last one", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const remove = (columnId: string) => as(t, "owner").mutation(api.retro.removeColumn, { roomId, columnId });
    const stickyId = await stick(t, "ann", roomId, { columnId: "c1" });

    await expect(remove("c1")).rejects.toThrow("Move or delete this column's stickies first.");
    await remove("c2");
    await remove("c3");
    expect((await retroState(t, roomId)).columns.map((c) => c.id)).toEqual(["c1"]);
    expect((await padsIn(t, roomId)).map((p) => p.nodeId)).toEqual(["pad-c1"]);

    await as(t, "ann").mutation(api.retro.deleteSticky, { stickyId });
    await expect(remove("c1")).rejects.toThrow("A retro needs at least one column.");
  });
});

describe("retro.listMine", () => {
  it("lists the retros the person joined, newest first, and never a poker room", async () => {
    const t = convexTest(schema, modules);
    const { roomId: first } = await seedRetro(t);
    const owner = as(t, "owner");
    const pokerId = await owner.mutation(api.rooms.create, { name: "Planning" });
    await join(t, pokerId, "owner");
    const second = await owner.mutation(api.retro.create, { name: "Sprint 42 retro" });
    await join(t, second, "owner");
    await owner.mutation(api.retro.addActionItem, { roomId: first, text: "Open" });
    // A retro the owner never joined.
    await seedUser(t, "zed");
    const zeds = await as(t, "zed").mutation(api.retro.create, { name: "Zed's retro" });
    await join(t, zeds, "zed");

    const listed = await owner.query(api.retro.listMine, {});

    expect(listed.map((r) => r.roomId)).toEqual([second, first]);
    expect(listed[1]).toMatchObject({
      name: "Sprint 41 retro",
      step: "write",
      retained: true,
      openActions: 1,
      doneActions: 0,
    });
  });

  it("is empty for a visitor without an account, even one already signed in", async () => {
    const t = convexTest(schema, modules);

    expect(await t.query(api.retro.listMine, {})).toEqual([]);
    // A fresh session that has joined nothing has no user row yet.
    expect(await as(t, "fresh").query(api.retro.listMine, {})).toEqual([]);
  });
});

describe("retro.remove", () => {
  it("is the owner's alone, and takes every sticky, vote, action item, node and membership with the room", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const a = await stick(t, "ann", roomId);
    await setStep(t, roomId, "vote");
    await vote(t, "bob", a);
    await as(t, "ann").mutation(api.retro.addActionItem, { roomId, text: "Do it" });

    await expect(as(t, "ann").mutation(api.retro.remove, { roomId })).rejects.toThrow("Only the owner can do this.");

    await as(t, "owner").mutation(api.retro.remove, { roomId });
    await drainScheduled(t);

    expect(await t.run((ctx) => ctx.db.get(roomId))).toBeNull();
    for (const table of ["retroStickies", "retroStickyVotes", "retroActionItems", "canvasNodes", "roomMemberships"] as const) {
      expect(await t.run((ctx) => ctx.db.query(table).collect()), table).toEqual([]);
    }
  });
});

describe("account linking", () => {
  it("re-points a guest's stickies, votes and action items to the permanent account they sign in to", async () => {
    const t = convexTest(schema, modules);
    const { roomId, annId } = await seedRetro(t);
    const stickyId = await stick(t, "ann", roomId);
    await setStep(t, roomId, "vote");
    await vote(t, "ann", stickyId);
    const itemId = await as(t, "ann").mutation(api.retro.addActionItem, { roomId, text: "Do it", ownerId: annId });
    const permanentId = await seedUser(t, "ann-permanent", "permanent");

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "ann",
      newAuthUserId: "ann-permanent",
      email: "ann@example.com",
    });

    expect(await t.run((ctx) => ctx.db.get(annId))).toBeNull();
    expect((await stickyRow(t, stickyId)).authorId).toBe(permanentId);
    expect((await votesIn(t, roomId)).map((v) => v.voterId)).toEqual([permanentId]);
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({ ownerId: permanentId });
    // The account now reads the sticky, and the vote, as its own.
    expect(await seen(t, "ann-permanent", roomId, stickyId)).toMatchObject({ mine: true, myVote: true });
  });
});

describe("account linking — votes", () => {
  it("drops a guest's votes in a retro where the permanent account already voted, instead of doubling them", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const first = await stick(t, "owner", roomId, { text: "First" });
    const second = await stick(t, "owner", roomId, { text: "Second" });
    const permanentId = await seedUser(t, "ann-permanent", "permanent");
    await join(t, roomId, "ann-permanent");
    await setStep(t, roomId, "vote");
    await vote(t, "ann", first);
    await vote(t, "ann", second);
    await vote(t, "ann-permanent", first);

    await t.mutation(internal.users.linkAnonymousAccount, {
      oldAuthUserId: "ann",
      newAuthUserId: "ann-permanent",
      email: "ann@example.com",
    });

    const votes = await votesIn(t, roomId);
    expect(votes).toHaveLength(1);
    expect(votes[0]).toMatchObject({ stickyId: first, voterId: permanentId });
  });
});

describe("guards", () => {
  it("walks the topics only in Discuss", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    await stick(t, "owner", roomId);
    const step = () => as(t, "owner").mutation(api.retro.stepDiscussion, { roomId, direction: "next" });
    expect(await refusalOf(step())).toBe("stage");
    await setStep(t, roomId, "discuss");
    expect(await refusalOf(step())).toBe("resolved");
  });

  it("refuses a malformed client id rather than storing a shortened one", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    expect(await refusalOf(stick(t, "ann", roomId, { clientId: "x".repeat(65) }))).toBe("forbidden");
    expect(await refusalOf(stick(t, "ann", roomId, { clientId: "x".repeat(64) }))).toBe("resolved");
  });

  it("refuses a votes-per-person that is not a number", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const set = (votesPerPerson: number) =>
      as(t, "owner").mutation(api.retro.updateSettings, { roomId, votesPerPerson });
    expect(await refusalOf(set(Number.NaN))).toBe("forbidden");
    await set(99);
    expect((await retroState(t, roomId)).votesPerPerson).toBe(10);
  });

  it("refuses a sticky height that is not a number, and keeps a made-up one within bounds", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRetro(t);
    const stickyId = await stick(t, "ann", roomId);
    const measure = (height: number) =>
      as(t, "ann").mutation(api.retro.measureStickies, { roomId, heights: [{ stickyId, height }] });

    expect(await refusalOf(measure(Number.NaN))).toBe("forbidden");
    await measure(1e9);
    expect((await stickyRow(t, stickyId)).height).toBe(20_000);
    await measure(3);
    expect((await stickyRow(t, stickyId)).height).toBe(FACE_DOWN_HEIGHT);
  });
});

describe("transferring a retro", () => {
  it("keeps a guest's retro once it is handed to a permanent account", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "guest", "anonymous");
    const roomId = await as(t, "guest").mutation(api.retro.create, { name: "Guest retro" });
    await join(t, roomId, "guest");
    const keeperId = await seedUser(t, "keeper", "permanent");
    await join(t, roomId, "keeper");
    expect((await t.run((ctx) => ctx.db.get(roomId)))!.retained).toBe(false);

    await as(t, "guest").mutation(api.roles.transferOwnership, { roomId, targetUserId: keeperId });

    expect((await t.run((ctx) => ctx.db.get(roomId)))!).toMatchObject({ ownerId: keeperId, retained: true });
  });
});
