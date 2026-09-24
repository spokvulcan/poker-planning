/**
 * The homepage's copy (ADR-0014), in one plain module the section components
 * render from, so `src/lib/claims-register.test.ts` can read every
 * register-checked line without a DOM. Two ceremonies, one toolkit: poker
 * copy is kept and scoped under its ceremony, never deleted; retro copy says
 * only what the retro whiteboard does (the claims register).
 *
 * Words: "Retro" wherever a person reads it, "retrospective" only in
 * long-form copy; "session" only inside planning poker; "ceremony" never.
 */

import { START_ESTIMATING, START_RETRO } from "@/lib/site-copy";

export interface Cta {
  label: string;
  href: string;
  testId?: string;
}

// --- Hero ---

export const HERO = {
  badge: "Retros are here",
  badgeHref: "/blog/sprint-retrospectives",
  headline: "Estimate and reflect,",
  headlineMuted: "without the noise.",
  description:
    "Planning poker and retros for Scrum teams, on one real-time whiteboard. No accounts required. Free forever. Open source.",
  estimate: { ...START_ESTIMATING, testId: "hero-start-button" } satisfies Cta,
  retro: { ...START_RETRO, testId: "hero-retro-button" } satisfies Cta,
  /** The framed poker simulation (ADR-0003). There is no retro demo (ADR-0014). */
  demoFrameTitle: "Live Planning Poker Demo",
};

// --- Two ceremonies, one toolkit (directly under the hero) ---

export const CEREMONIES = {
  eyebrow: "One toolkit",
  heading: "Plan the sprint.",
  headingMuted: "Reflect on it.",
  description:
    "Planning poker for the estimates, Retro for what the team learned. Same whiteboard, both free, both open source, both one link away.",
  poker: {
    name: "Planning poker",
    description:
      "Everyone picks a card, cards stay hidden until all have voted, and the numbers land in front of the team. Rooms open instantly, no accounts required.",
    points: [
      "Fibonacci, T-shirt or your own scale",
      "Jira Cloud sync and CSV export",
      "Timer, spectators and issues",
    ],
    cta: START_ESTIMATING satisfies Cta,
    demo: { label: "Interactive Demo", href: "/demo" } satisfies Cta,
  },
  retro: {
    name: "Retro",
    description:
      "Everyone writes stickies at once, face-down until the reveal. Stack the similar ones, vote, talk through the top topics and leave with action items.",
    points: [
      "Five templates, or your own columns",
      "Names hidden by default",
      "GIFs, timer and action items",
    ],
    cta: START_RETRO satisfies Cta,
  },
};

// --- How it works, tabbed per ceremony ---

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  heading: "A refined workflow for",
  headingMuted: "both halves of the sprint.",
  tabs: { poker: "Planning poker", retro: "Retro" },
  poker: {
    steps: [
      {
        number: "01",
        title: "Create Room Instantly",
        description:
          "Start a session with zero configuration. No sign-up required, no passwords to remember. Just click and go.",
      },
      {
        number: "02",
        title: "Invite Team",
        description: "Share the secure link. Members join from any browser.",
      },
      {
        number: "03",
        title: "Estimate",
        description: "Simultaneous voting to eliminate anchoring bias.",
      },
      {
        number: "04",
        title: "Align & Conquer",
        description:
          "Reveal votes, discuss discrepancies, and establish consensus faster than ever before.",
      },
    ],
    /** Strings the poker step animations draw. */
    animation: {
      roomName: "Sprint 42 Planning",
      startButton: "Start Session",
      created: "Room created",
      you: "You",
      waiting: "Waiting for others...",
      consensus: "Consensus:",
    },
  },
  retro: {
    steps: [
      {
        number: "01",
        title: "Open a board",
        description:
          "Pick a template, name the retro and share the link. Nobody needs an account.",
      },
      {
        number: "02",
        title: "Write face-down",
        description:
          "Everyone writes at once. Stickies stay face-down until the facilitator reveals them.",
      },
      {
        number: "03",
        title: "Stack and vote",
        description:
          "Drop a sticky on a similar one to stack them. Then vote; totals stay hidden until the discussion.",
      },
      {
        number: "04",
        title: "Discuss and act",
        description:
          "Talk through the most-voted topics first and write action items with owners. Start the next retro and the open ones carry over.",
      },
    ],
    /** Strings the retro step animations draw. */
    animation: {
      retroName: "Sprint 42 Retro",
      startButton: "Start a retro",
      created: "Board open",
      /** One sticky per column of the default template: Went well, To improve, Ideas. */
      stickies: ["Pairing on the API", "Flaky deploys", "Demo on Fridays"],
      /** Dropped on the "To improve" sticky to stack them. */
      stacked: "CI keeps timing out",
      yourVotes: "Your votes",
      votesPerPerson: 3,
      spotlight: "Discussing · #1",
      topicVotes: 5,
      action: "Quarantine flaky tests",
      owner: "Bea",
    },
  },
};

