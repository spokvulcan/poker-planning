import { describe, it, expect } from "vitest";
import { normalizeGifUrl } from "./gifLinks";

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
