import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { RoomContent } from "./room-content";

export const metadata: Metadata = pageMetadata({
  title: "Planning Room",
  path: "/room/[roomId]",
});

export default function CanvasRoomPage() {
  return <RoomContent />;
}
