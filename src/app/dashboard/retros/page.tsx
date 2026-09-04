import { Metadata } from "next";
import { RetrosContent } from "./retros-content";

export const metadata: Metadata = {
  title: "Retros | AgileKit",
  description: "Your teams and retrospectives",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RetrosPage() {
  return <RetrosContent />;
}
