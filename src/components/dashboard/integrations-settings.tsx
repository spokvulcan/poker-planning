"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { JiraConnectionCard } from "./jira-connection-card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";

export function IntegrationsSettings() {
  const connections = useQuery(api.integrations.getConnections);
  const searchParams = useSearchParams();

  const jiraConnection = connections?.find((c) => c.provider === "jira");

  // Show toast on successful connection
  useEffect(() => {
    if (searchParams.get("connected") === "jira") {
      toast.success("Jira connected", {
        description: "Your Jira Cloud account has been connected successfully.",
      });
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    }

    const error = searchParams.get("error");
    if (error?.startsWith("jira_")) {
      const messages: Record<string, string> = {
        jira_unauthorized: "You must be signed in to connect Jira.",
        jira_not_configured:
          "Jira integration is not configured. Please contact the administrator.",
        jira_denied: "Jira authorization was denied.",
        jira_invalid: "Invalid callback parameters.",
        jira_state_mismatch: "Security check failed. Please try again.",
        jira_token_failed: "Failed to exchange authorization code.",
        jira_resources_failed: "Could not fetch Jira site information.",
        jira_no_site: "No Jira site found for your account.",
        jira_no_user: "Could not identify your user account.",
        jira_store_failed: "Failed to save connection.",
      };
      toast.error("Jira connection failed", {
        description: messages[error] ?? "An unknown error occurred.",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  if (connections === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Connected Services</h2>
        <p className="text-sm text-muted-foreground">
          Connect external tools to import issues and sync estimates.
        </p>
      </div>
      <JiraConnectionCard connection={jiraConnection ?? null} />
    </div>
  );
}
