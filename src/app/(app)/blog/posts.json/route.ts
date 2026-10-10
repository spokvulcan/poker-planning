import { getPosts } from "../posts";

// What the command menu searches: every post's slug, title and tags. The
// posts are files on the server, so the menu asks here the first time it opens.
export const revalidate = 3600;

export async function GET() {
  const posts = await getPosts();
  return Response.json(posts.map(({ slug, title, tags }) => ({ slug, title, tags })));
}
