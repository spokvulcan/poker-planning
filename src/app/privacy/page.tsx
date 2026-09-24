import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { PrivacyContent } from "./privacy-content";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "Read how AgileKit handles account data, session data, cookies, and optional analytics.",
  path: "/privacy",
  social: { title: "Privacy Policy | AgileKit" },
});

export default function PrivacyPage() {
  return <PrivacyContent />;
}
