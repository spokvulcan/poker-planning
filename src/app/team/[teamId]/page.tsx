import { Metadata } from "next";
import { TeamContent } from "./team-content";

export const metadata: Metadata = {
  title: "Team",
  robots: {
    index: false,
    follow: false,
  },
};

export default function TeamPage() {
  return <TeamContent />;
}
