import { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { SettingsContent } from "@/components/dashboard/settings-content";

export const metadata: Metadata = pageMetadata({
  title: "Settings",
  description: "Manage your integrations and preferences",
  path: "/dashboard/settings",
});

export default function SettingsPage() {
  return <SettingsContent />;
}
