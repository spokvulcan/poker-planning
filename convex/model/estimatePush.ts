import { v, type Infer } from "convex/values";
import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { cardNumericValue } from "../scales";
import { lastPushValidator } from "../schema";
import { getProviderHandler, type EstimatePusher } from "../integrations/registry";

/**
 * Estimate push: what becomes of an estimate settled on an issue, in the
 * tracker the issue was brought from. The voting round hands it over at the
 * reveal (ADR-0002: the reveal is the trigger) and names no provider and no
 * integration table; this module alone reads the issue's link and the room's
 * mapping and decides, through the provider registry, whether and where the
 * estimate goes.
 *
 * It goes only when the mapping pushes estimates (auto-push), has a field to
 * write them to, its connection acts on the site the issue is on (the same key
 * on another site is another issue), and the estimate is a number (by
 * cardNumericValue, the one numeric reading of a card). The provider's push is
 * then dispatched with everything it needs, so its action reads nothing back.
 * How it went is recorded on the mapping (`lastPush`), where the room's
 * integration settings show it: a push not made, and why, at once; a push
 * made or refused, when the provider's action reports back. This module is
 * the only writer of `lastPush` (eslint.config.mjs holds every other file to
 * that).
 */

/** Everything a provider's push needs, decided here, so its action reads nothing back. */
export const estimatePushValidator = v.object({
  mappingId: v.id("integrationMappings"),
  connectionId: v.id("integrationConnections"),
  /** The site the issue is on: the connection must still act on it when the push runs. */
  site: v.string(),
  /** The issue's key in the tracker: "PROJ-1". */
  issueKey: v.string(),
  /** The field the estimate is written to: "customfield_10016". */
  fieldId: v.string(),
  /** The settled card, and what it reads as a number. */
  estimate: v.object({ label: v.string(), value: v.number() }),
  /** When the estimate settled: of two outcomes, the later estimate's is kept. */
  settledAt: v.number(),
});

export type EstimatePush = Infer<typeof estimatePushValidator>;

/** How a settled estimate's push went, as the mapping records it. */
export type LastPush = Infer<typeof lastPushValidator>;

/** Why an estimate isn't pushed, decided before any tracker is asked. */
export type NotPushed = Exclude<LastPush["outcome"], "pushed" | "refused">;

export type PushDecision = { kind: "push"; push: EstimatePush } | { kind: "notPushed"; outcome: NotPushed };

/**
 * Whether and where an estimate settled on a linked issue goes, through a
 * mapping that pushes estimates. Pure: the provider says where its issue is
 * (`targetOf`). Asked in this order, so a person is told first what they can
 * fix in the room's settings: a field to write it to; a connection, acting on
 * the site the issue is on; an estimate that is a number.
 */
export function decidePush(
  input: {
    mapping: Doc<"integrationMappings">;
    link: Doc<"issueLinks">;
    connection: Doc<"integrationConnections"> | null;
    estimate: string;
    settledAt: number;
  },
  pusher: EstimatePusher
): PushDecision {
  const { mapping, link, connection, estimate, settledAt } = input;
  const fieldId = mapping.storyPointsFieldId?.trim();
  if (!fieldId) return { kind: "notPushed", outcome: "noField" };
  if (!connection) return { kind: "notPushed", outcome: "connectionUnusable" };
  const target = pusher.targetOf(link, connection);
  if (!target.ok) return { kind: "notPushed", outcome: target.outcome };
  const value = cardNumericValue(estimate);
  if (value === undefined) return { kind: "notPushed", outcome: "notANumber" };
  return {
    kind: "push",
    push: {
      mappingId: mapping._id,
      connectionId: connection._id,
      site: target.site,
      issueKey: target.issueKey,
      fieldId,
      estimate: { label: estimate, value },
      settledAt,
    },
  };
}

/**
 * An estimate settled on one of the room's issues (the reveal's consensus).
 * An issue typed in the room has no tracker to go to, and a room whose
 * mapping doesn't push estimates (or pushes to another tracker than the
 * issue's) has nowhere to send it: neither is recorded. Otherwise the
 * decision is: a push not made is recorded with why; one made is dispatched
 * to its provider, whose action records how it went.
 */
export async function estimateSettled(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; issueId: Id<"issues">; estimate: string }
): Promise<void> {
  const link = await ctx.db
    .query("issueLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
    .first();
  if (!link) return;
  const mapping = await ctx.db
    .query("integrationMappings")
    .withIndex("by_room", (q) => q.eq("roomId", args.room._id))
    .first();
  if (!mapping?.autoPushEstimates || mapping.provider !== link.provider) return;

  const connection = await ctx.db.get("integrationConnections", mapping.connectionId);
  const provider = getProviderHandler(mapping.provider);
  const settledAt = Date.now();
  const decision = decidePush({ mapping, link, connection, estimate: args.estimate, settledAt }, provider.estimates);
  if (decision.kind === "notPushed") {
    await recordPush(ctx, mapping._id, {
      at: settledAt,
      issueKey: link.externalId,
      estimate: args.estimate,
      outcome: decision.outcome,
    });
    return;
  }
  await provider.estimates.dispatch(ctx, decision.push);
}

/**
 * Records how a push went on its mapping, unless the mapping is gone or has
 * already recorded a later estimate's (two reveals' pushes can report back in
 * either order). A provider's action says what it pushed with (`madeWith`):
 * when a save has since changed the mapping's connection or field, or turned
 * pushing off, the outcome says nothing about the next push, and the save
 * that let the last one go isn't undone by it.
 */
export async function recordPush(
  ctx: MutationCtx,
  mappingId: Id<"integrationMappings">,
  lastPush: LastPush,
  madeWith?: { connectionId: Id<"integrationConnections">; fieldId: string }
): Promise<void> {
  const mapping = await ctx.db.get("integrationMappings", mappingId);
  if (!mapping || (mapping.lastPush && mapping.lastPush.at > lastPush.at)) return;
  const settingsChanged =
    madeWith !== undefined &&
    (!mapping.autoPushEstimates ||
      mapping.connectionId !== madeWith.connectionId ||
      mapping.storyPointsFieldId?.trim() !== madeWith.fieldId);
  if (settingsChanged) return;
  await ctx.db.patch("integrationMappings", mappingId, { lastPush });
}

/**
 * A mapping saved from the room's settings: when what decides a push changed
 * (pushing at all, the field, the connection pushing), the last push's outcome
 * no longer says how the next will go, so it goes; the next estimate settled
 * records its own.
 */
export async function mappingSaved(
  ctx: MutationCtx,
  before: Doc<"integrationMappings"> | null,
  after: Doc<"integrationMappings">
): Promise<void> {
  if (!after.lastPush) return;
  const unchanged =
    before !== null &&
    before.autoPushEstimates === after.autoPushEstimates &&
    before.storyPointsFieldId === after.storyPointsFieldId &&
    before.connectionId === after.connectionId;
  if (!unchanged) await ctx.db.patch("integrationMappings", after._id, { lastPush: undefined });
}
