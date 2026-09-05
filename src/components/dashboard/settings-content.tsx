"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Puzzle, UserRound } from "lucide-react";
import { IntegrationsSettings } from "./integrations-settings";
import { AccountSettings } from "./account-settings";
import { ACCOUNT_TAB_LABEL, SETTINGS_PAGE_DESCRIPTION } from "@/convex/retroCopy";

function SettingsTabs() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabFromUrl ?? "account");

  const tabs = [
    { id: "account", label: ACCOUNT_TAB_LABEL, icon: UserRound },
    { id: "integrations", label: "Integrations", icon: Puzzle },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {SETTINGS_PAGE_DESCRIPTION}
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div>
        {activeTab === "account" && <AccountSettings />}
        {activeTab === "integrations" && <IntegrationsSettings />}
      </div>
    </div>
  );
}

export function SettingsContent() {
  return (
    <div className="p-6 max-w-4xl">
      <Suspense fallback={<div className="p-6">Loading settings...</div>}>
        <SettingsTabs />
      </Suspense>
    </div>
  );
}
