import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * What one module keeps about a person, and how it lets go of it: the seam
 * the account lifecycle (model/accountLifecycle.ts) walks when an account is
 * deleted or a guest signs in. Each module that stores rows naming a user
 * implements it under its own rules, so the lifecycle never writes another
 * module's tables (ADR-0030).
 */
export interface UserRows {
  /**
   * The stored fields this module owns that name a user, as `table.field`
   * (or a component's name). The completeness test checks that every field
   * in the schema naming a user is claimed by exactly one module.
   */
  fields: readonly string[];
  /** The person's account is deleted: drop, or stop naming them in, what this module keeps. */
  forget(ctx: MutationCtx, userId: Id<"users">): Promise<void>;
  /** A guest signed in to an account: what this module keeps about the guest becomes the account's. */
  fold(ctx: MutationCtx, from: Id<"users">, into: Id<"users">): Promise<void>;
}
