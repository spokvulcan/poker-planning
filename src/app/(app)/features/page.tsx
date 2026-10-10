import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { FeaturesContent } from "./features-content";
import { META } from "./copy";

export const metadata: Metadata = pageMetadata({
  title: META.title,
  description: META.description,
  path: "/features",
  social: META.openGraph,
});

export default function FeaturesPage() {
  return <FeaturesContent />;
}
