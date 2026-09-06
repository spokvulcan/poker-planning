/**
 * The /pricing page's copy (spec §18.4, ADR-0014): a planning poker plan
 * comparison. Retros have no tier and appear only in the shared pricing
 * section's Free card (`components/homepage/copy.ts`); the words rule
 * ("insights" never) applies here too. Read by `pricing-content.tsx` and
 * checked by `lib/claims-register.test.ts`.
 */

export const HERO = {
  headline: "Simple pricing,",
  headlineMuted: "infinite value.",
  description:
    "AgileKit is completely free for core planning sessions today. Pro is in development and is planned to add deeper planning poker analytics, longer retention, and workflow integrations.",
  points: ["No credit card required for Free", "Pro checkout not live yet", "Open source"],
};

export const STATUS = {
  eyebrow: "Launch status",
  heading: "Paid checkout is not live yet",
  description:
    "We are preparing the site for payment-provider approval before enabling any live checkout. Exact launch pricing, final billing terms, and any Pro-specific retention rules will be published here before checkout goes live.",
  enterprise: "Custom or enterprise pricing is not currently offered.",
  links: {
    refund: { label: "Refund policy", href: "/refund-policy" },
    terms: { label: "Terms", href: "/terms" },
    billing: { label: "Contact billing", href: "mailto:support@agilekit.app" },
  },
};

export type ComparisonCell = boolean | string;

export interface ComparisonFeature {
  name: string;
  free: ComparisonCell;
  pro: ComparisonCell;
}

export const COMPARISON = {
  eyebrow: "Compare Plans",
  heading: "Everything you need,",
  headingMuted: "nothing you don't.",
  columns: { feature: "Feature", free: "Free", pro: "Pro" },
  categories: [
    {
      category: "Core Planning",
      features: [
        { name: "Team members", free: "Unlimited", pro: "Unlimited" },
        { name: "Planning sessions", free: "Unlimited", pro: "Unlimited" },
        { name: "Real-time voting & whiteboard", free: true, pro: true },
        { name: "Spectator mode", free: true, pro: true },
        { name: "Session timer", free: true, pro: true },
      ],
    },
    {
      category: "History & Retention",
      features: [
        { name: "Session history", free: "5-day rolling", pro: "Unlimited" },
        { name: "Issue & vote data retention", free: "5 days", pro: "Unlimited" },
      ],
    },
    {
      category: "Analytics",
      features: [
        { name: "Basic results summary", free: true, pro: true },
        { name: "Time-to-consensus tracking", free: false, pro: true },
        { name: "Voter alignment matrix", free: false, pro: true },
        { name: "Sprint predictability score", free: false, pro: true },
        { name: "Estimation accuracy trends", free: false, pro: true },
        { name: "Automated session summaries", free: false, pro: true },
      ],
    },
    {
      category: "Exports & Integrations",
      features: [
        { name: "CSV export", free: true, pro: true },
        { name: "JSON & analytics export", free: false, pro: true },
        { name: "Two-way Jira Cloud sync", free: false, pro: true },
        { name: "GitHub integration", free: false, pro: true },
      ],
    },
    {
      category: "Support",
      features: [
        { name: "Community support", free: true, pro: true },
        { name: "Priority email support", free: false, pro: true },
      ],
    },
  ] satisfies { category: string; features: ComparisonFeature[] }[],
};

export const FAQ = {
  eyebrow: "FAQ",
  heading: "Frequently asked questions.",
  description:
    "Everything you need to know about AgileKit pricing and plans. Can't find what you're looking for? Reach out to our team.",
  items: [
    {
      question: "Do all team members need a Pro account?",
      answer:
        "No! Only the room owner will need Pro to enable advanced features for that room. Other participants will still be able to join and use those features for free.",
    },
    {
      question: "What happens to my past sessions on the Free tier?",
      answer:
        "Until paid plans launch, current retention rules stay as they are today. If we introduce a shorter free-tier history window in the future, we will publish that change on this page before it takes effect.",
    },
    {
      question: "Can I cancel my Pro subscription anytime?",
      answer:
        "Paid checkout is not live yet. Before Pro launches, we will publish the final cancellation flow, billing cadence, and any downgrade rules on this page and at checkout.",
    },
    {
      question: "Is there a free trial for Pro?",
      answer:
        "The Free tier has unlimited usage for core features. When Pro fully launches, existing active accounts will receive early access to evaluate the new features.",
    },
  ],
};

export const CTA = {
  heading: "Ready to plan better?",
  description:
    "Start using AgileKit for faster, more accurate sprint estimation — jump right in, completely free.",
  start: { label: "Start planning for free", href: "/room/new" },
  demo: { label: "View demo", href: "/demo" },
};
