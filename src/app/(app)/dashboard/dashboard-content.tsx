"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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

  const summary = useQuery(
    api.analytics.getSummary,
    isAuthenticated ? { dateRange } : "skip"
  );

  const sessions = useQuery(
    api.analytics.getSessions,
    isAuthenticated ? { dateRange } : "skip"
  );

  const agreementTrend = useQuery(
    api.analytics.getAgreementTrend,
    isAuthenticated ? { dateRange } : "skip"
  );

  const voteDistribution = useQuery(
    api.analytics.getVoteDistribution,
    isAuthenticated ? { dateRange } : "skip"
  );

  const timeToConsensus = useQuery(
    api.analytics.getTimeToConsensus,
    isAuthenticated ? { dateRange } : "skip"
  );

  const voterAlignment = useQuery(
    api.analytics.getVoterAlignment,
    isAuthenticated ? { dateRange } : "skip"
  );

  const predictability = useQuery(
    api.analytics.getPredictability,
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

  // Per-section loading states — each section shows its own skeleton
  // instead of blocking the entire dashboard on the slowest query.
  const summaryLoading = summary === undefined;
  const consensusLoading = timeToConsensus === undefined;
  const predictabilityLoading = predictability === undefined;
  const agreementLoading = agreementTrend === undefined;
  const alignmentLoading = voterAlignment === undefined;
  const distributionLoading = voteDistribution === undefined;
  const sessionsLoading = sessions === undefined;

  return (
    <>
      <DashboardHeader title="Overview" />
      <main className="flex-1 p-6">
        <DashboardBanner />
        {/* Stats Summary & Time to Consensus */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatsSummary
            totalSessions={summary?.totalSessions ?? 0}
            totalIssuesEstimated={summary?.totalIssuesEstimated ?? 0}
            totalStoryPoints={summary?.totalStoryPoints ?? null}
            averageAgreement={summary?.averageAgreement ?? null}
            isLoading={summaryLoading}
          />
          <TimeToConsensusCard
            averageMs={timeToConsensus?.averageMs ?? null}
            medianMs={timeToConsensus?.medianMs ?? null}
            trendBySession={timeToConsensus?.trendBySession ?? []}
            isLoading={consensusLoading}
          />
        </div>

        {/* Predictability + Velocity Trend */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <PredictabilityGauge
            score={predictability?.predictabilityScore ?? null}
            averageVelocityPerSession={
              predictability?.averageVelocityPerSession ?? 0
            }
            velocityTrend={predictability?.velocityTrend ?? "stable"}
            averageAgreement={predictability?.averageAgreement ?? 0}
            agreementTrend={predictability?.agreementTrend ?? "stable"}
            isLoading={predictabilityLoading}
          />
          <VoterAlignmentChart
            data={voterAlignment?.scatterPoints ?? []}
            isLoading={alignmentLoading}
          />
        </div>

        {/* Agreement + Consensus Charts */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <AgreementChart
            data={agreementTrend ?? []}
            isLoading={agreementLoading}
          />
          <ConsensusOutliers
            data={timeToConsensus?.outliers ?? []}
            averageMs={timeToConsensus?.averageMs ?? null}
            isLoading={consensusLoading}
          />
        </div>

        {/* Consensus Trend + Voter Alignment + Vote Distribution */}
        <div className="mb-8 grid gap-6 lg:grid-cols-3">
          <ConsensusTrend
            data={timeToConsensus?.trendBySession ?? []}
            isLoading={consensusLoading}
          />
          <VelocityTrend
            sessions={predictability?.sessions ?? []}
            velocityTrend={predictability?.velocityTrend ?? "stable"}
            isLoading={predictabilityLoading}
          />
          <VoteDistribution
            data={voteDistribution ?? []}
            isLoading={distributionLoading}
          />
        </div>

        {/* Individual Voting Stats */}
        <div className="mb-8">
          <IndividualVotingStats
            data={voterAlignment?.users ?? []}
            isLoading={alignmentLoading}
          />
        </div>

        {/* Session History */}
        <div className="mb-8">
          <SessionHistory
            sessions={sessions ?? []}
            isLoading={sessionsLoading}
          />
        </div>
      </main>
    </>
  );
}
