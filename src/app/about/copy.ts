/**
 * The About page's copy (spec §18.2, ADR-0014): the position sentence, the
 * principles and the closing CTA. Read by `about-content.tsx` and checked by
 * `lib/claims-register.test.ts`.
 */

import { START_ESTIMATING, START_RETRO } from "@/lib/site-copy";

export const META = {
  title: "About AgileKit - Free Open Source Planning Poker and Retros",
  description:
    "Learn about AgileKit, the free, open-source way for distributed Scrum teams to estimate and reflect in writing. Built with privacy, simplicity, and real-time collaboration in mind.",
  openGraph: {
    title: "About AgileKit - Free Open Source Planning Poker and Retros",
    description:
      "The free, open-source way for distributed Scrum teams to estimate and reflect in writing, everyone at once.",
  },
};

export const HERO = {
  headline: "Estimate and reflect,",
  headlineMuted: "simplified.",
  position:
    "AgileKit is the free, open-source way for distributed Scrum teams to estimate and reflect in writing, everyone at once, with nothing forgotten between sprints.",
  star: "Star on GitHub",
};

export const PRINCIPLES = {
  eyebrow: "Core Principles",
  heading: "Built on trust.",
  headingMuted: "Designed for speed.",
  values: [
    {
      id: "open",
      title: "Open Source Core",
      description:
        "Built in the open. Core features free forever. Community-driven development with complete transparency.",
    },
    {
      id: "privacy",
      title: "Privacy First",
      description:
        "No accounts required to join. Optional analytics stay off unless you opt in. Your estimates and retro cards stay with your team, and an anonymous retro stores no author at all.",
    },
    {
      id: "realtime",
      title: "Real-time Sync",
      description:
        "Instant collaboration with live updates. Built from the ground up for distributed agile teams.",
    },
  ] as const,
};

export const STACK = {
  eyebrow: "Architecture",
  heading: "Modern stack.",
  headingMuted: "Zero compromises.",
  description:
    "We built AgileKit using the latest technologies to ensure maximum performance, real-time reliability, and an exceptional developer experience for contributors.",
  link: { label: "View the architecture", href: "https://github.com/spokvulcan/poker-planning" },
  items: [
    { id: "next", name: "Next.js 15", category: "Framework" },
    { id: "react", name: "React 19", category: "UI Library" },
    { id: "convex", name: "Convex", category: "Real-time Backend" },
    { id: "flow", name: "React Flow", category: "Interactive Canvas" },
    { id: "tailwind", name: "Tailwind CSS", category: "Styling" },
    { id: "typescript", name: "TypeScript", category: "Language" },
  ] as const,
};

export const CTA = {
  heading: "Ready to estimate,",
  headingMuted: "or reflect?",
  description: "Free forever, open source, and built for distributed teams.",
  estimate: START_ESTIMATING,
  retro: START_RETRO,
  source: { label: "View Source", href: "https://github.com/spokvulcan/poker-planning" },
};
