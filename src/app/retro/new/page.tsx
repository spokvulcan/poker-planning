import { Metadata } from "next";
import { CreateRetroContent } from "./create-content";

export const metadata: Metadata = {
  title: "New Retrospective",
  description:
    "Start a new retrospective. Pick a format and open a board your team can write on together, in the meeting or before it.",
  openGraph: {
    title: "New Retrospective - AgileKit",
    description: "Start a new retrospective with your team.",
    url: "https://agilekit.app/retro/new",
  },
  alternates: {
    canonical: "https://agilekit.app/retro/new",
  },
};

export default function NewRetroPage() {
  return <CreateRetroContent />;
}
