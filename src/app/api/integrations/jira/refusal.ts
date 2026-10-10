import { ConvexError } from "convex/values";
import type { JiraConnectRefusal } from "@/convex/integrations/jiraAuth";

/**
 * The code Convex refused a step of the Jira OAuth handshake with, when it
 * refused by rule. The code is also the settings page's `error=` param, so
 * the person sees the copy for that step.
 */
export function jiraRefusalCode(
  error: unknown
): JiraConnectRefusal["code"] | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  return (error.data as Partial<JiraConnectRefusal> | undefined)?.code;
}
