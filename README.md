# AgileKit - Free Online Planning Poker for Scrum Teams

[![Live Demo](https://img.shields.io/badge/demo-agilekit.app-blue?style=flat-square)](https://agilekit.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/spokvulcan/poker-planning?style=flat-square)](https://github.com/spokvulcan/poker-planning/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/spokvulcan/poker-planning?style=flat-square)](https://github.com/spokvulcan/poker-planning/network/members)

**The open-source planning poker tool that's completely free, requires no registration, and makes agile estimation simple for remote Scrum teams.**

[**Try AgileKit Now**](https://agilekit.app) | [Report Bug](https://github.com/spokvulcan/poker-planning/issues) | [Request Feature](https://github.com/spokvulcan/poker-planning/issues)

![AgileKit Planning Poker Room - Free Scrum Estimation Tool](public/agilekit_light.png#gh-light-mode-only "AgileKit Planning Poker Room")
![AgileKit Planning Poker Room - Free Scrum Estimation Tool](public/agilekit_dark.png#gh-dark-mode-only "AgileKit Planning Poker Room")

## Features

- **100% Free** - No premium tier, no hidden costs, no credit card required
- **No Registration** - Create a room and start estimating in seconds
- **Real-time Collaboration** - Instant vote synchronization across all participants
- **Modern Canvas Interface** - Whiteboard-style room with intuitive drag-and-drop
- **Multiple Voting Scales** - Fibonacci, Standard, T-Shirt sizes, or create custom scales
- **Issues Management** - Create, edit, and track issues within planning sessions
- **CSV Export** - Export issues with vote statistics (average, median, agreement)
- **Auto-Complete Voting** - Automatic reveal with countdown when all participants vote
- **Vote Analytics** - Average, median, and consensus percentage for each round
- **Visual Voting Progress** - See who has voted at a glance with emoji indicators
- **Built-in Timer** - Session timer for timeboxed estimation rounds
- **Spectator Mode** - Join sessions as an observer without voting
- **Dark/Light Theme** - Toggle themes or follow system preference
- **Auto-cleanup** - Poker rooms and guest retros are cleaned up after 5 days of inactivity
- **Open Source** - Fully transparent codebase, self-host if you prefer

### Retro

A retro runs on the same whiteboard canvas as the poker room, timer included. Start one at `/retro/new` and share the link; no account is needed to join.

- **Face-down writing** - Everyone writes stickies at once; other people's stickies stay face-down until the facilitator reveals them
- **Templates and columns** - Went well / To improve / Ideas, Start / Stop / Continue, Mad / Sad / Glad, the 4Ls or Sailboat; rename, add or remove columns on the board
- **GIFs** - Search GIPHY, or paste a GIPHY, Tenor or Imgur link
- **Stacks and votes** - Drop a sticky on another to stack them; each person has 3 votes by default, one per topic, and totals stay hidden until the discussion
- **Discussion** - Walk the most-voted topics in order, with everyone's view following the one in the spotlight
- **Action items** - Give each one an owner; "Start the next retro" carries the open ones over
- **Names hidden by default** - Teammates see what was written, not by whom, unless the retro is set to show authors
- **Markdown summary** - Copy or download the action items, topics and stickies
- **Kept when signed in** - A retro started while signed in, or by a guest who signs in later, is kept; a guest retro is deleted after 5 days of inactivity

## Quick Start

**Option 1: Use the hosted version (recommended)**

Visit [agilekit.app](https://agilekit.app), create a room, and share the link with your team.

**Option 2: Self-host**

```bash
# Clone the repository
git clone https://github.com/spokvulcan/poker-planning.git
cd poker-planning

# Install dependencies
npm install

# Start Convex backend (terminal 1)
npx convex dev

# Start Next.js dev server (terminal 2)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** The repository is named `poker-planning` while the product is branded as **AgileKit**. This reflects our [evolution from a single-purpose tool to a broader Agile toolkit](https://github.com/spokvulcan/poker-planning/discussions/87).

### Prerequisites

- Node.js 20+
- npm

### Environment Variables

Copy `.env.example` to `.env.local` and configure the variables below.

#### Next.js (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex deployment URL (from `npx convex dev`) |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Yes | Convex site URL for BetterAuth (`.convex.site`) |
| `NEXT_PUBLIC_SITE_URL` | No | Your site URL (defaults to `https://agilekit.app`) |
| `CONVEX_DEPLOY_KEY` | Prod | Deploy key for production (from Convex dashboard) |
| `NEXT_PUBLIC_GA_ID` | No | Google Analytics 4 Measurement ID |
| `GIPHY_API_KEY` | No | GIPHY key for GIF search on retro stickies, read only on the server by the `/api/gifs` route. Set it in `.env.local`, or in your host's environment (e.g. Vercel) in production. Without it the GIF picker only takes pasted GIPHY, Tenor or Imgur links |

#### Convex Server (via `npx convex env set`)

These variables run on Convex servers and **cannot** be set in `.env.local`.

| Variable | Required | Description |
|----------|----------|-------------|
| `SITE_URL` | Yes | Base URL for auth callbacks |
| `BETTER_AUTH_SECRET` | Yes | Secret for signing sessions (min 32 chars) |
| `RESEND_API_KEY` | Email | Resend key for sign-in (magic link) emails, the only email AgileKit sends |

```bash
# Development setup
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32)
```

## Technology Stack

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript |
| **Backend**  | Convex (serverless with real-time reactivity) |
| **Styling**  | Tailwind CSS 4, shadcn/ui                     |
| **Canvas**   | @xyflow/react                                 |
| **State**    | Convex reactive queries                       |

## Running Tests

```bash
# Run unit and Convex tests (Vitest)
npm run test

# Run all E2E tests
npm run test:e2e

# Run with Playwright UI for debugging
npm run test:e2e:ui

# Run in headless mode (CI)
npm run test:e2e:headless
```

## Deployment

### Frontend (Next.js)

Deploy to Vercel, Netlify, or any platform supporting Next.js:

```bash
npm run build
```

### Backend (Convex)

```bash
npx convex deploy --prod
```

### Upgrading from the team retro

The whiteboard retro replaces the earlier team retro (Teams, stages, clusters and retro emails). After deploying this version, run once against each deployment that ran the team retro:

```bash
npx convex run migrations:purgeLegacyRetros --prod
npx convex run migrations:clearLegacyEmailOptOut --prod
```

It deletes every team-retro room through the room cascade, empties the team retro's tables (cancelling any reminder email still scheduled) and strips the legacy `teamId` and `joinPolicy` fields from the remaining rooms. It works in batches, rescheduling itself, and is safe to re-run: a run with nothing left returns `{ deleted: 0, roomsScheduled: 0, done: true }`. Until it has run, an old retro opens to "Retro Unavailable". The second clears the retired retro emails' `users.emailOptOut` flag the same way. Afterwards the legacy `rooms.teamId`, `rooms.joinPolicy` and `users.emailOptOut` fields can be dropped from `convex/schema.ts` and the emptied tables deleted. `UNSUBSCRIBE_SECRET` is no longer read and can be removed with `npx convex env remove UNSUBSCRIBE_SECRET --prod`.

## Use Cases

- **Sprint Planning** - Estimate user stories with your Scrum team
- **Backlog Refinement** - Collaboratively size your product backlog
- **Remote Estimation** - Perfect for distributed and hybrid teams
- **Sprint Retrospectives** - Write, vote and discuss on a shared whiteboard, and carry open action items into the next retro
- **Agile Training** - Teach planning poker techniques interactively

## Roadmap

- [ ] Jira integration
- [ ] Team velocity tracking
- [ ] Session history (view past sessions)

## Contributing

Contributions are welcome! Whether it's bug fixes, new features, or documentation improvements.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Privacy & Analytics

The hosted version at [agilekit.app](https://agilekit.app) uses Google Analytics 4 for basic usage analytics (page views, session duration). No personal data is collected beyond standard analytics. Self-hosted instances do not include analytics by default.

See our [Privacy Policy](https://agilekit.app/privacy) for details.

## Versioning

This project follows [Semantic Versioning](https://semver.org/) and uses [Conventional Commits](https://www.conventionalcommits.org/) for automated releases.

- View all releases on the [Releases page](https://github.com/spokvulcan/poker-planning/releases)
- See [CHANGELOG.md](CHANGELOG.md) for version history
- See [docs/releasing.md](docs/releasing.md) for release process details

## License

This project is open source under the [MIT License](LICENSE).

---

<p align="center">
  <strong>Made with care for the Agile community</strong><br>
  <a href="https://agilekit.app">agilekit.app</a> - Free Planning Poker for Everyone
</p>
