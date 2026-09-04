import { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { RoomContent } from "./room-content";

const ROBOTS = { index: false, follow: false };

/**
 * A retro's page is titled by its name (spec §18.1); a poker room keeps
 * "Planning Room". `rooms.get` is unguarded, so the name is readable by
 * anyone with the link. A malformed id or an unreachable backend falls back
 * to the poker title rather than failing the page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ roomId: string }>;
}): Promise<Metadata> {
  const { roomId } = await params;
  let title = "Planning Room";
  try {
    const data = await fetchQuery(api.rooms.get, { roomId: roomId as Id<"rooms"> });
    if (data?.room.roomType === "retro") {
      title = data.room.name;
    }
  } catch {
    // Fall through to the default title.
  }
  return { title, robots: ROBOTS };
}

export default function CanvasRoomPage() {
  return <RoomContent />;
}
