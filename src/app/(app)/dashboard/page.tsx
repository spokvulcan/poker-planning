import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { DashboardContent } from "./dashboard-content";

export const metadata: Metadata = pageMetadata({
  title: "Analytics Dashboard",
  description: "Track your estimation sessions, team agreement, and velocity trends",
  path: "/dashboard",
});

export default function DashboardPage() {
  return <DashboardContent />;
}
