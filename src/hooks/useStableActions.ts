import { useEffect, useRef, useState } from "react";

/**
 * Any method signature. `(...args: never[]) => unknown` is the assignability
 * trick — every method satisfies it (never is assignable to any parameter),
 * so the generic carries each seam's real method types through untouched.
 * The constraint is `Record<keyof T, …>` rather than `Record<string, …>` so
 * interfaces (which have no implicit index signature) satisfy it.
 */
type AnyAction = (...args: never[]) => unknown;

/**
 * The ONE frozen-identity mechanism behind the *Actions seams
 * (useCanvasActions / useIssueActions / useRoomSettingsActions). Each seam
 * builds its live implementations fresh every render — so they always close
 * over the latest roomId, acting user, and mutations — and hands them here.
 * What comes back is a wrapper object built once whose methods never change
 * identity: the node-builder memo never churns and the canvas render loop
 * cannot recur (user stories 10/11/13/18).
 *
 * This is the `advanced-event-handler-refs` pattern, chosen over
 * `useEffectEvent` because the canvas seam's methods are embedded into React
 * Flow node `data` and passed to child node components, which the lint rule
 * forbids for effect events. The wrapper is built once via a lazy `useState`
 * initializer and held in state — never read back from a ref during render —
 * so its methods keep a frozen identity for the caller's lifetime while always
 * invoking the latest closure.
 */
export function useStableActions<T extends Record<keyof T, AnyAction>>(
  impl: T,
): T {
  // `useRef(impl)` seeds the latest-impl ref with the first render's closures;
  // the effect keeps it current on every subsequent commit.
  const implRef = useRef(impl);
  // No dependency array is intentional: this runs after every commit so the
  // ref always points at the latest closures (the "latest ref" pattern), not a
  // forgotten dep list.
  useEffect(() => {
    implRef.current = impl;
  });

  // Each wrapper method forwards to the latest impl under a key fixed at
  // creation — the seam's method set never changes between renders. The double
  // casts are the generic boundary: per-key method types can't be recovered
  // inside the loop, so the runtime forwarding is typed loosely and the public
  // type comes entirely from T.
  const [stableActions] = useState(() => {
    const stable = {} as T;
    for (const key of Object.keys(impl) as (keyof T)[]) {
      const forwarder = (...args: unknown[]) => {
        const method = implRef.current[key] as unknown as (
          ...forwarded: unknown[]
        ) => unknown;
        return method(...args);
      };
      stable[key] = forwarder as unknown as T[typeof key];
    }
    return stable;
  });

  return stableActions;
}
