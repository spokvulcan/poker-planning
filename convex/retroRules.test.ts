import { describe, it, expect } from "vitest";
import {
  discussionOrder,
  normalizeGifUrl,
  rootOf,
  stepFocus,
  voteTotals,
  type StickyRef,
} from "./retroRules";

// The retro's pure rules: the model and the board derive the same stacks,
// totals, discussion walk and GIF links from the same rows.

const columns = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];

function sticky(_id: string, columnId: string, createdAt: number, stackId?: string): StickyRef {
  return { _id, columnId, createdAt, ...(stackId ? { stackId } : {}) };
}

describe("rootOf", () => {
  it("is the sticky itself when loose, and the sticky it is stacked under otherwise", () => {
    expect(rootOf({ _id: "a" })).toBe("a");
    expect(rootOf({ _id: "b", stackId: "a" })).toBe("a");
  });
});

describe("voteTotals", () => {
  const stickies = [sticky("a", "c1", 1), sticky("b", "c1", 2, "a"), sticky("c", "c2", 3)];

  it("counts a vote on a loose sticky for that sticky", () => {
    expect(voteTotals(stickies, [{ stickyId: "c" }, { stickyId: "c" }])).toEqual(new Map([["c", 2]]));
  });

  it("counts a vote on any sticky of a stack for the stack's top", () => {
    expect(voteTotals(stickies, [{ stickyId: "a" }, { stickyId: "b" }])).toEqual(new Map([["a", 2]]));
  });

  it("drops a vote on a sticky that is gone", () => {
    expect(voteTotals(stickies, [{ stickyId: "gone" }])).toEqual(new Map());
  });
});

describe("discussionOrder", () => {
  it("walks the topics that got a vote, most votes first, and leaves the rest out", () => {
    const stickies = [sticky("a", "c1", 1), sticky("b", "c1", 2), sticky("c", "c2", 3)];
    const totals = new Map([
      ["b", 1],
      ["c", 3],
    ]);

    expect(discussionOrder(stickies, totals, columns)).toEqual(["c", "b"]);
  });

  it("breaks a tie by column order, then by whichever was written first", () => {
    const stickies = [sticky("late-c1", "c1", 30), sticky("only-c2", "c2", 10), sticky("early-c1", "c1", 20)];
    const totals = new Map([
      ["late-c1", 2],
      ["only-c2", 2],
      ["early-c1", 2],
    ]);

    expect(discussionOrder(stickies, totals, columns)).toEqual(["early-c1", "late-c1", "only-c2"]);
  });

  it("with no votes at all, walks every topic column by column", () => {
    const stickies = [sticky("x", "c2", 1), sticky("y", "c1", 3), sticky("z", "c1", 2)];

    expect(discussionOrder(stickies, new Map(), columns)).toEqual(["z", "y", "x"]);
    expect(discussionOrder(stickies, new Map([["x", 0]]), columns)).toEqual(["z", "y", "x"]);
  });

  it("walks topics only: a stacked sticky comes up with its stack", () => {
    const stickies = [sticky("top", "c1", 1), sticky("under", "c1", 2, "top")];

    expect(discussionOrder(stickies, new Map(), columns)).toEqual(["top"]);
    expect(discussionOrder(stickies, new Map([["top", 1]]), columns)).toEqual(["top"]);
  });

  it("puts a sticky whose column is gone after every column still on the board", () => {
    const stickies = [sticky("orphan", "removed", 1), sticky("kept", "c3", 2)];

    expect(discussionOrder(stickies, new Map(), columns)).toEqual(["kept", "orphan"]);
  });
});

describe("stepFocus", () => {
  const order = ["a", "b", "c"];

  it("steps forward and back through the walk", () => {
    expect(stepFocus(order, "a", "next")).toBe("b");
    expect(stepFocus(order, "c", "previous")).toBe("b");
  });

  it("stays put past either end", () => {
    expect(stepFocus(order, "c", "next")).toBe("c");
    expect(stepFocus(order, "a", "previous")).toBe("a");
  });

  it("starts from the top when nothing, or a topic off the walk, is in focus", () => {
    expect(stepFocus(order, undefined, "next")).toBe("a");
    expect(stepFocus(order, undefined, "previous")).toBe("a");
    expect(stepFocus(order, "unvoted", "next")).toBe("a");
  });

  it("has nothing to focus on an empty walk", () => {
    expect(stepFocus([], undefined, "next")).toBeUndefined();
    expect(stepFocus([], "a", "previous")).toBeUndefined();
  });
});

describe("normalizeGifUrl", () => {
  const MEDIA = "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif";

  it("rewrites a GIPHY page link to its media file", () => {
    expect(normalizeGifUrl("https://giphy.com/gifs/funny-cat-3o7TKSjRrfIPjeiVyM")).toBe(MEDIA);
    expect(normalizeGifUrl("https://www.giphy.com/gifs/3o7TKSjRrfIPjeiVyM/")).toBe(MEDIA);
    expect(normalizeGifUrl("  https://giphy.com/gifs/3o7TKSjRrfIPjeiVyM  ")).toBe(MEDIA);
    expect(normalizeGifUrl("https://giphy.com/stickers/hello-xT9IgG50Fb7Mi0prBC")).toBe(
      "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif"
    );
  });

  it("refuses a GIPHY page that is not a GIF", () => {
    expect(normalizeGifUrl("https://giphy.com/explore/cats")).toBeNull();
  });

  it("keeps a link to a GIPHY or Tenor media host as it is", () => {
    for (const url of [
      MEDIA,
      "https://media2.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.webp",
      "https://i.giphy.com/3o7TKSjRrfIPjeiVyM.gif",
      "https://media.tenor.com/Xy12AbCdEfGAAAAC/cat-dance.gif",
      "https://c.tenor.com/Xy12AbCdEfGAAAAC/cat-dance.gif",
    ]) {
      expect(normalizeGifUrl(url)).toBe(url);
    }
  });

  it("keeps an Imgur image, but not an Imgur page", () => {
    expect(normalizeGifUrl("https://i.imgur.com/abc123.gif")).toBe("https://i.imgur.com/abc123.gif");
    expect(normalizeGifUrl("https://i.imgur.com/abc123.jpeg")).toBe("https://i.imgur.com/abc123.jpeg");
    expect(normalizeGifUrl("https://i.imgur.com/abc123")).toBeNull();
    expect(normalizeGifUrl("https://imgur.com/gallery/abc123")).toBeNull();
  });

  it("refuses a Tenor page link, which can't be turned into its media file", () => {
    expect(normalizeGifUrl("https://tenor.com/view/cat-dance-gif-12345")).toBeNull();
  });

  it("refuses plain http, any other host, and anything that is not a link", () => {
    expect(normalizeGifUrl("http://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif")).toBeNull();
    expect(normalizeGifUrl("https://example.com/cat.gif")).toBeNull();
    expect(normalizeGifUrl("https://media.giphy.com.example.net/cat.gif")).toBeNull();
    expect(normalizeGifUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeGifUrl("not a link")).toBeNull();
  });
});
