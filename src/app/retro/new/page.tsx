import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { CreateRetroContent } from "./create-content";

export const metadata: Metadata = pageMetadata({
  title: "New Retrospective",
  description:
    "Start a retro on a shared whiteboard. Sticky notes, GIFs, dot voting and action items, free and with no sign-up.",
  path: "/retro/new",
  social: {
    title: "New Retrospective | AgileKit",
    description: "Start a retro on a shared whiteboard with your team.",
  },
});

export default function NewRetroPage() {
  return <CreateRetroContent />;
}
