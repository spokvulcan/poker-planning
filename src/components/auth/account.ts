/**
 * What a viewer is offered of their account, and where it leads, wherever it
 * is offered: the account menus (ViewerMenu, in the header and the
 * dashboard's sidebar), the command menu, the navbar and the dashboard's
 * sidebar all draw from here, so a person sees the same places by the same
 * names, Sign in on the same terms, and comes back to the same page. Pure:
 * the viewer and the page they're on in, the entries out. Its words are under
 * lib/claims-register.test.ts.
 */
import { History, LayoutDashboard, MessagesSquare, Settings, type LucideIcon } from "lucide-react";
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

/** Each place's icon, the same wherever it is offered. */
export const PLACE_ICONS: Record<Place["id"], LucideIcon> = {
  dashboard: LayoutDashboard,
  sessions: History,
  retros: MessagesSquare,
  settings: Settings,
};

/** A place by its id. */
export function place(id: Place["id"]): Place {
  return PLACES.find((p) => p.id === id)!;
}

const SIGN_IN = "/auth/signin";
const THIS_SITE = "https://agilekit.invalid";

/**
 * Where the sign-in page sends someone back to: `from` when it is a page on
 * this site, else the home page. A path that resolves to another site is not
 * one: `//host`, and `/\host`, which browsers read the same way, so a link to
 * the sign-in page can't be made to send a person elsewhere once they're in.
 * The path comes back as the browser reads it, and is kept only if it still
 * names a page here when read again: dot segments can collapse `/..//host`
 * (or `/%2e%2e//host`) into `//host`, another site's address.
 */
export function returnPath(from: string | null | undefined): string {
  if (!from?.startsWith("/")) return "/";
  try {
    const url = new URL(from, THIS_SITE);
    const path = `${url.pathname}${url.search}${url.hash}`;
    const staysHere = url.origin === THIS_SITE && !path.startsWith("//") && new URL(path, THIS_SITE).origin === THIS_SITE;
    return staysHere ? path : "/";
  } catch {
    return "/";
  }
}

/** The sign-in page, sending the person back to the page at `path` once they're in. */
export function signInHref(path: string): string {
  const back = returnPath(path);
  return back === "/" || back.startsWith(SIGN_IN) ? SIGN_IN : `${SIGN_IN}?from=${encodeURIComponent(back)}`;
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
