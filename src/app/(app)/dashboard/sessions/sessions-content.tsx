"use client";

import { api } from "@/convex/_generated/api";
import { useCallerQuery } from "@/components/auth/use-caller-query";
import { DashboardHeader, SessionHistory } from "@/components/dashboard";
import { useDateRange } from "@/components/dashboard/date-range-context";

export function SessionsContent() {
  const { dateRange } = useDateRange();

  const sessions = useCallerQuery(api.analytics.getSessions, { dateRange });

  const isLoading = sessions === undefined;

  return (
    <>
      <DashboardHeader title="Sessions" />
      <div className="flex-1 p-6">
        <SessionHistory sessions={sessions ?? []} isLoading={isLoading} />
      </div>
    </>
  );
}
