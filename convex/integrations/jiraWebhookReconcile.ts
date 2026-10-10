/**
 * The Jira adapter's webhook reconcile: the one owner of "each Jira mapping
 * has exactly one live webhook, registered with its own connection".
 *
 * A mapping wants one webhook for its project while auto-push is on, made
 * with the mapping's own connection, and none otherwise. Its record says
 * which webhook is live, the connection that made it and the project it was
 * made for; only this module writes it. Every caller that changes or ends a
 * mapping hands over its case through the provider registry: saving it, the
 * weekly renewal, removing it and its room ending (reconcile), and a
 * disconnect, with all of a connection's mappings at once (disconnect).
 * The decisions are pure (planWebhook, settleRegistration,
 * planDisconnect) and tested without Jira; the actions in jira.ts carry them
 * out and report each registration back (recordRegistration).
 *
 * A webhook is on the record or in the hands of one scheduled action, never
 * both: a decision that lets go of the recorded webhook clears the record in
 * the same transaction.
 */

import { v, type Infer } from "convex/values";
import { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { jiraWebhookFailureValidator } from "../schema";
import type { MappingChange, WebhookReconcile } from "./registry";

/** The webhook a mapping wants: one for its project, made with its own connection. */
export interface WantedWebhook {
  connectionId: Id<"integrationConnections">;
  projectKey: string;
}

/**
 * The webhook on a mapping's record: its Jira id, the connection that made
 * it, and the project it was made for (unknown for a webhook recorded before
 * the project was).
 */
export interface RecordedWebhook {
  webhookId: string;
  connectionId: Id<"integrationConnections">;
  projectKey?: string;
}

/** What reconciling a mapping's webhook does. */
export type WebhookPlan =
  | { kind: "keep" }
  | { kind: "register"; wanted: WantedWebhook }
  | { kind: "replace"; recorded: RecordedWebhook; wanted: WantedWebhook }
  | { kind: "remove"; recorded: RecordedWebhook };

/**
 * What a registration reports back, for the connection and project it
 * registered with: the webhook Jira made, or why it failed.
 */
export const registrationValidator = v.union(
  v.object({
    kind: v.literal("registered"),
    webhookId: v.string(),
    connectionId: v.id("integrationConnections"),
    projectKey: v.string(),
  }),
  v.object({
    kind: v.literal("failed"),
    failure: jiraWebhookFailureValidator,
    connectionId: v.id("integrationConnections"),
    projectKey: v.string(),
  })
);

export type Registration = Infer<typeof registrationValidator>;

export type JiraWebhookFailure = Infer<typeof jiraWebhookFailureValidator>;

/** What a landed registration does to the mapping's record. */
export type Settlement =
  /** Record the new webhook; any webhook it supersedes goes. */
  | { kind: "record"; webhook: RecordedWebhook; superseded: RecordedWebhook | null }
  /** The mapping no longer wants what was registered: the new webhook goes, unrecorded. */
  | { kind: "discard"; webhook: RecordedWebhook }
  | { kind: "fail"; failure: JiraWebhookFailure }
  | { kind: "ignore" };

export function wantedWebhookOf(mapping: Doc<"integrationMappings">): WantedWebhook | null {
  if (mapping.provider !== "jira" || !mapping.autoPushEstimates || !mapping.jiraProjectKey) {
    return null;
  }
  return { connectionId: mapping.connectionId, projectKey: mapping.jiraProjectKey };
}

/**
 * A webhook recorded before its connection was falls back to the mapping's
 * own: the connection the mapping had when the record was read.
 */
export function recordedWebhookOf(mapping: Doc<"integrationMappings">): RecordedWebhook | null {
  if (!mapping.jiraWebhookId) return null;
  return {
    webhookId: mapping.jiraWebhookId,
    connectionId: mapping.jiraWebhookConnectionId ?? mapping.connectionId,
    projectKey: mapping.jiraWebhookProjectKey,
  };
}

function serves(
  made: { connectionId: Id<"integrationConnections">; projectKey?: string },
  wanted: WantedWebhook
): boolean {
  return made.connectionId === wanted.connectionId && made.projectKey === wanted.projectKey;
}

/**
 * The decision table. A recorded webhook that serves what is wanted stays,
 * except on the weekly renewal, which registers it afresh before Jira drops
 * it at 30 days; any other recorded webhook goes, with the connection that
 * made it.
 */
export function planWebhook(
  wanted: WantedWebhook | null,
  recorded: RecordedWebhook | null,
  { renewal }: { renewal: boolean }
): WebhookPlan {
  if (!wanted) return recorded ? { kind: "remove", recorded } : { kind: "keep" };
  if (!recorded) return { kind: "register", wanted };
  if (!renewal && serves(recorded, wanted)) return { kind: "keep" };
  return { kind: "replace", recorded, wanted };
}

/**
 * The decision once a registration lands, against the mapping as it is by
 * then: it may have moved on while Jira was called. A webhook it still wants
 * goes on record, the newest winning; one it no longer wants goes. A failure
 * is recorded only while the mapping still wants the webhook and has none
 * live.
 */
export function settleRegistration(
  mapping: Doc<"integrationMappings"> | null,
  registration: Registration
): Settlement {
  const wanted = mapping ? wantedWebhookOf(mapping) : null;
  const stillWanted = wanted !== null && serves(registration, wanted);
  const recorded = mapping ? recordedWebhookOf(mapping) : null;

  if (registration.kind === "failed") {
    return stillWanted && !recorded
      ? { kind: "fail", failure: registration.failure }
      : { kind: "ignore" };
  }

  const webhook = {
    webhookId: registration.webhookId,
    connectionId: registration.connectionId,
    projectKey: registration.projectKey,
  };
  return stillWanted ? { kind: "record", webhook, superseded: recorded } : { kind: "discard", webhook };
}

/**
 * A going connection's webhooks, sorted by the connection that made each:
 * the ones it made go through its disconnect tail, which deletes them before
 * the connection row; any other is removed with its own connection.
 */
export function planDisconnect(
  connectionId: Id<"integrationConnections">,
  mappings: Doc<"integrationMappings">[]
): { tail: string[]; separately: RecordedWebhook[] } {
  const tail: string[] = [];
  const separately: RecordedWebhook[] = [];
  for (const mapping of mappings) {
    const recorded = recordedWebhookOf(mapping);
    if (!recorded) continue;
    if (recorded.connectionId === connectionId) tail.push(recorded.webhookId);
    else separately.push(recorded);
  }
  return { tail, separately };
}

// ---------------------------------------------------------------------------
// Carrying out a decision
// ---------------------------------------------------------------------------

/** The record columns cleared together when a webhook leaves the record. */
const NO_WEBHOOK_ON_RECORD = {
  jiraWebhookId: undefined,
  jiraWebhookRegisteredAt: undefined,
  jiraWebhookConnectionId: undefined,
  jiraWebhookProjectKey: undefined,
};

/** Hands one recorded webhook to the action that deletes it with the connection that made it. */
async function scheduleRemoval(ctx: MutationCtx, recorded: RecordedWebhook): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.integrations.jira.deregisterWebhook, {
    connectionId: recorded.connectionId,
    webhookId: recorded.webhookId,
  });
}

