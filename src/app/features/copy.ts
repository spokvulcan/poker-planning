/**
 * The /features page's copy (ADR-0014): one page, two anchored sections,
 * `#planning-poker` and `#retro`; the title drops "Planning Poker". Poker
 * copy is kept under its anchor; retro copy says only what the retro
 * whiteboard does (the claims register). Read by `features-content.tsx` and
 * checked by `lib/claims-register.test.ts`.
 */

import { START_ESTIMATING, START_RETRO } from "@/lib/site-copy";

export const META = {
  title: "Features",
  description:
    "Explore AgileKit's features: real-time planning poker with results analytics and Jira sync. Retros on the same whiteboard, with face-down sticky notes, GIFs, voting and action items.",
  openGraph: {
    title: "Features | AgileKit",
    description:
      "Real-time planning poker with results analytics and Jira sync. Retros with sticky notes, GIFs, voting and action items. Everything a distributed Scrum team needs, free.",
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
      description: "Two-way sync: import sprints, push estimates back automatically",
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
  heading: "Stickies face-down,",
  headingMuted: "revealed together.",
  description:
    "A retro runs on the planning poker whiteboard: a Retro node that steps everyone through Write, Vote and Discuss, a timer, a sticky pad per column and a list of action items. Roles work as in a poker room, and by default facilitators move the retro along.",
  items: [
    {
      id: "templates",
      name: "Five templates",
      description:
        "Went well / To improve / Ideas by default, or Start / Stop / Continue, Mad / Sad / Glad, Liked / Learned / Lacked / Longed for and Sailboat. Rename, recolor, add or remove columns on the board, up to six.",
    },
    {
      id: "facedown",
      name: "Face-down until the reveal",
      description:
        "Click a pad, or double-click anywhere, and write. Other people's stickies stay scribbles until the facilitator reveals them, like cards in planning poker.",
    },
    {
      id: "gifs",
      name: "GIFs welcome",
      description:
        "Search GIPHY from a sticky, or paste a GIPHY, Tenor or Imgur link. A retro can be fun.",
    },
    {
      id: "votes",
      name: "Stack, then vote",
      description:
        "Drop a sticky on a similar one to stack them. Everyone gets three votes, one per topic (set 1 to 10 in the settings), and the totals stay hidden until the discussion.",
    },
    {
      id: "discuss",
      name: "Discussion in vote order",
      description:
        "The most-voted topics come first, and everyone's view follows the one in the spotlight. A facilitator can pull any sticky into the discussion.",
    },
    {
      id: "actions",
      name: "Action items that carry over",
      description:
        "Each has an optional owner and a checkbox. Start the next retro and it opens with the same columns and every open action item. Copy the retro as Markdown, or download it.",
    },
    {
      id: "anonymous",
      name: "Anonymous by default",
      description:
        "Teammates see what was written, not by whom. Turning on authors shows them on every sticky, including earlier ones.",
    },
    {
      id: "link",
      name: "Join by link",
      description:
        "No sign-up needed. A guest's retro is removed after 5 days without activity; sign in and the retros you start are kept until you delete them.",
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
        "Retros on the planning poker whiteboard: face-down stickies, GIFs, stacks, votes, a discussion in vote order and action items that carry over",
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
