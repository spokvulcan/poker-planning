<div align="center">

<a href="https://agilekit.app"><img src="public/logo.svg" width="64" height="64" alt="AgileKit logo"></a>

# AgileKit

**Estimate and reflect, without the noise.**

Planning poker and retros for Scrum teams, on one real-time whiteboard.<br>
Free, no sign-up, open source.

[![Version](https://img.shields.io/github/package-json/v/spokvulcan/poker-planning?style=flat-square&label=version&color=3b82f6)](https://github.com/spokvulcan/poker-planning/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/spokvulcan/poker-planning/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/spokvulcan/poker-planning/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square)](LICENSE)

[**Open AgileKit**](https://agilekit.app) &nbsp;·&nbsp; [Try the demo](https://agilekit.app/demo) &nbsp;·&nbsp; [Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Report a bug](https://github.com/spokvulcan/poker-planning/issues/new?template=bug_report.md)

</div>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/agilekit_dark.png">
  <img src="public/agilekit_light.png" alt="A planning poker room in AgileKit: six players around the session card, with the voting cards below">
</picture>

<br>
<br>

<table>
<tr>
<th width="50%">Planning poker</th>
<th width="50%">Retro</th>
</tr>
<tr>
<td valign="top">

- Vote in private, reveal together
- Fibonacci, T-shirt or your own scale
- Average, median and consensus on reveal
- Issues, a timer and CSV export
- Two-way Jira Cloud sync

</td>
<td valign="top">

- Stickies stay face-down until the reveal
- Five templates, with columns you can edit
- Stack, vote, then discuss in vote order
- Action items carry over to the next retro
- GIFs welcome, names hidden by default

</td>
</tr>
</table>

## Run it yourself

With Node.js 20.9 or newer:

```bash
git clone https://github.com/spokvulcan/poker-planning.git
cd poker-planning
npm install
npx convex dev
```

The first run creates a Convex deployment, writes its URLs to `.env.local` and then asks for an auth secret. Set it from a second terminal and start the app:

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npm run dev
```

Open [localhost:3000](http://localhost:3000). To go live, ship the backend with `npx convex deploy` and host the Next.js app on Vercel or any Node server, with the variables below.

<details>
<summary><b>Environment variables</b></summary>

<br>

On Convex, set with `npx convex env set` (add `--prod` for production):

| Variable | Used for |
| --- | --- |
| `BETTER_AUTH_SECRET` | Signing sessions. Required |
| `SITE_URL` | Sign-in and Jira OAuth callbacks. Required in production, defaults to `http://localhost:3000` |
| `RESEND_API_KEY` | Emailing sign-in links, sent from `EMAIL_FROM_ADDRESS` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in ([setup guide](docs/google-oauth-setup.md)) |
| `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY` | Jira Cloud sync |

For Next.js, in `.env.local` or your host's settings:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | Reaching Convex. Written by `npx convex dev` locally |
| `NEXT_PUBLIC_SITE_URL` | Your public URL |
| `CONVEX_DEPLOY_KEY` | Deploying Convex from your host's build |
| `GIPHY_API_KEY` | GIF search on stickies. Pasted GIPHY, Tenor and Imgur links work without it |
| `NEXT_PUBLIC_GA_ID` | Google Analytics |

[`.env.example`](.env.example) has notes on most of them.

</details>

## Contributing

Issues and pull requests are welcome. [CONTEXT.md](CONTEXT.md) defines the words the code uses, and [docs/adr](docs/adr) records why it is built the way it is. Before opening a pull request:

```bash
npm run lint && npm run ts:check && npm test
npm run test:e2e
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), which [release-please](docs/releasing.md) turns into releases and the [changelog](CHANGELOG.md).

<br>

<p align="center">
  <sub>Built with <a href="https://nextjs.org">Next.js</a>, <a href="https://convex.dev">Convex</a>, <a href="https://www.better-auth.com">Better Auth</a>, <a href="https://reactflow.dev">React Flow</a> and <a href="https://ui.shadcn.com">shadcn/ui</a>. <a href="LICENSE">MIT licensed</a>.</sub>
</p>
