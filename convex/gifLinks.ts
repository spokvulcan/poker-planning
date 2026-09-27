/**
 * The GIF links a retro sticky may carry, shared by the model (which stores
 * only these) and the GIF picker (which previews only these). Pure.
 */

const GIPHY_MEDIA_HOST = /^(media\d?|i)\.giphy\.com$/;
const TENOR_MEDIA_HOST = /^(media\d?|c)\.tenor\.com$/;
const IMGUR_MEDIA_HOST = /^i\.imgur\.com$/;
const IMAGE_PATH = /\.(gif|webp|png|jpe?g)$/i;

/**
 * The link a sticky stores for a GIF, or null when the link is not one we
 * embed. Only GIPHY, Tenor and Imgur media hosts are embedded, over https,
 * so a sticky can never make every teammate's browser call an arbitrary
 * server. A GIPHY page link (giphy.com/gifs/…) is rewritten to its media
 * file; a Tenor page link cannot be, and is refused.
 */
export function normalizeGifUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();

  if (host === "giphy.com" || host === "www.giphy.com") {
    const match = url.pathname.match(/^\/(?:gifs|stickers)\/(?:[\w-]*-)?([A-Za-z0-9]+)\/?$/);
    return match ? `https://media.giphy.com/media/${match[1]}/giphy.gif` : null;
  }
  if (GIPHY_MEDIA_HOST.test(host) || TENOR_MEDIA_HOST.test(host)) {
    return url.toString();
  }
  if (IMGUR_MEDIA_HOST.test(host) && IMAGE_PATH.test(url.pathname)) {
    return url.toString();
  }
  return null;
}
