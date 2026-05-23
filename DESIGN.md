---
name: AgileKit
description: Free planning poker for distributed agile teams.
colors:
  ink: "oklch(0.145 0 0)"
  paper: "oklch(1 0 0)"
  pencil-gray: "oklch(0.205 0 0)"
  pencil-gray-soft: "oklch(0.922 0 0)"
  muted-fg: "oklch(0.556 0 0)"
  border: "oklch(0.922 0 0)"
  surface-1: "oklch(1 0 0)"
  surface-2: "oklch(0.985 0 0)"
  surface-3: "oklch(0.967 0.001 286.375)"
  blueprint-blue: "oklch(0.55 0.22 250)"
  blueprint-blue-deep: "oklch(0.45 0.22 250)"
  status-info-bg: "oklch(0.95 0.02 250)"
  status-info-fg: "oklch(0.45 0.15 250)"
  status-success-bg: "oklch(0.95 0.02 150)"
  status-success-fg: "oklch(0.45 0.15 150)"
  status-warning-bg: "oklch(0.95 0.03 85)"
  status-warning-fg: "oklch(0.45 0.15 85)"
  status-error-bg: "oklch(0.95 0.03 25)"
  status-error-fg: "oklch(0.50 0.20 25)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 7vw, 6rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body-large:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 300
    lineHeight: 1.6
    letterSpacing: "normal"
  body:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  "2xl": "16px"
  "3xl": "20px"
  "4xl": "24px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "16": "64px"
  "24": "96px"
components:
  button-primary:
    backgroundColor: "{colors.pencil-gray}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-cta-hero:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.2xl}"
    padding: "0 48px"
    height: "64px"
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  voting-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "96px"
    width: "64px"
  voting-card-selected:
    backgroundColor: "{colors.blueprint-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    height: "96px"
    width: "64px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  hero-pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.pencil-gray}"
    rounded: "{rounded.pill}"
    padding: "6px 16px"
---

# Design System: AgileKit

## 1. Overview

**Creative North Star: "The Architect's Desk"**

AgileKit's visual system is the surface of a precise, well-lit drafting table.
Black ink on warm paper. A faint grid in the background. One accent color, a
strong blueprint blue, used the way a draftsman uses a colored pencil: rare,
deliberate, and only where it carries meaning. The system is monochrome by
default and lifts a single hue to mean "here, attend to this": a vote
selected, an action primary, a status changing.

Every layout is a planned drawing, not a printed brochure. Generous
whitespace, tight tracking on display type, restrained motion that snaps
rather than springs. The marketing surface and the room share this vocabulary
so users feel the same hand from landing page through canvas. We reject the
SaaS reflex: no gradient text, no glass surfaces by default, no smiling
testimonial walls, no decorative bounce.

**Key Characteristics:**
- Monochrome canvas, single blue accent at ≤10% surface coverage.
- Precise typography. Display weight 700, tracking-tighter, line-height 0.95.
- Flat-by-default surfaces; elevation only as a response to state.
- Motion uses exponential ease-out, never elastic. Selection lifts; hover
  hints; click compresses.
- Both light and dark themes are first-class; neither is the "default."
- Status communicates through a four-color quartet (info / success / warning
  / error), reserved strictly for semantic feedback.

## 2. Colors: The Drafting Palette

Restrained palette. Ink and paper carry 90%+ of every screen; one engineered
blue carries the rest; status colors appear only when the interface is
reporting state.

### Primary
- **Blueprint Blue** (`oklch(0.55 0.22 250)`, Tailwind `blue-500`): the single
  voluntary accent. Used on the selected voting card, the primary "Reveal
  Votes" CTA, the facilitator star, the active voting progress bar, and the
  "Quick Vote" badge. Never decorative.
- **Blueprint Blue Deep** (`oklch(0.45 0.22 250)`, Tailwind `blue-600`): hover
  and active state of the accent. The depression of the colored pencil
  against the paper.

### Neutral
- **Ink** (`oklch(0.145 0 0)` light / `oklch(0.985 0 0)` dark): body text and
  primary surface in the inverted theme. Tinted-zero neutral, never pure
  black or white.
- **Paper** (`oklch(1 0 0)` light / `oklch(0.145 0 0)` dark): page
  background. The canvas the work is drawn on.