// --- App preview: both boards ---

export const APP_PREVIEW = {
  eyebrow: "Interface",
  heading: "Designed for focus.",
  description:
    "A distraction-free environment that keeps your team on the conversation, not the tool.",
  tabs: { poker: "Planning poker", retro: "Retro" },
  poker: {
    image: {
      light: "/agilekit_light.png",
      dark: "/agilekit_dark.png",
      alt: "Planning poker room showing players, cards and results",
    },
    features: [
      {
        id: "friction",
        name: "Zero friction.",
        description:
          "Create and join rooms instantly. No account creation slowing down your sprint planning.",
      },
      {
        id: "unbiased",
        name: "Unbiased voting.",
        description:
          "Cards remain hidden until everyone has voted, ensuring independent estimation.",
      },
      {
        id: "results",
        name: "Clear results.",
        description:
          "See where the team agrees and who the outlier is the moment votes are revealed.",
      },
    ] as const,
  },
  retro: {
    image: {
      light: "/retro_light.png",
      dark: "/retro_dark.png",
      alt: "A finished retro: stickies in three columns, topics ranked by their votes, and action items with owners",
    },
    features: [
      {
        id: "parallel",
        name: "Everyone at once.",
        description:
          "Everyone writes at the same time. Stickies stay face-down until the facilitator reveals them, like cards in planning poker.",
      },
      {
        id: "names",
        name: "Names hidden by default.",
        description:
          "Teammates see what was written, not by whom. A setting shows authors when your team wants them.",
      },
      {
        id: "carryover",
        name: "Open items carry over.",
        description:
          "Start the next retro from this one: same columns, and every open action item comes along.",
      },
    ] as const,
  },
};

// --- Capabilities (the homepage feature list) ---

export const CAPABILITIES = {
  eyebrow: "Capabilities",
  heading: "Everything you need.",
  headingMuted: "Nothing you don't.",
  description:
    "One toolkit for estimating and reflecting. Core functionality is completely free and instantly accessible.",
  cta: { label: "View full feature list", href: "/features" } satisfies Cta,
  poker: {
    name: "Planning poker",
    features: [
      "Unlimited team members",
      "Unlimited sessions",
      "Real-time updates",
      "Multiple voting scales",
      "Issues management",
      "Jira Cloud integration",
      "CSV export with stats",
      "Session timer",
      "Spectator mode",
    ],
  },
  retro: {
    name: "Retro",
    features: [
      "Five column templates",
      "Face-down until the reveal",
      "GIFs on stickies",
      "Stacks and votes",
      "Discussion in vote order",
      "Action items with owners",
      "Open items carry over",
      "Markdown summary",
      "Names hidden by default",
    ],
  },
};

// --- Pricing section (also rendered on /pricing) ---

export const PRICING_SECTION = {
  eyebrow: "Pricing",
  heading: "Transparent pricing.",
  description:
    "Start using AgileKit completely free today. A Pro tier for planning poker, with integrations and deeper analytics, is in development.",
  badge: "In Development",
  tiers: [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: "forever",
      description: "For every team: planning poker rooms and retros, free.",
      features: [
        "Unlimited participants",
        "Real-time voting & whiteboard",
        "5-day history for planning poker rooms",
        "Basic results analytics",
        "CSV exports",
        "Signed-in retros kept until you delete them",
      ],
      cta: "Start planning for free",
      href: "/room/new",
      disabled: false,
    },
    {
      id: "pro",
      name: "Pro",
      price: "Coming Soon",
      period: "",
      description:
        "For engineering teams that want deeper planning poker analytics and workflow automation.",
      features: [
        "Everything in Free, plus:",
        "Time-to-consensus tracking",
        "Voter alignment matrix",
        "Sprint predictability score",
        "Two-way Jira & GitHub sync",
        "Unlimited session history",
      ],
      cta: "Join Waitlist",
      href: "#",
      disabled: true,
    },
  ],
};

// --- Use cases ---

