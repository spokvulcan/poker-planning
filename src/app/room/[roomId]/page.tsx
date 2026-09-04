import { Metadata } from "next";
import { RoomContent } from "./room-content";

export const metadata: Metadata = {
  title: "Planning Room",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CanvasRoomPage() {
  return <RoomContent />;
}
