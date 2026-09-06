import { Metadata } from "next";
import { FeaturesContent } from "./features-content";
import { META } from "./copy";

export const metadata: Metadata = {
  title: META.title,
  description: META.description,
  openGraph: {
    title: META.openGraph.title,
    description: META.openGraph.description,
    url: "https://agilekit.app/features",
  },
  alternates: {
    canonical: "https://agilekit.app/features",
  },
};

export default function FeaturesPage() {
  return <FeaturesContent />;
}
