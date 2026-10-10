import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily at 3:17 AM UTC, the sweep ends what is stale, a page at a time: rooms
// nobody keeps after five quiet days, and what rooms deleted some other way
// left behind (model/roomEnding.ts)
crons.cron("end-stale-rooms", "17 3 * * *", internal.maintenance.endStaleRooms, {});

// Refresh OAuth tokens expiring in the next 45 minutes (iterates the
// provider registry — every registered provider's connections are swept)
crons.interval(
  "refresh-oauth-tokens",
  { minutes: 30 },
  internal.integrations.tokenRefresh.refreshExpiringTokens
);

// Weekly on Sunday at 2:23 AM UTC, re-register Jira webhooks (they expire
// after 30 days), through each mapping's webhook reconcile
crons.cron("refresh-jira-webhooks", "23 2 * * 0", internal.integrations.jira.refreshJiraWebhooks, {});

// Daily at 4:41 AM UTC, clean up old webhook dedup events (>7 days)
crons.cron("cleanup-webhook-events", "41 4 * * *", internal.integrations.jira.cleanupOldWebhookEvents, {});

export default crons;