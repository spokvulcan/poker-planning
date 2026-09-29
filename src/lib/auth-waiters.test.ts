import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthWaiters } from "./auth-waiters";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAuthWaiters", () => {
  it("resolves at once with a state that already holds", async () => {
    const waiters = createAuthWaiters({ ready: true });
    await expect(waiters.when((s) => s.ready, 1_000)).resolves.toEqual({ ready: true });
  });

  it("resolves on the first update that makes the condition hold, with that state", async () => {
    const waiters = createAuthWaiters({ step: 0 });
    const pending = waiters.when((s) => s.step >= 2, 1_000);

    waiters.update({ step: 1 });
    waiters.update({ step: 2 });
    waiters.update({ step: 3 });

    await expect(pending).resolves.toEqual({ step: 2 });
  });

  it("answers several waiters, each on its own condition", async () => {
    const waiters = createAuthWaiters({ loading: true, authenticated: false });
    const loaded = vi.fn();
    const authenticated = vi.fn();
    void waiters.when((s) => !s.loading, 1_000).then(loaded);
    void waiters.when((s) => s.authenticated, 1_000).then(authenticated);

    waiters.update({ loading: false, authenticated: false });
    await vi.waitFor(() => expect(loaded).toHaveBeenCalled());
    expect(authenticated).not.toHaveBeenCalled();

    waiters.update({ loading: false, authenticated: true });
    await vi.waitFor(() => expect(authenticated).toHaveBeenCalled());
    expect(loaded).toHaveBeenCalledTimes(1);
  });

  it("rejects after the timeout, and a later update no longer answers it", async () => {
    const waiters = createAuthWaiters({ ready: false });
    const ready = vi.fn((s: { ready: boolean }) => s.ready);
    const pending = waiters.when(ready, 1_000);
    const failed = expect(pending).rejects.toThrow();

    vi.advanceTimersByTime(1_000);
    await failed;

    ready.mockClear();
    waiters.update({ ready: true });
    expect(ready).not.toHaveBeenCalled();
  });

  it("stops the timer once answered", async () => {
    const waiters = createAuthWaiters({ ready: false });
    const pending = waiters.when((s) => s.ready, 1_000);

    waiters.update({ ready: true });
    await expect(pending).resolves.toEqual({ ready: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
