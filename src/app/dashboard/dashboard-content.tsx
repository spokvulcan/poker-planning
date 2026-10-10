"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EMPTY_DASHBOARD } from "@/convex/analyticsMath";
import { useAuth } from "@/components/auth/auth-provider";
import {
  DashboardHeader,
  StatsSummary,
  SessionHistory,
  AgreementChart,
  VoteDistribution,
  TimeToConsensusCard,
  ConsensusOutliers,
  ConsensusTrend,
  VoterAlignmentChart,
  IndividualVotingStats,
  PredictabilityGauge,
  VelocityTrend,
  DashboardBanner,
} from "@/components/dashboard";
import { useDateRange } from "@/components/dashboard/date-range-context";

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    </div>
  );
}

export function DashboardContent() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { dateRange } = useDateRange();

  // One read behind every panel: the viewer's history is loaded once.
  const dashboard = useQuery(
    api.analytics.getDashboard,
    isAuthenticated ? { dateRange } : "skip"
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/auth/signin?from=/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return <LoadingState />;
  }

  // One loading branch: until the read lands every panel shows its skeleton,
  // handed the dashboard's empty state in place of numbers it doesn't show.
  const isLoading = dashboard === undefined;
  const {
    summary,
    sessions,
    agreementTrend,
    voteDistribution,
    timeToConsensus,
    voterAlignment,
    predictability,
  } = dashboard ?? EMPTY_DASHBOARD;

  return (
    <>
      <DashboardHeader title="Overview" />
      <main className="flex-1 p-6">
        <DashboardBanner />
        {/* Stats Summary & Time to Consensus */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatsSummary
            totalSessions={summary.totalSessions}
            totalIssuesEstimated={summary.totalIssuesEstimated}
            totalStoryPoints={summary.totalStoryPoints}
            averageAgreement={summary.averageAgreement}
            isLoading={isLoading}
          />
          <TimeToConsensusCard
            averageMs={timeToConsensus.averageMs}
            medianMs={timeToConsensus.medianMs}
            trendBySession={timeToConsensus.trendBySession}
            isLoading={isLoading}
          />
        </div>

        {/* Predictability + Velocity Trend */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <PredictabilityGauge
            score={predictability.predictabilityScore}
            averageVelocityPerSession={predictability.averageVelocityPerSession}
            velocityTrend={predictability.velocityTrend}
            averageAgreement={predictability.averageAgreement}
            agreementTrend={predictability.agreementTrend}
            isLoading={isLoading}
          />
          <VoterAlignmentChart
            data={voterAlignment.scatterPoints}
            isLoading={isLoading}
          />
        </div>

        {/* Agreement + Consensus Charts */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <AgreementChart data={agreementTrend} isLoading={isLoading} />
          <ConsensusOutliers
            data={timeToConsensus.outliers}
            averageMs={timeToConsensus.averageMs}
            isLoading={isLoading}
          />
        </div>

        {/* Consensus Trend + Voter Alignment + Vote Distribution */}
        <div className="mb-8 grid gap-6 lg:grid-cols-3">
          <ConsensusTrend
            data={timeToConsensus.trendBySession}
            isLoading={isLoading}
          />
          <VelocityTrend
            sessions={predictability.sessions}
            velocityTrend={predictability.velocityTrend}
            isLoading={isLoading}
          />
          <VoteDistribution data={voteDistribution} isLoading={isLoading} />
        </div>

        {/* Individual Voting Stats */}
        <div className="mb-8">
          <IndividualVotingStats
            data={voterAlignment.users}
            isLoading={isLoading}
          />
        </div>

        {/* Session History */}
        <div className="mb-8">
          <SessionHistory sessions={sessions} isLoading={isLoading} />
        </div>
      </main>
    </>
  );
}