- **Pencil Gray** (`oklch(0.205 0 0)` light / `oklch(0.922 0 0)` dark): the
  shadcn `--primary` token. Used for primary buttons across the app. The
  room saves Blueprint Blue for selection, so most user-initiated buttons
  are this near-black on paper rather than a colored fill.
- **Muted Foreground** (`oklch(0.556 0 0)` light / `oklch(0.708 0 0)` dark):
  secondary text, captions, "(you)" annotation, vote-count fractions.
- **Border** (`oklch(0.922 0 0)` light / `oklch(1 0 0 / 10%)` dark): hairline
  divider color. Most cards prefer `ring-1 ring-foreground/10` over solid
  borders for an even subtler edge.

### Surfaces (stacking depth)
Layered backgrounds for depth without shadow:
- **Surface 1** (`oklch(1 0 0)` light / `oklch(0.145 0 0)` dark): base
  container. Cards, panels, the room canvas.
- **Surface 2** (`oklch(0.985 0 0)` light / `oklch(0.16 0 0)` dark): elevated
  container. Sidebars, popovers, secondary panels.
- **Surface 3** (`oklch(0.967 0.001 286.375)` light / `oklch(0.18 0 0)`
  dark): highest. React Flow handles, hover states on interactive list
  items.

### Status (semantic only)
A four-color quartet. Each role has a `-bg` / `-fg` pair: backgrounds are
desaturated chroma (≤0.05); foregrounds carry the saturation.
- **Info** (hue 250, blue): active session indicator, voting progress bar,
  "in progress" states.
- **Success** (hue 150, green): "Voting complete" state, "New Round" CTA
  when game is over, voted-checkmark.
- **Warning** (hue 85, amber): auto-reveal "On" state, countdown CTA, owner
  Crown.
- **Error** (hue 25, red): destructive actions only. The `--destructive`
  token (`oklch(0.577 0.245 27.325)`) is the only saturated red allowed in
  the system.

### Named Rules

**The One Mark Rule.** Blueprint Blue carries no more than 10% of any
screen. If a layout has two or more saturated blue surfaces fighting for
attention, one of them is wrong. Audit by squinting at a screenshot: the
blue should read as a single point of focus.

**The Tinted-Zero Rule.** Every neutral is OKLCH with chroma at or near
zero. Hex `#000` and `#fff` are forbidden. They look harsh on real displays
and break theme inversion. The Surface 3 token's `0.001 286.375` chroma is
the *maximum* drift permitted in any neutral.

**The Status-Only Rule.** Info, success, warning, and error colors appear
*only* when the UI is reporting a state. Never as decorative tints, never as
brand accents, never on the marketing site outside genuine feedback
contexts.

## 3. Typography: The Drafted Letterform

**Display / Body Font:** Outfit (with `ui-sans-serif, system-ui, sans-serif`
fallback)
**Mono Font:** Geist Mono (with `ui-monospace, SFMono-Regular, monospace`
fallback)

**Character:** Outfit is a geometric humanist sans, confident at large sizes
(display weight 700 reads sharp without feeling bossy), legible at body
sizes, and quiet at label sizes. Geist Mono carries countdown numerals,
tabular results, and any place alignment matters more than warmth. There is
no serif, no decorative display face. The typography is mute until it has
something to say.

### Hierarchy

- **Display** (700, `clamp(2.5rem, 7vw, 6rem)`, line-height 0.95, tracking
  `-0.04em`): hero headlines like "Planning poker, without the noise." Always
  paired with a tone-of-grey tail clause for hierarchy contrast (the second
  line in `text-gray-300 dark:text-zinc-700`). Never multi-line beyond two,
  never used inside the room.
- **Headline** (600, 1.5rem, line-height 1.2, tracking `-0.02em`): section
  titles on the marketing site, dialog and sheet headers in the app.
- **Title** (500, 1rem, line-height 1.4, tracking `-0.01em`): card titles,
  session names, issue headlines.
- **Body Large** (300, 1.25rem, line-height 1.6): hero subtitles only. Light
  weight + roomy leading. Cap line length at 65–75ch.
- **Body** (400, 0.875rem, line-height 1.5): default paragraph text and form
  labels. Cap at 65–75ch.
- **Label** (500, 0.75rem, line-height 1.3): captions, vote counts, badge
  text, button-internal text at xs/sm sizes.
