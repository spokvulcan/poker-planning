/**
 * The /features page's copy (spec §18.1, §18.2, ADR-0014): one page, two
 * anchored sections, `#planning-poker` and `#retro`; the title drops
 * "Planning Poker". Poker copy is kept under its anchor; retro copy says only
 * what the claims register allows (§18.3). Read by `features-content.tsx`
 * and checked by `lib/claims-register.test.ts`.
 */

import { START_ESTIMATING, START_RETRO } from "@/lib/site-copy";

export const META = {
  title: "Features",
  description:
    "Explore AgileKit's features: real-time planning poker with results analytics and Jira sync. Retro boards with cards written in parallel, dot voting, action items and team history.",
  openGraph: {
    title: "Features | AgileKit",
    description:
      "Real-time planning poker with results analytics and Jira sync. Retro boards with team history. Everything a distributed Scrum team needs, free.",
  },
};

export const HERO = {
  headline: "Powerful features,",
  headlineMuted: "zero complexity.",
  description:
    "Planning poker and retros for distributed Scrum teams, in one toolkit. Core features free, no sign-up required.",
  estimate: START_ESTIMATING,
  retro: START_RETRO,
  jumpTo: "Jump to",
};

export const QUICK_FEATURES = [
  { id: "signup", name: "No Sign-up Required" },
  { id: "theme", name: "Dark/Light Theme" },
  { id: "mobile", name: "Mobile Responsive" },
  { id: "links", name: "Shareable Links" },
  { id: "csv", name: "CSV Export" },
  { id: "spectator", name: "Spectator Mode" },
] as const;

// --- #planning-poker ---

export const POKER = {
  anchor: "planning-poker",
  eyebrow: "Planning poker",
  heading: "Built for modern teams.",
  headingMuted: "Faster, more accurate.",
  unlimited: "Unlimited team members",
  items: [
    {
      id: "voting",
      name: "Real-time Voting",
      description: "Simultaneous card selection with instant sync across all participants",
    },
    {
      id: "scales",
      name: "Multiple Voting Scales",
      description: "Fibonacci, Standard, T-Shirt sizes, or create your own custom scale",
    },
    {
      id: "analytics",
      name: "Results Analytics",
      description: "Average, median, mode, consensus strength, and outlier detection",
    },
    {
      id: "canvas",
      name: "Whiteboard Canvas",
      description: "Drag-and-drop React Flow canvas with multiple node types",
    },
    {
      id: "issues",
      name: "Issues Management",
      description: "Create, edit, and track issues with CSV export and vote statistics",
    },
    {
      id: "jira",
      name: "Jira Cloud Integration",
      description: "Two-way sync — import sprints, push estimates back automatically",
    },
    {
      id: "consensus",
      name: "Time-to-Consensus Tracking",
      description: "Measure how long your team takes to reach agreement on each story",
    },
    {
      id: "alignment",
      name: "Voter Alignment Matrix",
      description: "Visualize voting patterns and spot persistent disagreements",
    },
  ] as const,
  analytics: {
    eyebrow: "Results analytics",
    heading: "Understand your team's",
    headingMuted: "estimation patterns.",
    description:
      "See the voting distribution, the consensus level and the outliers the moment cards are revealed, and estimate with the numbers in front of you.",
    stats: [
      { id: "average", name: "Average Score" },
      { id: "median", name: "Median Value" },
      { id: "strength", name: "Consensus Strength" },
      { id: "outliers", name: "Outlier Detection" },
    ] as const,
    preview: {
      title: "Voting Results",
      badge: "High Consensus",
      participants: "10 participants",
      consensus: "89% consensus",
    },
  },
};

// --- #retro ---

