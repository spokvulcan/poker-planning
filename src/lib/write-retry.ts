import { ConvexError } from "convex/values";
import type { Refusal, RefusalCode } from "@/convex/model/refusal";

/**
 * Rollback by error kind (ADR-0022, spec §4.5, §10.8). The retro model
 * layer throws `ConvexError({ code, message })` for every rule-based
 * refusal; anything else is a transient failure. A refusal is final; a
 * failure is retried with backoff, then given up.
 */

const REFUSAL_CODES: ReadonlySet<string> = new Set<RefusalCode>([
  "forbidden",
  "budget",
  "missing",
  "stage",
]);

/** The refusal an error carries, or null for a transient failure. */
export function refusalOf(error: unknown): Refusal | null {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as Partial<Refusal> | string | undefined;
  if (typeof data !== "object" || data === null) return null;
  if (typeof data.code !== "string" || !REFUSAL_CODES.has(data.code)) return null;
  return { code: data.code as RefusalCode, message: data.message ?? "" };
}

/** The copy a failed write shows: the refusal's reason, or the caller's fallback. */
export function failureCopy(error: unknown, fallback: string): string {
  return refusalOf(error)?.message || fallback;
}

/** How many times a transient failure is retried before the value is dropped. */
export const RETRY_ATTEMPTS = 3;

/** The default backoff: 300 ms, 600 ms, 1200 ms. */
export function defaultDelayMs(attempt: number): number {
  return 300 * 2 ** (attempt - 1);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run a write, retrying a transient failure `RETRY_ATTEMPTS` times with
 * backoff and throwing a refusal at once. `delayMs` takes the retry number
 * (1-based) and returns the wait before it.
 */
export async function retryWrite<T>(
  write: () => Promise<T>,
  options: { delayMs?: (attempt: number) => number } = {}
): Promise<T> {
  const delayMs = options.delayMs ?? defaultDelayMs;
  for (let attempt = 0; ; attempt++) {
    try {
      return await write();
    } catch (error) {
      if (refusalOf(error) || attempt >= RETRY_ATTEMPTS) throw error;
      await sleep(delayMs(attempt + 1));
    }
  }
}
