import { Metadata } from "next";
import { SettingsContent } from "@/components/dashboard/settings-content";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your integrations and preferences",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SettingsPage() {
  return <SettingsContent />;
}
