import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { TermsContent } from "./terms-content";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "Review AgileKit's terms of service, acceptable use rules, and billing terms for any future paid features.",
  path: "/terms",
});

export default function TermsPage() {
  return <TermsContent />;
}