/**
 * Carries out a plan for a mapping that stays. The decision supersedes the
 * last registration's outcome, and a webhook handed to an action leaves the
 * record in the same transaction, so it is never in two places at once.
 */
async function carryOut(
  ctx: MutationCtx,
  mapping: Doc<"integrationMappings">,
  plan: WebhookPlan
): Promise<void> {
  const leavesRecord = plan.kind === "remove" || plan.kind === "replace";
  if (leavesRecord || mapping.jiraWebhookFailure !== undefined) {
    await ctx.db.patch("integrationMappings", mapping._id, {
      jiraWebhookFailure: undefined,
      ...(leavesRecord ? NO_WEBHOOK_ON_RECORD : {}),
    });
  }

  switch (plan.kind) {
    case "keep":
      return;
    case "remove":
      return await scheduleRemoval(ctx, plan.recorded);
    case "register":
      await ctx.scheduler.runAfter(0, internal.integrations.jira.registerWebhook, {
        mappingId: mapping._id,
      });
      return;
    case "replace":
      // One action deletes the old webhook first, then registers the new one,
      // so a mapping never holds two live webhooks.
      await ctx.scheduler.runAfter(0, internal.integrations.jira.registerWebhook, {
        mappingId: mapping._id,
        replacing: { connectionId: plan.recorded.connectionId, webhookId: plan.recorded.webhookId },
      });
      return;
  }
}

