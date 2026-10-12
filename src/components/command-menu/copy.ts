/**
 * The command menu's words: what it says and the places and actions it
 * offers, in ⌘K and on the 404 page. The palette keys its icons by these ids;
 * the words live here, under `lib/claims-register.test.ts`.
 */
import { START_ESTIMATING, START_RETRO } from "@/lib/site-copy";

/** A place the menu takes you to. `keywords` find it by words it does not show. */
export interface MenuLink {
  id: string;
  label: string;
  href: string;
  hint?: string;
  keywords?: readonly string[];
  /** Kept out of the list until someone searches, so the first look stays short. */
  searchOnly?: boolean;
}

export const COMMAND_MENU = {
  title: "Command menu",
  description: "Search for a page or a blog post, start planning poker or a retro, or switch the theme.",
  placeholder: "Search pages, posts and actions…",
  trigger: "Search",
  noMatch: "Nothing matches",
  keys: { move: "to move", open: "to open", close: "to close", clear: "to clear" },
  groups: {
    start: "Start",
    dashboard: "Dashboard",
    pages: "Pages",
    blog: "Blog",
    account: "Account",
    theme: "Theme",
  },
};

export const START = [
  {
    id: "estimate",
    ...START_ESTIMATING,
    hint: "Planning poker",
    keywords: ["poker", "estimate", "story points", "scrum poker", "new room"],
  },
  { id: "retro", ...START_RETRO, hint: "Retro whiteboard", keywords: ["retrospective", "new retro"] },
  { id: "demo", label: "Try the demo", href: "/demo", hint: "/demo", keywords: ["example", "preview"] },
] as const satisfies readonly MenuLink[];

export const PAGES = [
  { id: "home", label: "Home", href: "/", hint: "/" },
  { id: "features", label: "Features", href: "/features", hint: "/features" },
  { id: "pricing", label: "Pricing", href: "/pricing", hint: "/pricing", keywords: ["free", "cost"] },
  { id: "blog", label: "Blog", href: "/blog", hint: "/blog", keywords: ["articles", "guides"] },
  { id: "changelog", label: "Changelog", href: "/changelog", hint: "/changelog", keywords: ["releases", "what's new"] },
  { id: "about", label: "About", href: "/about", hint: "/about", keywords: ["open source", "github"] },
  { id: "privacy", label: "Privacy Policy", href: "/privacy", hint: "/privacy", searchOnly: true },
  { id: "terms", label: "Terms of Service", href: "/terms", hint: "/terms", searchOnly: true },
  { id: "refund", label: "Refund Policy", href: "/refund-policy", hint: "/refund-policy", searchOnly: true },
] as const satisfies readonly MenuLink[];

/**
 * Sign in, for anyone without a permanent account. Its href is the account
 * entries' (components/auth/account.ts), coming back to the page they are on;
 * the signed-in person's places and the themes are theirs too.
 */
export const SIGN_IN = {
  id: "sign-in",
  label: "Sign in",
  href: "/auth/signin",
  keywords: ["log in", "account"],
  searchOnly: true,
} as const satisfies MenuLink;
