import { Metadata } from "next";
import { RetrosContent } from "./retros-content";

export const metadata: Metadata = {
  title: "Retros",
  description: "Your retrospectives",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RetrosPage() {
  return <RetrosContent />;
}
