/**
 * Site-wide metadata copy (spec §18.2, ADR-0014): the default title, the
 * description and the social cards. Metadata may say "retrospective" where
 * the UI says "Retro" (§18.4), and it may not contradict the hero. Read by
 * `app/layout.tsx` and checked by `lib/claims-register.test.ts`.
 */

/** The two CTAs every marketing page shares: one per ceremony (ADR-0014). */
export const START_ESTIMATING = { label: "Start estimating", href: "/room/new" };
export const START_RETRO = { label: "Start a retro", href: "/retro/new" };

const TITLE = "Free Planning Poker & Retros Online | AgileKit";

export const SITE = {
  title: TITLE,
  titleTemplate: "%s | AgileKit",
  description:
    "Run free online planning poker and retrospectives with your Scrum team. No signup required. Estimate in real time and reflect in writing, everyone at once, with AgileKit's open-source toolkit.",
  keywords: [
    "planning poker",
    "scrum poker",
    "agile estimation",
    "story points",
    "sprint planning",
    "free planning poker",
    "planning poker online",
    "scrum poker online",
    "agile poker",
    "estimation poker",
  ],
  openGraph: {
    title: TITLE,
    description:
      "Run free online planning poker and retrospectives with your Scrum team. No signup required. Estimate in real time, reflect in writing.",
    imageAlt: "AgileKit - Free Planning Poker and Retros for Scrum Teams",
  },
  twitter: {
    title: TITLE,
    description:
      "Run free online planning poker and retrospectives with your Scrum team. No signup required.",
  },
};

/** `siteConfig.blog.description` and the blog index's subtitle. */
export const BLOG_DESCRIPTION =
  "Tips and guides on planning poker, retros and agile estimation.";

/** `siteConfig.description`. */
export const SITE_SHORT_DESCRIPTION =
  "Free online planning poker and retros for Scrum teams";