- **Mono** (400, 0.875rem, line-height 1.4, with `font-variant-numeric:
  tabular-nums`): countdown timers (`{seconds}s`), result averages, anywhere
  digits need to align under animation. Never used for body copy.

### Named Rules

**The Tracking-Tighter Rule.** Display and headline type always use negative
letter-spacing (≥`-0.02em` for headline, ≥`-0.04em` for display). Default
tracking on large type is the SaaS reflex; correct it. Body copy uses
tracking-normal. Never tighten body.

**The Two-Tone Headline Rule.** Display headlines split into two tones: the
load-bearing phrase in foreground ink, the predicate or qualifier in
`text-gray-300 dark:text-zinc-700`. ("Planning poker, **without the
noise**.") This is the only acceptable typographic flourish at hero scale.
No gradient text, no italics, no underlines, no decorative pulls.

**The Mono-For-Numerals Rule.** Any digit that changes (countdowns,
averages, vote counts in motion) uses Geist Mono with `tabular-nums`. Stops
the layout from twitching as numbers tick.

## 4. Elevation: Flat With Intent

The system is flat at rest. Cards sit on the page rather than above it;
surfaces use tonal layering (Surface 1 → 2 → 3) to convey depth instead of
cast shadows. The exception is interaction: shadows appear when a surface is
acted on (hovered, selected, primary-pressed). The signature treatment is
the **selected voting card**, which lifts 12px and casts a colored shadow
tinted with Blueprint Blue (`shadow-blue-500/30`). That is the only place a
colored shadow is permitted in the system.

### Shadow Vocabulary
- **shadow-sm** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): default state
  of small CTAs in the session node ("Reveal Votes", "New Round"). Almost
  imperceptible at rest.
- **shadow-md** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px
  rgb(0 0 0 / 0.1)`): voting cards and player cards at rest.
- **shadow-lg** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px
  -4px rgb(0 0 0 / 0.1)`): hover state on interactive cards. Session node
  default. Primary CTA hover state.
- **shadow-2xl** (`box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)`): hero
  demo iframe frame on the marketing site only. Forbidden in the room.
- **shadow-blueprint** (`box-shadow: 0 10px 15px -3px oklch(0.55 0.22 250 /
  0.3), 0 4px 6px -4px oklch(0.55 0.22 250 / 0.3)`): the colored shadow on
  selected voting cards. Singular use.

Cards prefer `ring-1 ring-foreground/10` (a 1px hairline at 10% opacity)
instead of a solid border token. Even subtler than a pencil rule.

### Named Rules

**The Lift, Don't Bounce Rule.** State changes translate vertically and
resolve to a stable position with `ease-out` (200–300ms). Selected voting
card: `-translate-y-3` (12px). Hovered voting card: `-translate-y-1` (4px).
Pressed: `scale-95` for ~200ms. Never use spring physics, never rotate,
never `animate-bounce` on interactive elements. The card behaves like a real
card on a real desk: deliberately picked up, not flicked.

**The Colored-Shadow-Once Rule.** Blueprint Blue is the only hue allowed in
a shadow, and only on the selected voting card. Status colors never tint
shadows. Black shadows everywhere else.

**The Ring-Over-Border Rule.** Component edges prefer `ring-1
ring-foreground/10` to a colored border. Solid `border-2` is reserved for
elements that are *literally* edges (the stroke around a voting card, the
chassis of the session node). Don't use a thick colored border to imply
emphasis. Use background fill, lift, or selection state instead.

## 5. Components

### Buttons

The button is the primary tool of the desk.

- **Shape:** `rounded-lg` (8px) at default size. Smaller sizes step down to a
  clamped `rounded-[min(var(--radius-md),10px)]`. Hero CTAs on the marketing
  site step *up* to `rounded-2xl` (16px). Softer because they invite rather
  than transact.
- **Default (Primary):** `bg-primary text-primary-foreground` (Pencil Gray on
  Paper, inverted in dark). Height 32px (`h-8`), padding `px-2.5`, gap
  `1.5`. Default tracking, weight 500.
- **Outline:** `bg-background` with a 1px `border-input` border. Hover swaps
  to `bg-muted`. Used for secondary actions and dialog dismissals.
