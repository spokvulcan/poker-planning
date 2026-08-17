import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily at 3 AM UTC
crons.daily(
  "cleanup-inactive-rooms",
  { hourUTC: 3, minuteUTC: 0 },
  internal.cleanup.removeInactiveRooms
);

// Refresh OAuth tokens expiring in the next 45 minutes (iterates the
// provider registry — every registered provider's connections are swept)
crons.interval(
  "refresh-oauth-tokens",
  { minutes: 30 },
  internal.integrations.tokenRefresh.refreshExpiringTokens
);

// Re-register Jira webhooks (they expire after 30 days)
crons.weekly(
  "refresh-jira-webhooks",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.integrations.jira.refreshJiraWebhooks
);

// Clean up old webhook dedup events (>7 days)
crons.daily(
  "cleanup-webhook-events",
  { hourUTC: 4, minuteUTC: 0 },
  internal.integrations.jira.cleanupOldWebhookEvents
);

// Sweep orphaned rows (rows whose room/issue is gone) — the safety net under
// the room cascade
crons.daily(
  "cleanup-orphaned-data",
  { hourUTC: 5, minuteUTC: 0 },
  internal.maintenance.cleanupOrphanedData
);

export default crons;