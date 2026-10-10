import { Metadata } from "next";
import { DashboardContent } from "./dashboard-content";

export const metadata: Metadata = {
  title: "Analytics Dashboard",
  description: "Track your estimation sessions, team agreement, and velocity trends",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardPage() {
  return <DashboardContent />;
}