async function reconcile(ctx: MutationCtx, change: MappingChange): Promise<void> {
  switch (change.kind) {
    case "saved": {
      // The record is read off the row as it was: a webhook recorded before
      // its connection was falls back to the connection the mapping had then.
      const recorded = change.before ? recordedWebhookOf(change.before) : null;
      const plan = planWebhook(wantedWebhookOf(change.after), recorded, { renewal: false });
      return await carryOut(ctx, change.after, plan);
    }
    case "renewed": {
      const plan = planWebhook(wantedWebhookOf(change.mapping), recordedWebhookOf(change.mapping), {
        renewal: true,
      });
      return await carryOut(ctx, change.mapping, plan);
    }
    case "removed": {
      const recorded = recordedWebhookOf(change.mapping);
      if (recorded) await scheduleRemoval(ctx, recorded);
      return;
    }
  }
}

/**
 * Where a registration lands (registerWebhook reports back through
 * recordWebhookRegistration): settles it against the mapping as it is now.
 */
export async function recordRegistration(
  ctx: MutationCtx,
  mappingId: Id<"integrationMappings">,
  registration: Registration
): Promise<void> {
  const mapping = await ctx.db.get("integrationMappings", mappingId);
  const settlement = settleRegistration(mapping, registration);
  switch (settlement.kind) {
    case "record":
      await ctx.db.patch("integrationMappings", mappingId, {
        jiraWebhookId: settlement.webhook.webhookId,
        jiraWebhookRegisteredAt: Date.now(),
        jiraWebhookConnectionId: settlement.webhook.connectionId,
        jiraWebhookProjectKey: settlement.webhook.projectKey,
        jiraWebhookFailure: undefined,
      });
      if (settlement.superseded) await scheduleRemoval(ctx, settlement.superseded);
      return;
    case "discard":
      return await scheduleRemoval(ctx, settlement.webhook);
    case "fail":
      await ctx.db.patch("integrationMappings", mappingId, { jiraWebhookFailure: settlement.failure });
      return;
    case "ignore":
      return;
  }
}

async function disconnect(
  ctx: MutationCtx,
  connectionId: Id<"integrationConnections">,
  mappings: Doc<"integrationMappings">[]
): Promise<"now" | "tail"> {
  const { tail, separately } = planDisconnect(connectionId, mappings);
  for (const recorded of separately) await scheduleRemoval(ctx, recorded);
  if (tail.length === 0) return "now";

  // One tail deregisters every webhook, then deletes the row: the order comes
  // from that action's own awaits, not from same-tick scheduled-job ordering
  // (which Convex does not guarantee).
  await ctx.scheduler.runAfter(0, internal.integrations.jira.finalizeDisconnect, {
    connectionId,
    webhookIds: tail,
  });
  return "tail";
}

/** The Jira adapter's webhook reconcile, as the provider registry routes to it. */
export const jiraWebhookReconcile: WebhookReconcile = { reconcile, disconnect };
