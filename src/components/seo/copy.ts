/**
 * The homepage's structured data as plain strings (spec §18.2, ADR-0014),
 * read by the claims-register test. Metadata may say "retrospective" where
 * the UI says "Retro" (§18.4).
 */

import { FAQ } from "@/components/homepage/copy";

export const WEB_APPLICATION = {
  name: "AgileKit",
  description:
    "Free online planning poker and retrospectives for Scrum teams. Real-time collaboration, no registration required.",
  featureList: [
    "Real-time voting",
    "No registration required",
    "Unlimited team members",
    "Fibonacci, Standard, T-shirt and custom voting scales",
    "Results analytics with average, median, and consensus",
    "Synchronized timer",
    "Whiteboard canvas interface",
    "Retro boards with cards written in parallel",
    "Retro history kept for the team",
  ],
};

/**
 * The FAQ schema is the visible FAQ itself: structured data may only
 * describe what the page shows, and a second copy of the list drifted from
 * the one on the page.
 */
export const FAQ_SCHEMA = FAQ.items;
