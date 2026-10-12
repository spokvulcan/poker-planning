"use client";

import {
  ArrowDown,
  ArrowUp,
  Equal,
  Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardPanel } from "./dashboard-panel";

interface VoterUser {
  userId: string;
  userName: string;
  totalVotes: number;
  agreesWithConsensus: number;
  agreementRate: number;
  averageDelta: number | null;
  tendency: "under" | "over" | "aligned" | "unknown";
}

interface IndividualVotingStatsProps {
  data: VoterUser[];
  isLoading?: boolean;
}

function getAgreementBadge(rate: number) {
  if (rate >= 70)
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-status-success-bg dark:text-status-success-fg">
        {rate}%
      </Badge>
    );
  if (rate >= 40)
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-status-warning-bg dark:text-status-warning-fg">
        {rate}%
      </Badge>
    );
  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-status-error-bg dark:text-status-error-fg">
      {rate}%
    </Badge>
  );
}

function getTendencyIcon(tendency: "under" | "over" | "aligned" | "unknown") {
  switch (tendency) {
    case "under":
      return <ArrowDown className="h-4 w-4 text-blue-500" />;
    case "over":
      return <ArrowUp className="h-4 w-4 text-orange-500" />;
    case "aligned":
      return <Equal className="h-4 w-4 text-green-500" />;
    case "unknown":
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
}

function getTendencyLabel(tendency: "under" | "over" | "aligned" | "unknown") {
  switch (tendency) {
    case "under":
      return "Under";
    case "over":
      return "Over";
    case "aligned":
      return "Aligned";
    case "unknown":
      return "N/A";
  }
}

export function IndividualVotingStats({
  data,
  isLoading,
}: IndividualVotingStatsProps) {
  return (
    <DashboardPanel
      title="Individual Voting Stats"
      help="Per-voter agreement rate and estimation tendency. Intended for coaching, not performance evaluation."
      description="Per-voter alignment with consensus"
      layout="table"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      emptyText="No individual vote data yet"
    >
      <div className="max-h-[280px] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 text-center font-medium">Votes</th>
              <th className="pb-2 text-center font-medium">Agreement</th>
              <th className="pb-2 text-center font-medium">Avg Delta</th>
              <th className="pb-2 text-center font-medium">Tendency</th>
            </tr>
          </thead>
          <tbody>
            {data.map((user) => (
              <tr key={user.userId} className="border-b last:border-0">
                <td className="py-2 font-medium">{user.userName}</td>
                <td className="py-2 text-center">{user.totalVotes}</td>
                <td className="py-2 text-center">
                  {getAgreementBadge(user.agreementRate)}
                </td>
                <td className="py-2 text-center">
                  {user.averageDelta !== null
                    ? `${user.averageDelta > 0 ? "+" : ""}${user.averageDelta.toFixed(1)}`
                    : "—"}
                </td>
                <td className="py-2">
                  <div className="flex items-center justify-center gap-1">
                    {getTendencyIcon(user.tendency)}
                    <span className="text-xs text-muted-foreground">
                      {getTendencyLabel(user.tendency)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Based on anonymized team voting patterns
      </p>
    </DashboardPanel>
  );
}
