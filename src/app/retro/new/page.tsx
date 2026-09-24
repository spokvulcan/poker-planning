import { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/page-metadata";
import { CreateRetroContent } from "./create-content";

export const metadata: Metadata = pageMetadata({
  title: "New Retrospective",
  description:
    "Start a new retrospective. Pick a format and open a board your team can write on together, in the meeting or before it.",
  path: "/retro/new",
  social: {
    title: "New Retrospective | AgileKit",
    description: "Start a new retrospective with your team.",
  },
});

export default function NewRetroPage() {
  // The team picker reads `?team=` (useSearchParams), which needs a
  // Suspense boundary for the static shell.
  return (
    <Suspense fallback={null}>
      <CreateRetroContent />
    </Suspense>
  );
}