- **Ghost:** No background or border at rest. Hover adds `bg-muted`. For
  tertiary actions, navigation back-arrows, icon-only triggers.
- **Destructive:** `bg-destructive/10 text-destructive`. Tinted background,
  never solid red. Used only for actions that delete or remove.
- **Sizes:** xs (24px), sm (28px), default (32px), lg (36px), plus icon
  variants. The hero CTA is the explicit exception: 64px tall, padding
  `px-12`, weight 700, tracking-tight.
- **Focus:** `ring-[3px] ring-ring/50` with a `focus-visible:border-ring`.
  The ring is the only focus indicator. No thicker outline, no offset glow.

### Cards (Surface Containers)

- **Corner Style:** `rounded-xl` (12px).
- **Background:** `bg-card` (Paper / Surface 1).
- **Edge:** `ring-1 ring-foreground/10`. No solid border by default.
- **Internal Padding:** `py-4 px-4` at default size, `py-3 px-3` at
  `size="sm"`. Card footer offsets to `bg-muted/50` with `border-t`. The
  only place a horizontal divider is acceptable inside a card.
- **Shadow:** none at rest. Tonal layering (Surface 1 vs 2 vs 3) does the
  work.

### Voting Card (Signature Component)

The single most important component in the system. It carries the product
metaphor.

- **Dimensions:** 96px tall × 64px wide (`h-24 w-16`). Vertical card, true to
  physical poker proportions.
- **Shape:** `rounded-xl` (12px).
- **Edge:** `border-2`. A real, visible 2px stroke. This is one of two
  places where solid 2px borders are correct in the system.
- **Default surface:** Paper (light) / Surface 1 (dark). Border
  `border-gray-300` / `border-border`. Numeral in foreground ink, weight
  700, `text-2xl`.
- **Hover (selectable):** card lifts 4px (`-translate-y-1`). Border darkens
  to `border-gray-400 dark:border-gray-500`. Shadow steps from `shadow-md`
  to `shadow-lg`. A faint blue glow fades in from the bottom
  (`bg-linear-to-t from-blue-500/10 to-transparent`).
- **Selected:** card lifts 12px (`-translate-y-3`). Surface fills with
  Blueprint Blue (`bg-blue-500 dark:bg-blue-600`). Numeral inverts to white.
  Shadow becomes `shadow-lg shadow-blue-500/30`, the system's only colored
  shadow. A diagonal shimmer animates across the surface every 2 seconds
  (`@keyframes shimmer`).
- **Pressed:** `scale-95` for ~200ms during click resolution.
- **Disabled:** `opacity-50`, `cursor-not-allowed`, `shadow-sm`.

### Player Node (Signature Component)

