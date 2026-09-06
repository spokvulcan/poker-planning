/**
 * Site-wide copy shared by the marketing pages (spec §18.2, ADR-0014).
 * Checked by `lib/claims-register.test.ts`.
 */

/** The two CTAs every marketing page shares: one per ceremony (ADR-0014). */
export const START_ESTIMATING = { label: "Start estimating", href: "/room/new" };
export const START_RETRO = { label: "Start a retro", href: "/retro/new" };
