/**
 * Registers the app's Convex components on a convex-test instance. A test
 * that deletes a room or a user needs this: both clear presence, which lives
 * in the presence component, and deleting a user deletes their sign-in,
 * which lives in BetterAuth's. The multi-dot filename keeps the Convex CLI
 * from deploying it (see analytics.seeds.ts).
 */
import betterAuth from "@convex-dev/better-auth/test";
import presence from "@convex-dev/presence/test";
import type { T } from "./analytics.seeds";

export function withComponents<Test extends T>(t: Test): Test {
  betterAuth.register(t);
  presence.register(t);
  return t;
}
