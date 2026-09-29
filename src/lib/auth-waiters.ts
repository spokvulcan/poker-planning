/**
 * Promises on a changing auth state: `when(ready)` resolves with the first
 * state `ready` accepts, at once if the current one does, else on the
 * `update` that makes it hold, and rejects after `timeoutMs`. Held by the
 * auth provider, which outlives any component that waits: a page may unmount
 * the one that started a sign-in while the session reaches Convex.
 */
export function createAuthWaiters<S>(initial: S) {
  let current = initial;
  const waiting = new Set<() => void>();

  return {
    update(state: S) {
      current = state;
      for (const check of [...waiting]) check();
    },
    when(ready: (state: S) => boolean, timeoutMs: number): Promise<S> {
      if (ready(current)) return Promise.resolve(current);
      return new Promise<S>((resolve, reject) => {
        const check = () => {
          if (!ready(current)) return;
          clearTimeout(timer);
          waiting.delete(check);
          resolve(current);
        };
        const timer = setTimeout(() => {
          waiting.delete(check);
          reject(new Error("Timed out waiting for the session"));
        }, timeoutMs);
        waiting.add(check);
      });
    },
  };
}
