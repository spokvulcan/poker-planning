"use client";

import { useCallback, useRef } from "react";
import { useLatest } from "./use-latest";

/**
 * Keyed single-flight (ADR-0022, spec §10.6): one request in flight per
 * key, with the latest pending args replacing any queued ones for that key.
 * Keys are independent, so card B's drop never waits behind card A's. The
 * presence package's global single-flight is the reference, generalised by
 * key; a global single-flight is `keyOf: () => "global"`.
 *
 * A call that is superseded before it runs resolves (or rejects) with the
 * result of the call that ran in its place, so a caller awaiting a drop
 * always learns how the board settled.
 */
export function useSingleFlightMutation<Args, Result>(
  mutation: (args: Args) => Promise<Result>,
  keyOf: (args: Args) => string
): (args: Args) => Promise<Result> {
  type Waiter = { resolve: (value: Result) => void; reject: (error: unknown) => void };
  type Flight = { upNext: { args: Args; waiters: Waiter[] } | null };
  const flights = useRef(new Map<string, Flight>());
  const latestMutation = useLatest(mutation);
  const latestKeyOf = useLatest(keyOf);

  return useCallback((args: Args) => {
    const key = latestKeyOf.current(args);
    const flight = flights.current.get(key);
    if (flight) {
      return new Promise<Result>((resolve, reject) => {
        const waiters = flight.upNext?.waiters ?? [];
        waiters.push({ resolve, reject });
        flight.upNext = { args, waiters };
      });
    }
    const mine: Flight = { upNext: null };
    flights.current.set(key, mine);
    const first = latestMutation.current(args);
    void (async () => {
      try {
        await first;
      } catch {
        // The caller of `first` hears the failure; the queue moves on.
      }
      while (mine.upNext) {
        const { args: next, waiters } = mine.upNext;
        mine.upNext = null;
        try {
          const value = await latestMutation.current(next);
          for (const w of waiters) w.resolve(value);
        } catch (error) {
          for (const w of waiters) w.reject(error);
        }
      }
      flights.current.delete(key);
    })();
    return first;
  }, [latestKeyOf, latestMutation]);
}
