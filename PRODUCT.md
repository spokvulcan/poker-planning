# Product

## Register

product

## Users

Two co-equal personas, both protected.

**Scrum Master / PM facilitating a remote refinement.** Running a 30-minute
session with 5–8 distributed engineers. They've used three other poker tools,
hate them all, want zero setup, want the meeting to end on time, want to leave
with usable numbers.

**Engineers estimating among themselves.** No facilitator. They want to settle
a sizing argument in five minutes without filing a ticket to IT for a Jira
plugin. The whole experience must hold up when nobody is "running" the room.

Job-to-be-done: go from "we need to estimate" to "we have estimates" in under
a minute of setup, with a session that respects everyone's time and never
feels heavier than the work it's supporting.

## Product Purpose

A focused planning poker tool for distributed agile teams. Two surfaces:

- **The room** (`/room/*`, `/demo`, `/dashboard`) — a real-time whiteboard
  canvas where teams vote, reveal, and resolve estimates. This is the product.
- **The marketing site** (`/`, `/about`, `/pricing`, `/features`, `/blog`,
  `/changelog`) — a landing surface that exists to deliver users into the
  room. Built to a brand-quality bar because design-savvy teams judge tools
  by their landing.

Both surfaces share the same standards. When a design task targets a
marketing surface, treat it as brand register. When it targets the app,
treat it as product register. PRODUCT.md's default is `product` because the
room is where the value lives.

Success is the Linear of estimation: small, opinionated, the obvious choice
for teams that care about how their tools feel. Free forever, no premium
tier — the moat is craft, not features.

## Brand Personality

**Sharp, precise, confident.**

- *Sharp* — every element earns its place. Crisp edges, deliberate type, no
  decorative filler.
- *Precise* — defaults are chosen, not pulled from a settings catalog.
  Animations time out exactly. Numbers align. Spacing has rhythm.
- *Confident* — opinionated. We pick smart defaults (Fibonacci, Standard,
  T-shirt) and put them up front. Custom scales and advanced settings exist
  for the rare team that needs them, but they're never the path of least
  resistance.

Voice: terse, generous, a little dry. Never enthusiastic in the SaaS sense —
no exclamation marks, no "Awesome!" toasts, no "We're so excited to
announce". The product itself communicates competence; the copy doesn't have
to oversell.

Reference north stars (philosophy and craft, not visual mimicry):

- **Linear** — opinionated defaults, devs-first, the bar for product
  philosophy in our category.
- **Vercel** — restrained marketing surface, deeply confident product, motion
  that earns its place.
- **shadcn/ui** — design system as taste, not as configuration. Defaults that
  don't need tuning.
- **x.com** — dense without feeling cluttered; speed and information density
  treated as features.

## Anti-references

Concrete patterns to refuse:

- **Jira and the Atlassian shape.** Cobalt chrome, dense settings, the
  "configured by IT" feel. Every screen looking like it was approved by an
  admin console. We are the opposite of this.
- **Cluttered competitor poker tools** (PlanITPoker, ScrumPoker.online,
  Pokerno style). Ads above the voting table, "Upgrade to Pro" banners,
  donate buttons in the room, sidebars full of unrelated promo. The room
  must remain the room.
- **Generic SaaS landing reflexes**:
  - "Trusted by 10,000 teams" + grayscale logo wall.
  - The hero-metric template (giant number, small label, supporting stats).
  - Smiling-customer testimonial grids with stock-photo headshots.
  - 3×3 icon-and-heading feature grids that say nothing.
  - Gradient-text headlines.
  - Empty SaaS aphorisms ("Built for teams that ship", "Ship faster").
- **Decorative motion.** Bouncy springs, hover-tilts on cards, parallax for
  its own sake, glassmorphism as default surface. Motion appears only when
  it teaches the user something.

## Design Principles

1. **Progressive disclosure is the product.** Minimum visible surface by
   default. Advanced features (Jira import, custom scales, dashboard
   analytics, integrations) are reachable but invisible until requested. A
   first-time user should see only what they need to start a vote; a power
   user can summon the full surface in a keystroke. Design every screen
   against the question "what can we hide?"

2. **The room is sacred.** No ads, no upsell, no marketing banner, no
   announcement bar inside `/room/*`. Once a session is in progress, every
   pixel serves the estimation. The marketing site can hustle for users;
   the room cannot.

3. **Opinionated defaults beat configuration.** Pick the scale, pick the
   timing, pick the reveal behavior — and pick well. Configuration exists
   for the rare team that genuinely needs it, but it should never be the
   path a new user takes. When two reasonable defaults exist, choose the
   one that gets a 6-engineer team voting in 10 seconds, not the one that
   respects every imagined edge case.

4. **Practice what you preach.** AgileKit competes by being the obvious
   choice for design-savvy teams. That bar is set every time someone clicks
   a button or reads a label. Sloppy spacing, generic icons, and SaaS copy
   disqualify us from our own positioning. The craft *is* the marketing.

5. **Distance from the SaaS reflex.** Every time a screen feels like it
   could be from any B2B tool, redo it. Match-and-refuse on the
   anti-reference list above. When a layout feels "safe", it's likely the
   training-data answer — pick the harder, more specific direction.

## Accessibility & Inclusion

Pragmatic stance for the current stage. Not a formal WCAG target — but the
floor:

- **Text must always be legible.** Both light and dark themes meet readable
  contrast, especially body copy and form labels. Both themes are
  first-class — neither is the "default" with the other as an afterthought.
- **No formal AA/AAA audit yet, no reduced-motion path, no color-blindness
  review.** Reason: the user base is too small for these to deliver value
  today, and over-engineering accessibility before a real user asks would
  slow the work that does matter.
- **Revisit trigger:** the first user request, the first enterprise inquiry,
  or the first contributor PR addressing it. At that point, prioritize
  accordingly.

This is a deliberate trade-off, not an oversight. It does not license
illegible contrast or tiny tap targets — it just means we're not investing
in formal compliance until there's reason to.