export const USE_CASES = {
  eyebrow: "Architecture",
  heading: "Built for modern teams.",
  description:
    "Under the hood, a real-time sync engine ensures every vote, sticky, reveal and state change lands instantly across all clients.",
  items: [
    {
      id: "remote",
      title: "Remote-first",
      description: "Real-time collaboration that works seamlessly across continents.",
    },
    {
      id: "instant",
      title: "Instant execution",
      description: "No lag, no waiting. Built on a high-performance reactive backend.",
    },
    {
      id: "data",
      title: "Data-driven estimates",
      description: "Visualize voting patterns to identify disagreement and align quickly.",
    },
    {
      id: "facedown",
      title: "Face-down first",
      description:
        "Retro stickies stay face-down until the facilitator reveals them, the way planning poker hides votes.",
    },
    {
      id: "access",
      title: "Universal access",
      description: "Designed for all teams. No accounts required to participate.",
    },
    {
      id: "carryover",
      title: "Open items carry over",
      description:
        "Start the next retro from the last one: same columns, every open action item already on the board.",
    },
  ] as const,
};

// --- FAQ (the visible list; the structured-data list is components/seo/copy.ts) ---

export const FAQ = {
  eyebrow: "FAQ",
  heading: "Common",
  headingMuted: "questions.",
  description:
    "Everything you need to know about AgileKit, how it works, and our commitment to keeping it free.",
  stillQuestions: "Still have questions?",
  reachOut: "Reach out to us on GitHub or check our detailed documentation.",
  github: {
    label: "View GitHub",
    href: "https://github.com/spokvulcan/poker-planning",
  } satisfies Cta,
  items: [
    {
      question: "What is Planning Poker?",
      answer:
        "Planning Poker is an agile estimation technique where team members use cards to vote on the complexity of user stories. It helps teams reach consensus on effort estimates through discussion and collaboration, making sprint planning more accurate and engaging.",
    },
    {
      question: "Does AgileKit do retros too?",
      answer:
        "Yes. A retro runs on the same whiteboard as planning poker. Pick a template, then everyone writes stickies at once, face-down until the facilitator reveals them. Stack the similar ones, vote, talk through the top topics and write action items. When you are done, copy the retro as Markdown or start the next one with the open action items carried over. Retros are free, and nobody needs an account.",
    },
    {
      question: "How much does AgileKit cost?",
      answer:
        "AgileKit's core features are free with no limitations on team size or number of planning poker rooms. As an open-source project, we believe in making quality tools accessible to everyone. We may introduce optional paid features for planning poker in the future, but the core planning poker functionality will always remain free.",
    },
    {
      question: "Do I need to create an account?",
      answer:
        "No. Click 'Start estimating' or 'Start a retro' and share the link with your team. A guest's retro is removed after 5 days without activity; sign in and the retros you start are kept until you delete them.",
    },
    {
      question: "Do retro stickies show who wrote them?",
      answer:
        "Not by default: teammates see what was written, not by whom. A setting in the retro shows authors, and it shows them on every sticky, including ones written before it was turned on. Vote totals stay hidden until the discussion starts, and nobody sees how anyone else voted.",
    },
    {
      question: "How many people can join a planning session?",
      answer:
        "There's no limit on the number of participants in a planning session. Whether you have 5 or 500 team members, everyone can join and participate seamlessly.",
    },
    {
      question: "What voting scale does AgileKit use?",
      answer:
        "AgileKit uses the Fibonacci sequence (0, 1, 2, 3, 5, 8, 13, 21 and up) by default, the industry standard for story point estimation. When you create a game you can pick a Standard scale (0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100), T-shirt sizes (XS to XXL) or your own custom cards instead.",
    },
    {
      question: "Can I use this tool offline or self-host it?",
      answer:
        "While the online version requires an internet connection, the entire codebase is open-source on GitHub. You can download and host your own instance for offline use or to meet specific security requirements.",
    },
    {
      question: "What browsers and devices are supported?",
      answer:
        "AgileKit works on all modern browsers (Chrome, Firefox, Safari, Edge) and is fully responsive on desktop, tablet, and mobile devices. No app installation required: it works directly in your browser.",
    },
    {
      question: "How does it compare to other planning poker tools?",
      answer:
        "Unlike other tools that charge monthly fees or limit core features, our essential planning poker functionality is free with no restrictions. Our tool is open-source, requires no registration, and includes real-time voting, Fibonacci estimation, and team collaboration.",
    },
    {
      question: "Can I contribute to the project?",
      answer:
        "Yes. We welcome contributions. Visit our GitHub repository to report bugs, suggest features, or submit pull requests. You can also star the project to show your support.",
    },
  ],
};

// --- Closing call to action ---

export const CALL_TO_ACTION = {
  heading: "Ready to estimate, or reflect?",
  description:
    "Open a planning poker room or a retro in seconds. Zero configuration, zero friction.",
  estimate: START_ESTIMATING satisfies Cta,
  retro: START_RETRO satisfies Cta,
  github: {
    label: "View on GitHub",
    href: "https://github.com/spokvulcan/poker-planning",
  } satisfies Cta,
};
