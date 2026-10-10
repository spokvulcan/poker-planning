import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { RetrosContent } from "./retros-content";

export const metadata: Metadata = pageMetadata({
  title: "Retros",
  description: "Your retrospectives",
  path: "/dashboard/retros",
});

export default function RetrosPage() {
  return <RetrosContent />;
}
