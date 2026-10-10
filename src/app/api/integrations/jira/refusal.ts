import type { JiraConnectRefusal } from "@/convex/integrations/jiraAuth";
import { refusalOf } from "@/convex/model/refusal";

/**
 * Why connecting Jira failed, as the settings page's `error=` param names it
 * and its copy explains it: a step of the handshake Convex refused by rule,
 * or one these routes refuse themselves.
 */
export type JiraConnectError =
  | JiraConnectRefusal["code"]
  | "jira_unauthorized"
  | "jira_authorize_failed"
  | "jira_denied"
  | "jira_invalid"
  | "jira_state_mismatch"
  | "jira_store_failed";

/** The settings page, telling the person connecting Jira why it failed. */
export function jiraConnectFailed(error: JiraConnectError): string {
  return `/dashboard/settings?tab=integrations&error=${error}`;
}

/**
 * The code Convex refused a step of the Jira OAuth handshake with, when it
 * refused by rule. The code is also the settings page's `error=` param, so
 * the person sees the copy for that step.
 */
export function jiraRefusalCode(error: unknown): JiraConnectRefusal["code"] | undefined {
  return refusalOf<JiraConnectRefusal["code"]>(error)?.code;
}
