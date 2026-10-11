"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command as CommandPrimitive } from "cmdk";
import {
  BookOpen,
  CornerDownLeft,
  CreditCard,
  FileText,
  History,
  House,
  Info,
  LayoutDashboard,
  LogIn,
  MessagesSquare,
  Monitor,
  Moon,
  Play,
  Receipt,
  Scale,
  ScrollText,
  Search,
  Settings,
  Shield,
  Sparkles,
  StickyNote,
  Sun,
  Vote,
  type LucideIcon,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { useAuth } from "@/components/auth/auth-provider";
import { accountEntries, THEMES, type Place } from "@/components/auth/account";
import { COMMAND_MENU, PAGES, SIGN_IN, START, type MenuLink } from "./copy";
import { rank } from "./rank";
import { useBlogPosts } from "./use-blog-posts";

type CommandId =
  | (typeof START)[number]["id"]
  | Place["id"]
  | (typeof PAGES)[number]["id"]
  | typeof SIGN_IN.id
  | (typeof THEMES)[number]["id"];

const ICONS: Record<CommandId, LucideIcon> = {
  estimate: Vote,
  retro: MessagesSquare,
  demo: Play,
  dashboard: LayoutDashboard,
  sessions: History,
  retros: StickyNote,
  settings: Settings,
  home: House,
  features: Sparkles,
  pricing: CreditCard,
  blog: BookOpen,
  changelog: ScrollText,
  about: Info,
  privacy: Shield,
  terms: Scale,
  refund: Receipt,
  "sign-in": LogIn,
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const noSubscribe = () => () => {};

/**
 * The command menu's body: a search over the site's places and actions.
 * The ⌘K dialog draws it, and so does the 404 page, inline. What it offers
 * of the viewer's account (their places, Sign in) is the account menus'
 * (components/auth/account.ts); the 404, outside the app shell, knows no
 * viewer and offers neither.
 */
export function CommandPalette({
  surface,
  onDone,
}: {
  /** In the ⌘K dialog, or inline on a page (the 404). */
  surface: "dialog" | "page";
  /** Runs once a command has, e.g. to close the dialog. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { viewer } = useAuth();
  const entries = accountEntries(viewer, pathname);
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser: ticking it any earlier
  // would not match the server's HTML.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const posts = useBlogPosts();
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const searching = search.trim() !== "";

  useEffect(() => {
    if (surface !== "page") return;
    // A mouse and keyboard can type straight away; a phone keeps its keyboard
    // down until someone taps the search.
    if (window.matchMedia?.("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [surface]);

  const run = (command: () => void) => {
    command();
    onDone?.();
  };
  const go = (href: string) => run(() => router.push(href));
  const shown = (link: MenuLink) => searching || !link.searchOnly;

  // The dialog closes itself on Escape; on a page, Escape lets go of the search.
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (surface !== "page" || event.key !== "Escape") return;
    setSearch("");
    input.current?.blur();
  };

  return (
    <Command loop filter={rank} onKeyDown={onKeyDown} className="rounded-none! bg-transparent p-0 text-foreground">
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <CommandPrimitive.Input
          ref={input}
          value={search}
          onValueChange={setSearch}
          autoFocus={surface === "dialog"}
          placeholder={COMMAND_MENU.placeholder}
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        {surface === "page" && <Kbd>/</Kbd>}
      </div>

      <CommandList className="max-h-[min(26rem,55dvh)] scroll-py-2 p-2">
        <CommandEmpty className="py-10 text-muted-foreground">
          {COMMAND_MENU.noMatch} “{search.trim()}”.
        </CommandEmpty>

        <CommandGroup heading={COMMAND_MENU.groups.start}>
          {START.map((link) => (
            <LinkItem key={link.id} link={link} onSelect={go} />
          ))}
        </CommandGroup>

        {entries.places.length > 0 && (
          <CommandGroup heading={COMMAND_MENU.groups.dashboard}>
            {entries.places.map((link) => (
              <LinkItem key={link.id} link={link} onSelect={go} />
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading={COMMAND_MENU.groups.pages}>
          {PAGES.filter(shown).map((link) => (
            <LinkItem key={link.id} link={link} onSelect={go} />
          ))}
        </CommandGroup>

        {searching && posts.length > 0 && (
          <CommandGroup heading={COMMAND_MENU.groups.blog}>
            {posts.map((post) => (
              <Item
                key={post.slug}
                icon={FileText}
                label={post.title}
                keywords={post.tags}
                onSelect={() => go(`/blog/${post.slug}`)}
              />
            ))}
          </CommandGroup>
        )}

        {entries.signIn && shown(SIGN_IN) && (
          <CommandGroup heading={COMMAND_MENU.groups.account}>
            <LinkItem link={{ ...SIGN_IN, href: entries.signIn }} onSelect={go} />
          </CommandGroup>
        )}

        <CommandGroup heading={COMMAND_MENU.groups.theme}>
          {THEMES.map((option) => (
            <Item
              key={option.id}
              icon={ICONS[option.id]}
              label={option.label}
              keywords={option.keywords}
              checked={mounted && theme === option.id}
              onSelect={() => run(() => setTheme(option.id))}
            />
          ))}
        </CommandGroup>
      </CommandList>

      <div className="flex items-center justify-between gap-4 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          {COMMAND_MENU.keys.move}
          <Kbd className="ml-2">↵</Kbd>
          {COMMAND_MENU.keys.open}
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Kbd>esc</Kbd>
          {surface === "dialog" ? COMMAND_MENU.keys.close : COMMAND_MENU.keys.clear}
        </span>
      </div>
    </Command>
  );
}

function LinkItem({
  link,
  onSelect,
}: {
  link: MenuLink & { id: CommandId };
  onSelect: (href: string) => void;
}) {
  return (
    <Item
      icon={ICONS[link.id]}
      label={link.label}
      hint={link.hint}
      keywords={link.hint ? [...(link.keywords ?? []), link.hint] : link.keywords}
      onSelect={() => onSelect(link.href)}
    />
  );
}

/**
 * One row. A row with `checked` is a setting and shows a tick when it is the
 * current one; any other row is a place and shows ↵ while it is highlighted.
 */
function Item({
  icon: Icon,
  label,
  hint,
  keywords,
  checked,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  hint?: ReactNode;
  keywords?: readonly string[];
  checked?: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={label}
      keywords={keywords ? [...keywords] : undefined}
      onSelect={onSelect}
      data-checked={checked}
      className="gap-3 rounded-lg! px-3 py-2"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {checked === undefined && (
        <CommandShortcut className="flex items-center gap-2 tracking-normal">
          {hint && <span className="hidden sm:inline">{hint}</span>}
          <CornerDownLeft className="size-4 opacity-0 group-data-selected/command-item:opacity-100" />
        </CommandShortcut>
      )}
    </CommandItem>
  );
}
