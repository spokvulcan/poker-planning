/**
 * How AgileKit names a Jira issue: its title in a room, and its link, a page
 * on the site it is on. The page says which site the issue is on, so the same
 * key on two sites is two links, and two issues: the webhook boundary follows
 * a change only to the link of the site it came from, and the estimate push
 * writes only to the issue on the site the mapping's connection acts on.
 *
 * A leaf (it imports types alone), so the provider registry's Jira pieces can
 * use it without reaching the adapter's actions or the model.
 */

import type { IssueLink } from "../model/issues";

/** An imported Jira issue's title: its key and its summary. */
export function jiraIssueTitle(key: string, summary: string): string {
  return `${key} - ${summary}`;
}

/**
 * An imported Jira issue's link: its key, and its page on the site it was
 * imported from.
 */
export function jiraIssueLink(site: string, key: string): IssueLink {
  return { provider: "jira", externalId: key, externalUrl: `${site}/browse/${key}` };
}

/**
 * Whether the link is the issue on `site`: its page is that site's page for
 * its key. A link imported before imports knew their site names none.
 */
export function isJiraIssueOn(link: IssueLink, site: string): boolean {
  return link.provider === "jira" && link.externalUrl === jiraIssueLink(site, link.externalId).externalUrl;
}
