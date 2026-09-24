import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { AboutContent } from "./about-content";
import { META } from "./copy";

export const metadata: Metadata = pageMetadata({
  // The title already names AgileKit; the template would repeat it.
  title: { absolute: META.title },
  description: META.description,
  path: "/about",
  social: META.openGraph,
});

export default function AboutPage() {
  return <AboutContent />;
}
