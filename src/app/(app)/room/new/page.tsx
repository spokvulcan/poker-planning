import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { CreateContent } from "./create-content";

export const metadata: Metadata = pageMetadata({
  title: "New Planning Poker Game",
  description:
    "Create a new planning poker session. Choose your voting scale and start estimating with your team.",
  path: "/room/new",
  social: {
    title: "New Planning Poker Game | AgileKit",
    description: "Create a new planning poker session with your team.",
  },
});

export default function CreatePage() {
  return <CreateContent />;
}