export const RETRO = {
  anchor: "retro",
  eyebrow: "Retro",
  heading: "Reflect in writing.",
  headingMuted: "Everyone at once.",
  description:
    "A retro is one board. Everyone writes cards in parallel, in the meeting or before it, then the team groups them, votes with dots and walks the topics. What was decided stays with the team.",
  items: [
    {
      id: "formats",
      name: "Six formats",
      description:
        "Went well / Do differently / Ideas, Start / Stop / Continue, Glad / Sad / Mad, 4Ls, Sailboat and Lean Coffee. Edit the prompts on the create form and the edited copy is your team's own format next time.",
    },
    {
      id: "parallel",
      name: "Written in parallel",
      description:
        "Everyone writes at once. Cards stay hidden while people write and are revealed together.",
    },
    {
      id: "async",
      name: "Written before the meeting",
      description:
        "Open the board days ahead and the team writes when it suits them. In a team retro, one click emails the team that the board is open.",
    },
    {
      id: "anonymous",
      name: "Anonymous or named",
      description:
        "Chosen per team. In an anonymous retro no author is stored with a card, not even for the facilitator, and nobody is shown how you voted.",
    },
    {
      id: "dots",
      name: "Dots and the discussion walk",
      description:
        "Spend a dot budget on the groups that matter, then walk the topics in vote order. Nothing that was voted for is skipped, and anyone can raise the rest.",
    },
    {
      id: "actions",
      name: "Action items that carry over",
      description:
        "An action item has one owner, or none yet. In a team retro, open ones come back at the next retro's review until someone marks them done or dropped.",
    },
    {
      id: "history",
      name: "History kept by the team",
      description:
        "Every retro a team runs stays readable to its members, free, until the team deletes it. Export one retro as Markdown or the whole history as JSON.",
    },
    {
      id: "link",
      name: "Join by link, no cameras",
      description:
        "A retro without a team is one link away and needs no account. It disappears after five quiet days.",
    },
  ] as const,
};

// --- The rest of the page ---

export const TECH_STACK = {
  eyebrow: "Modern Stack",
  heading: "Built with the best.",
  headingMuted: "Speed and reliability.",
  items: [
    { id: "next", name: "Next.js 15", description: "React framework with App Router" },
    { id: "convex", name: "Convex", description: "Real-time serverless backend" },
    { id: "flow", name: "React Flow", description: "Interactive whiteboard canvas" },
    { id: "tailwind", name: "Tailwind CSS", description: "Modern utility-first styling" },
  ] as const,
};

export const WHY = {
  eyebrow: "Why AgileKit",
  heading: "Different by design.",
  free: {
    price: "$0",
    name: "Free Core",
    description: "Core features free. Optional paid features may be available in the future.",
  },
  privacy: {
    name: "Privacy Controls",
    description:
      "Essential cookies keep sign-in and preferences working. Optional analytics stay off unless you opt in.",
  },
  openSource: {
    name: "Open Source",
    description: "Fully transparent, community-driven. Contribute, fork, or self-host.",
  },
};

export const ROADMAP = {
  eyebrow: "Roadmap",
  heading: "Shipping fast.",
  headingMuted: "Here's what's new.",
  shippedTitle: "Recently Shipped",
  shippedBadge: "Shipped",
  shipped: [
    {
      id: "retros",
      name: "Retros",
      description:
        "Retro boards with six formats, cards written in parallel, dots, a discussion walk, action items and history kept by the team",
    },
    {
      id: "predictability",
      name: "Sprint Predictability Score",
      description: "Track estimation accuracy over time with predictability health metrics",
    },
    {
      id: "exports",
      name: "Enhanced Data Exports",
      description: "Export full session data as CSV or JSON with analytics included",
    },
  ] as const,
  upNextTitle: "Up Next",
  upNextBadge: "Planned",
  upNext: [
    {
      id: "github",
      name: "GitHub Integration",
      description: "Import issues from repositories and push estimates to GitHub Projects",
    },
    {
      id: "summaries",
      name: "Automated Session Summaries",
      description: "Auto-generated session reports delivered to participants via email",
    },
  ] as const,
};

export const CTA = {
  heading: "Ready to estimate,",
  headingMuted: "or reflect?",
  description: "Open a planning poker room or a retro in seconds. Both free, no sign-up required.",
  estimate: START_ESTIMATING,
  retro: START_RETRO,
  github: { label: "Contribute", href: "https://github.com/spokvulcan/poker-planning" },
};
