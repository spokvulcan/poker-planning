/**
 * Convex's client, as a board's tests need it: its local cache of query
 * results, keyed by function and arguments as Convex keys it. A test serves
 * what the server holds; a write runs its optimistic update over the cache at
 * once, as Convex does, and goes to a server that answers it straight away,
 * or refuses it when the test says so, which drops the update again. So a
 * test sees what the board shows after a gesture, not only that a write went
 * out. Every write and every refusal is recorded, and so is every query a
 * component asked for (a skipped one too), and every query an optimistic
 * update patched.
 *
 * Test-only. A test file replaces `convex/react` with it:
 *
 *   vi.mock("convex/react", async (importOriginal) =>
 *     (await import("@/components/whiteboard/testing/convex")).mockConvexReact(await importOriginal<object>()));
 *
 * and calls `resetConvex()` before each test.
 */
import { useSyncExternalStore } from "react";
import type { OptimisticLocalStore } from "convex/browser";
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";

type Query = FunctionReference<"query">;
type Mutation = FunctionReference<"mutation" | "action">;
type Args = Record<string, unknown>;
type Update = (store: OptimisticLocalStore, args: Args) => void;

interface Entry {
  query: Query;
  args: Args;
  value: unknown;
}

/** A write whose optimistic update still shows over what the server said. */
interface Pending {
  update: Update;
  args: Args;
  /** The server has taken it: the update goes when the server next answers a query. */
  landed: boolean;
}

/** Arguments as one key whatever order their fields were written in. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.entries(value as Args).filter(([, field]) => field !== undefined);
    fields.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${fields.map(([key, field]) => `${JSON.stringify(key)}:${stable(field)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

const keyOf = (query: Query, args: Args = {}) => `${getFunctionName(query)} ${stable(args)}`;

const server = new Map<string, Entry>();
let local = new Map<string, Entry>();
let pending: Pending[] = [];
const listeners = new Set<() => void>();
const refusals = new Map<string, unknown>();
const answers = new Map<string, unknown>();

/** What the board's writes and reads came to. */
export const convex = {
  /** Every mutation and action called, in order. */
  writes: [] as { name: string; args: Args }[],
  /** The writes the server refused, with what it refused them with. */
  refused: [] as { name: string; args: Args; error: unknown }[],
  /** Every query a component asked for, as it asked: `"skip"` for one it skipped. */
  reads: [] as { name: string; args: Args | "skip" }[],
  /** Every query the writes' optimistic updates wrote, as they first ran. */
  patched: [] as { name: string; args: Args }[],
  /** Queries fetched once, imperatively, through `useConvex()`. */
  fetched: [] as { name: string; args: Args }[],
};

function notify(): void {
  for (const listener of listeners) listener();
}

/** A local store over `cache`, as an optimistic update is handed one; `onSet` hears each write to it. */
function storeOver(cache: Map<string, Entry>, onSet?: (query: Query, args: Args) => void): OptimisticLocalStore {
  return {
    getQuery: (query: Query, args?: Args) => cache.get(keyOf(query, args))?.value,
    getAllQueries: (query: Query) =>
      [...cache.values()]
        .filter((entry) => getFunctionName(entry.query) === getFunctionName(query))
        .map(({ args, value }) => ({ args, value })),
    setQuery: (query: Query, args: Args, value: unknown) => {
      cache.set(keyOf(query, args), { query, args, value });
      onSet?.(query, args);
    },
  } as unknown as OptimisticLocalStore;
}

/** The cache as the board sees it: what the server said, under every update still showing. */
function recompute(): void {
  local = new Map(server);
  const store = storeOver(local);
  for (const write of pending) write.update(store, write.args);
  notify();
}

/** Forgets everything: the server's results, the writes, the refusals. */
export function resetConvex(): void {
  server.clear();
  local = new Map();
  pending = [];
  refusals.clear();
  answers.clear();
  convex.writes = [];
  convex.refused = [];
  convex.reads = [];
  convex.patched = [];
  convex.fetched = [];
}

/**
 * The server answering a query, as it does on load and after any write: the
 * updates of writes it has taken stop showing, as Convex drops them once the
 * server's results include the write.
 */
export function serve<Q extends Query>(query: Q, args: FunctionArgs<Q>, value: FunctionReturnType<Q>): void {
  server.set(keyOf(query, args), { query, args, value });
  pending = pending.filter((write) => !write.landed);
  recompute();
}

/** What a query shows now: the server's result under any update still showing. */
export function shown<Q extends Query>(query: Q, args: FunctionArgs<Q>): FunctionReturnType<Q> | undefined {
  return local.get(keyOf(query, args))?.value as FunctionReturnType<Q> | undefined;
}

/** Has the server refuse `mutation` (every write, when none is named) with `error` from now on. */
export function refuse(error: unknown, mutation?: Mutation): void {
  refusals.set(mutation ? getFunctionName(mutation) : "*", error);
}

/** What the server answers `mutation` with, such as the room a new retro opened. */
export function answer(mutation: Mutation, value: unknown): void {
  answers.set(getFunctionName(mutation), value);
}

const recordPatch = (query: Query, args: Args) => {
  convex.patched.push({ name: getFunctionName(query), args });
};

/** A write as `useMutation` hands it out: called, it runs `update` over the cache, then goes to the server. */
function writeTo(mutation: Mutation, update?: Update) {
  const name = getFunctionName(mutation);
  return (args: Args = {}): Promise<unknown> => {
    convex.writes.push({ name, args });
    // The update runs over the cache as it shows now, at once, and is
    // replayed over the server's results from then on, as Convex does.
    const write: Pending | null = update ? { update, args, landed: false } : null;
    if (write) {
      write.update(storeOver(local, recordPatch), args);
      pending.push(write);
      notify();
    }
    return Promise.resolve().then(() => {
      if (refusals.has(name) || refusals.has("*")) {
        const error = refusals.has(name) ? refusals.get(name) : refusals.get("*");
        convex.refused.push({ name, args, error });
        // A refused write's update stops showing at once, as Convex rolls it back.
        if (write) {
          pending = pending.filter((other) => other !== write);
          recompute();
        }
        throw error;
      }
      if (write) write.landed = true;
      return answers.get(name) ?? null;
    });
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useQuery(query: Query, args?: Args | "skip"): unknown {
  convex.reads.push({ name: getFunctionName(query), args: args ?? {} });
  const key = args === "skip" ? null : keyOf(query, args);
  const read = () => (key === null ? undefined : local.get(key)?.value);
  return useSyncExternalStore(subscribe, read, read);
}

function useMutation(mutation: Mutation) {
  return Object.assign(writeTo(mutation), {
    withOptimisticUpdate: (update: Update) => writeTo(mutation, update),
  });
}

function useAction(action: Mutation) {
  return writeTo(action);
}

function useConvex() {
  return {
    query: (query: Query, args: Args = {}) => {
      convex.fetched.push({ name: getFunctionName(query), args });
      return Promise.resolve(server.get(keyOf(query, args))?.value);
    },
  };
}

/** `convex/react` with its client replaced by this one; anything else is the real module's. */
export function mockConvexReact<M extends object>(actual: M): M {
  return { ...actual, useQuery, useMutation, useAction, useConvex } as M;
}
