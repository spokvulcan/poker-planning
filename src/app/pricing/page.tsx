import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { PricingContent } from "./pricing-content";

export const metadata: Metadata = pageMetadata({
  title: "Pricing and Launch Status",
  description:
    "AgileKit core features are free today. Pro is in development, and launch pricing will be published here before checkout goes live.",
  path: "/pricing",
});

export default function PricingPage() {
  return <PricingContent />;
}
