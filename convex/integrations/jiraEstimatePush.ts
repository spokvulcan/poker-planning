/**
 * The Jira adapter's side of the estimate push (model/estimatePush.ts), as
 * the provider registry routes to it: where a settled estimate goes on Jira,
 * and handing a decided push to the action that writes it there
 * (pushEstimate in jira.ts), which reports back how it went.
 *
 * An imported issue's link is its key's page on the site it was imported
 * from, and the mapping's connection acts on its own site, which can be
 * another (two people in a room, each connected to their own Atlassian site).
 * The same key on another site is another issue, so an estimate goes only to
 * an issue on the connection's site, as a webhook's change follows a link only
 * on the site it came from.
 */

import { internal } from "../_generated/api";
import type { EstimatePusher } from "./registry";
import { isJiraIssueOn } from "./jiraIssueLink";

export const jiraEstimatePush: EstimatePusher = {
  targetOf(link, connection) {
    if (!connection.siteUrl) return { ok: false, outcome: "connectionUnusable" };
    if (!isJiraIssueOn(link, connection.siteUrl)) return { ok: false, outcome: "otherSite" };
    return { ok: true, site: connection.siteUrl, issueKey: link.externalId };
  },

  async dispatch(ctx, push) {
    await ctx.scheduler.runAfter(0, internal.integrations.jira.pushEstimate, { push });
  },
};
