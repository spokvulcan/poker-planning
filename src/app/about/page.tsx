import { Metadata } from "next";
import { AboutContent } from "./about-content";
import { META } from "./copy";

export const metadata: Metadata = {
  title: META.title,
  description: META.description,
  openGraph: {
    title: META.openGraph.title,
    description: META.openGraph.description,
    url: "https://agilekit.app/about",
  },
  alternates: {
    canonical: "https://agilekit.app/about",
  },
};

export default function AboutPage() {
  return <AboutContent />;
}
