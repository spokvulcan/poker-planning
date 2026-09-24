/**
 * Registers the app's Convex components on a convex-test instance. A test
 * that deletes a room or a user needs this: both clear presence, which lives
 * in the presence component. The multi-dot filename keeps the Convex CLI from
 * deploying it (see analytics.seeds.ts).
 */
import presence from "@convex-dev/presence/test";
import type { T } from "./analytics.seeds";

export function withComponents<Test extends T>(t: Test): Test {
  presence.register(t);
  return t;
}
