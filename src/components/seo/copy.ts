/**
 * The homepage's structured data as plain strings (spec §18.2, ADR-0014):
 * the FAQ schema is the second FAQ list, kept beside the visible one in
 * `components/homepage/copy.ts` and read by the same claims-register test.
 * Metadata may say "retrospective" where the UI says "Retro" (§18.4).
 */

export const WEB_APPLICATION = {
  name: "AgileKit",
  description:
    "Free online planning poker and retrospectives for Scrum teams. Real-time collaboration, no registration required.",
  featureList: [
    "Real-time voting",
    "No registration required",
    "Unlimited team members",
    "Fibonacci scale for story point estimation",
    "Results analytics with average, median, and consensus",
    "Synchronized timer",
    "Whiteboard canvas interface",
    "Retro boards with cards written in parallel",
    "Retro history kept for the team",
  ],
};

export const FAQ_SCHEMA = [
  {
    question: "What is Planning Poker?",
    answer:
      "Planning Poker is an agile estimation technique where team members use cards to vote on the complexity of user stories. It helps teams reach consensus on effort estimates through discussion and collaboration, making sprint planning more accurate and engaging.",
  },
  {
    question: "Does AgileKit do retros too?",
    answer:
      "Yes. A retro is a board your team writes on together: everyone adds cards at once, in the meeting or before it, then you group them, vote with dots and walk through the topics. Start one with no account, or keep it with a team so its history and action items are there next sprint. Retros are free for every team.",
  },
  {
    question: "How much does AgileKit cost?",
    answer:
      "AgileKit's core features are completely free. There are no limitations on team size or number of planning poker rooms for core functionality. As an open-source project, we believe in making quality tools accessible to everyone. Optional paid features for planning poker may be available in the future.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "No account is required! Click 'Start estimating' or 'Start a retro' and share the link with your team. We designed it this way to remove barriers and get your team going as quickly as possible. A team that wants to keep its retro history signs in.",
  },
  {
    question: "Can retro cards be anonymous?",
    answer:
      "Yes. A team can make its retros anonymous: no author is stored with a card, not even for the facilitator. Votes are counted but nobody is shown how you voted. Anyone with the link can join a retro that is not kept by a team.",
  },
  {
    question: "How many people can join a planning session?",
    answer:
      "There's no limit on the number of participants in a planning session. Whether you have 5 or 500 team members, everyone can join and participate seamlessly.",
  },
  {
    question: "What voting scale does AgileKit use?",
    answer:
      "AgileKit uses the Fibonacci sequence (0, 1, 2, 3, 5, 8, 13, 21, ?) which is the industry standard for story point estimation. We're working on adding T-shirt sizes and custom scales in a future update.",
  },
  {
    question: "Can I use this tool offline or self-host it?",
    answer:
      "While the online version requires an internet connection, the entire codebase is open-source on GitHub. You can download and host your own instance for offline use or to meet specific security requirements.",
  },
  {
    question: "What browsers and devices are supported?",
    answer:
      "AgileKit works on all modern browsers (Chrome, Firefox, Safari, Edge) and is fully responsive on desktop, tablet, and mobile devices. No app installation required - it works directly in your browser.",
  },
  {
    question: "How does it compare to other planning poker tools?",
    answer:
      "Unlike other tools that charge monthly fees or limit features, our core features are free with no restrictions. Our tool is open-source, requires no registration, and includes features like real-time voting, multiple card sets, and team collaboration.",
  },
  {
    question: "Can I contribute to the project?",
    answer:
      "Yes! We welcome contributions. Visit our GitHub repository to report bugs, suggest features, or submit pull requests. You can also star the project to show your support.",
  },
];

/** Planning poker's how-to; the retro has no schema of its own in v1. */
export const HOW_TO = {
  name: "How to Run a Planning Poker Session",
  description:
    "Start free online planning poker sessions with your Scrum team in 4 easy steps. No registration required.",
  steps: [
    {
      name: "Create a Room",
      text: "Start a new planning session with one click. No registration required.",
    },
    {
      name: "Invite Your Team",
      text: "Share the room URL. Team members join instantly from any device.",
    },
    {
      name: "Vote on Stories",
      text: "Everyone votes simultaneously. Cards stay hidden until revealed.",
    },
    {
      name: "Reach Consensus",
      text: "Reveal votes, discuss differences, and align on story points.",
    },
  ],
};
