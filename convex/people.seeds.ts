/**
 * Shared convex-test helpers for people in rooms: a user row named by its
 * auth subject, acting as that person, and joining a room the way the app
 * does. Multi-dot like analytics.seeds.ts, so it never deploys as a function
 * module and isn't run as a test.
 */
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

/** A user row whose name doubles as its auth subject. */
export const seedUser = (t: T, subject: string, accountType?: "anonymous" | "permanent") =>
  seedNamedUser(t, subject, subject, accountType);

/** Acting as the person signed in as `subject`. */
export const as = (t: T, subject: string) => t.withIdentity({ subject });

/** Joins a room the way the app does; the first join creates a guest's user row. */
export const join = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });
