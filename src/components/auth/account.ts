/**
 * What a viewer is offered of their account, and where it leads, wherever it
 * is offered: the account menus (ViewerMenu, in the header and the
 * dashboard's sidebar), the command menu, the navbar and the dashboard's
 * sidebar all draw from here, so a person sees the same places by the same
 * names, Sign in on the same terms, and comes back to the same page. Pure:
 * the viewer and the page they're on in, the entries out. Its words are under
 * lib/claims-register.test.ts.
 */
import type { Viewer } from "./viewer";

/** A place in the app a signed-in person goes to. */
export interface Place {
  id: "dashboard" | "sessions" | "retros" | "settings";
  label: string;
  href: string;
  /** Words the command menu finds it by, beyond its label. */
  keywords: readonly string[];
}

/** The signed-in person's places: their dashboard and its pages, named the same wherever they're offered. */
export const PLACES: readonly Place[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", keywords: ["overview", "stats"] },
  {
    id: "sessions",
    label: "Planning poker",
    href: "/dashboard/sessions",
    keywords: ["poker rooms", "estimates", "history"],
  },
  { id: "retros", label: "Retros", href: "/dashboard/retros", keywords: ["action items"] },
  { id: "settings", label: "Settings", href: "/dashboard/settings", keywords: ["account", "integrations", "jira"] },
];

/** A place by its id. */
export function place(id: Place["id"]): Place {
  return PLACES.find((p) => p.id === id)!;
}

/** The themes a person picks between, wherever they pick one. */
export const THEMES = [
  { id: "light", label: "Light", keywords: ["theme", "light mode"] },
  { id: "dark", label: "Dark", keywords: ["theme", "dark mode"] },
  { id: "system", label: "System", keywords: ["theme", "auto"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const SIGN_IN = "/auth/signin";
const THIS_SITE = "https://agilekit.invalid";

/**
 * Where the sign-in page sends someone back to: `from` when it is a page on
 * this site, else the home page. A path that resolves to another site is not
 * one: `//host`, and `/\host`, which browsers read the same way, so a link to
 * the sign-in page can't be made to send a person elsewhere once they're in.
 */
export function returnPath(from: string | null | undefined): string {
  if (!from?.startsWith("/")) return "/";
  try {
    const url = new URL(from, THIS_SITE);
    return url.origin === THIS_SITE ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

/** The sign-in page, sending the person back to the page at `path` once they're in. */
export function signInHref(path: string): string {
  const back = returnPath(path);
  return back === "/" || back.startsWith(SIGN_IN) ? SIGN_IN : `${SIGN_IN}?from=${encodeURIComponent(back)}`;
}

/** Whether the page at `path` is an account's own: a visitor there is sent to sign in. */
export function needsAccount(path: string): boolean {
  return path === "/dashboard" || path.startsWith("/dashboard/");
}

/** What a viewer on a page is offered of their account. */
export interface AccountEntries {
  /** Sign in, for anyone without a permanent account, coming back to this page; none while the viewer loads. */
  signIn: string | null;
  /** Their places, once they're signed in. */
  places: readonly Place[];
}

/** What `viewer`, on the page at `path`, is offered of their account. */
export function accountEntries(viewer: Viewer, path: string): AccountEntries {
  const signedIn = viewer.status === "signedIn";
  return {
    signIn: viewer.status === "loading" || (signedIn && viewer.isPermanent) ? null : signInHref(path),
    places: signedIn ? PLACES : [],
  };
}
