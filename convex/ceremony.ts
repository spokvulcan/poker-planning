/**
 * What differs between the two ceremonies a room can host, decided in one
 * place (CONTEXT.md: Ceremony). A room's ceremony is named by its `roomType`:
 * "retro" is a retro; "canvas", and a legacy row with no `roomType`, is
 * planning poker. Every writer and view that behaves differently per ceremony
 * asks here instead of comparing `roomType` itself, so a rule enforced by one
 * writer cannot be missed by the next. Pure: no IO, no Convex runtime, so the
 * model and the browser read the same rules.
 */

import type { Doc } from "./_generated/dataModel";

export type Ceremony = "poker" | "retro";

export interface CeremonyRules {
  /** What the product calls it. */
  name: "Planning poker" | "Retro";
  /** What the room's own copy calls it, as in a title ("Copy Room Link", "Retro Settings"). */
  noun: "Room" | "Retro";
  /** Whether a member may sit out as a spectator. A retro has none: everyone at the board writes. */
  spectators: boolean;
  /** Whether the room runs voting rounds: cards, votes, reveal, issues. */
  votingRounds: boolean;
  /** Whether each member gets a player node on the canvas. */
  playerNodes: boolean;
  /** Whether a room owned by a permanent account outlives the inactivity sweep. */
  retainedByPermanentOwner: boolean;
  /**
   * Whether the room stays when its owner's account is deleted with nobody
   * else in it, for the next person who joins to take over. A retro goes with
   * the account instead (ADR-0026).
   */
  outlivesLoneOwner: boolean;
  /**
   * How stale the room's activity clock may get before a write moves it
   * (ADR-0018): 0 is exact, which poker analytics' freshness needs.
   */
  activityGranularityMs: number;
  /** Whether the room counts in the analytics dashboard, which reads voting rounds. */
  inAnalytics: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

export const CEREMONY_RULES: Readonly<Record<Ceremony, CeremonyRules>> = Object.freeze({
  poker: Object.freeze({
    name: "Planning poker",
    noun: "Room",
    spectators: true,
    votingRounds: true,
    playerNodes: true,
    retainedByPermanentOwner: false,
    outlivesLoneOwner: true,
    activityGranularityMs: 0,
    inAnalytics: true,
  }),
  retro: Object.freeze({
    name: "Retro",
    noun: "Retro",
    spectators: false,
    votingRounds: false,
    playerNodes: false,
    retainedByPermanentOwner: true,
    outlivesLoneOwner: false,
    activityGranularityMs: HOUR_MS,
    inAnalytics: false,
  }),
});

/** The ceremony a room hosts. */
export function ceremonyOf(room: Pick<Doc<"rooms">, "roomType">): Ceremony {
  return room.roomType === "retro" ? "retro" : "poker";
}

/** The rules of the ceremony a room hosts. */
export function rulesOf(room: Pick<Doc<"rooms">, "roomType">): CeremonyRules {
  return CEREMONY_RULES[ceremonyOf(room)];
}

/** The refusal for an act that belongs to the other ceremony. */
export const NOT_THIS_CEREMONY = "This action does not apply to this room type.";