Shares the voting-card chassis (96 × 64, `rounded-xl`, `border-2`). The room
reads as a deck. Below the card sit avatar and name in a `text-sm
font-medium` row, with optional Crown (owner, `amber-500`) or Star
(facilitator, `blue-500`) icons at 14px. The card face shows an emoji until
reveal (`👀` spectator, `🤔` thinking, `✅` voted-hidden, `😴` didn't-vote),
then the numeric value. Selection ring uses `ring-2 ring-blue-500
ring-offset-2`.

### Session Node (Signature Component)

The session node is the conductor of the room. Width `min-w-[280px]
max-w-[320px]`, `rounded-lg`, `border-2`. Background gradients are
*functionally* assigned: `from-blue-50 to-indigo-50` while voting is active,
`from-green-50 to-emerald-50` once complete. A pulsing 8px dot in the header
(`bg-blue-500 animate-pulse` while active, solid `bg-green-500` when
complete) communicates state.

The single primary CTA at the bottom occupies a 48px touch target (`h-12`)
and changes color and label across three states:
1. **Voting in progress** → `bg-blue-500` "Reveal Votes" with Play icon.
2. **Countdown active** → `bg-amber-500` with `font-mono tabular-nums`
   countdown ("3s · Tap to Cancel"), `animate-pulse`.
3. **Voting complete** → `bg-emerald-500` "New Round" with RotateCcw icon
   (cooldown disables the button for 3 seconds after click).

The session node is the only place gradient backgrounds are permitted in
the system, because the gradient is doing semantic work (active vs.
complete).

### Inputs

- **Style:** `bg-transparent` with `border-input` (or `dark:bg-input/30`).
  `rounded-lg` (8px). Height 32px, padding `px-2.5 py-1`. Body type, default
  tracking.
- **Focus:** `border-ring` swap + `ring-[3px] ring-ring/50`. Same ring
  vocabulary as buttons.
- **Invalid:** `aria-invalid:border-destructive
  aria-invalid:ring-destructive/20`. No icon overlay, no inline message.
  The surrounding form layer handles errors.
- **Disabled:** `bg-input/50` (or `dark:bg-input/80`), `opacity-50`,
  `cursor-not-allowed`.

### Navigation

The marketing-site navbar floats over the hero with no background until
scrolled. Default link state: `text-sm font-medium text-foreground/80`.
Active: `text-foreground`. Hover: `text-foreground` with no background fill.

The room canvas has no traditional navigation. The canvas itself is the
surface. A floating top-bar carries breadcrumb (Home → "Demo" / room name),
zoom controls, presence avatars, and a "Create Your Room" pill. This bar is
the single permitted overlay element in the room; its background uses
`backdrop-blur-md`, the only sanctioned use of backdrop-blur in the system,
and only because it sits over the React Flow canvas.

### Hero Announcement Pill (Marketing Signature)

The version-info pill above the hero headline is a `rounded-full` element
with a primary-colored badge inside (the current release version, e.g.
`v2.7.3`, in `bg-primary text-primary-foreground` at `text-[11px] font-bold
leading-none`), followed by the message and a `chevron-right`. This pattern
(announcement pill with bold version chip) is reserved for marketing
surfaces only. It does not appear in the room.

## 6. Do's and Don'ts

### Do:
- **Do** keep Blueprint Blue at ≤10% surface coverage. Selection, primary
  CTA, progress, facilitator marker. That's the list.
- **Do** prefer tonal layering (Surface 1 → 2 → 3) over shadow for depth.
  Shadows respond to interaction; surfaces describe hierarchy.
- **Do** lift selected voting cards 12px and apply the blue-tinted shadow.
  This is the system's signature gesture; do it confidently.
- **Do** use `tracking-tighter` (≤`-0.02em`) on every headline ≥1.25rem.
  Display type at default tracking is the SaaS reflex.
- **Do** use Geist Mono with `tabular-nums` for any digit in motion
  (countdowns, averages, vote tallies).
- **Do** keep both light and dark themes first-class. Test every new
  component in both before shipping.
- **Do** match-and-refuse against the Don'ts below. When a layout feels
  safe, it's likely the training-data answer; pick the harder, more specific
  direction.

### Don't:
- **Don't** use gradient text. `background-clip: text` combined with a
  gradient background is forbidden. Hierarchy comes from weight, scale, and
  the Two-Tone Headline pattern.
- **Don't** use glassmorphism as a default surface. The single permitted use
  is the canvas-overlay top-bar in the room. Outside that, frosted backdrops
  are decorative noise.
- **Don't** ship the hero-metric template (giant number, small label,
  supporting stats). It is the canonical SaaS cliché and AgileKit explicitly
  rejects it.
- **Don't** ship "Trusted by 10,000 teams" + grayscale logo wall. Anywhere.
  Ever.
- **Don't** ship 3×3 icon-and-heading feature grids. If a feature can't
  justify its own row, cut it.
- **Don't** tint colors with brand hue when they should be semantic. The
  status quartet is for status only; never decorative.
- **Don't** use solid colored borders >1px as decorative emphasis.
  `border-l-4 border-amber-500` callouts are forbidden. Use background tint
  or a leading icon instead.
- **Don't** spring, bounce, rotate, or elastic-ease any state change.
  `ease-out` exponential curves only. The card lifts; it does not jiggle.
- **Don't** ship Atlassian-blue chrome, dense settings panels, or
  "configured by IT" affordances. AgileKit is the deliberate opposite of
  Jira.
- **Don't** drop ads, "Upgrade to Pro" banners, donation prompts, or
  unrelated promo into `/room/*`. The room is sacred.
- **Don't** use em dashes (—) or `--` in UI copy. Use commas, colons,
  semicolons, periods, or parentheses. (This rule applies to user-facing
  strings, not to documentation like this file.)
- **Don't** use exclamation marks in UI copy or toast messages. AgileKit's
  voice is terse and dry, never SaaS-cheerful.
