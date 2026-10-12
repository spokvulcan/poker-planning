"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandDialog } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { COMMAND_MENU } from "./copy";

const OpenCommandMenu = createContext<(() => void) | null>(null);

/** Opens the command menu; null outside the app shell (the demo, the 404). */
export function useOpenCommandMenu(): (() => void) | null {
  return use(OpenCommandMenu);
}

/**
 * The command menu, for every page in the app shell: ⌘K (Ctrl+K off Apple)
 * opens and closes it from anywhere, typing included, and any trigger in the
 * page opens it through `useOpenCommandMenu`.
 */
export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key?.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openMenu = useCallback(() => setOpen(true), []);

  return (
    <OpenCommandMenu value={openMenu}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={COMMAND_MENU.title}
        description={COMMAND_MENU.description}
        className="top-[12vh] gap-0 rounded-2xl! bg-white/95 shadow-2xl backdrop-blur-xl sm:max-w-xl dark:bg-zinc-950/95"
      >
        <CommandPalette surface="dialog" onDone={() => setOpen(false)} />
      </CommandDialog>
    </OpenCommandMenu>
  );
}

const noSubscribe = () => () => {};
const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** "⌘K" on Apple devices, "Ctrl K" elsewhere; "⌘K" on the server. */
export function useShortcutLabel(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => (isApple() ? "⌘K" : "Ctrl K"),
    () => "⌘K"
  );
}

/** The menu's own key, as the triggers show it. */
export function CommandMenuShortcut({ className }: { className?: string }) {
  return <Kbd className={cn("font-mono", className)}>{useShortcutLabel()}</Kbd>;
}

/** The navbar's way in: a search field on wide screens, an icon below. */
export function CommandMenuButton() {
  const openMenu = useOpenCommandMenu();
  if (!openMenu) return null;

  return (
    <>
      <Button
        variant="outline"
        onClick={openMenu}
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden w-48 justify-between rounded-full pr-1.5 pl-3 font-normal text-muted-foreground lg:inline-flex"
      >
        <span className="flex items-center gap-2">
          <Search className="size-4" />
          {COMMAND_MENU.trigger}
        </span>
        <CommandMenuShortcut className="rounded-full px-2" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={openMenu}
        aria-label={COMMAND_MENU.trigger}
        aria-keyshortcuts="Meta+K Control+K"
        className="rounded-full lg:hidden"
      >
        <Search />
      </Button>
    </>
  );
}
