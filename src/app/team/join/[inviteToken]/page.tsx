import { Metadata } from "next";
import { JoinTeamContent } from "./join-content";

export const metadata: Metadata = {
  title: "Join team",
  robots: {
    index: false,
    follow: false,
  },
};

export default function JoinTeamPage() {
  return <JoinTeamContent />;
}
