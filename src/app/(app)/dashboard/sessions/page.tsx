import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { SessionsContent } from "./sessions-content";

export const metadata: Metadata = pageMetadata({
  title: "Sessions",
  description: "View your planning poker session history and details",
  path: "/dashboard/sessions",
});

export default function SessionsPage() {
  return <SessionsContent />;
}
