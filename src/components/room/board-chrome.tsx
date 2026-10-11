"use client";

import Link from "next/link";
import {
  Copy,
  Grid3X3,
  Home,
  Maximize2,
  Menu,
  Minimize2,
  Share2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import {
  useImperativeHandle,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidePanel } from "@/components/ui/side-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWhiteboardView } from "@/components/whiteboard/whiteboard";
import { copyRoomLink } from "@/lib/copy-room-link";
import { cn } from "@/lib/utils";
import { usePanelState } from "./hooks/usePanelState";
import { UserPresenceAvatars } from "./user-presence-avatars";
import type { CeremonyRules } from "@/convex/ceremony";

/**
 * The board's chrome, the same for both ceremonies and the demo (ADR-0026):
 * the bars over a whiteboard, and the panel docked beside it. A board hands
 * it what it shows of the board (its name, its link, what it is called), its
 * panels, its share entries and what goes where the account menu sits; the
 * chrome owns the rest: which panel is open (one at a time; Escape closes
 * it), every control, drawn from one list in both layouts (the phone's menu
 * sheet and the desktop's bars) with one wording and one behaviour each,
 * zoom and fit through the whiteboard's view, fullscreen, copying the link,
 * and docking the open panel, whose content is mounted only while it is
 * open. A node opens a panel through the handle the chrome gives its board
 * (`ref`).
 *
 * It is drawn inside `WhiteboardProviders`: its view controls move that
 * board's React Flow, and its avatars read that room's presence.
 */

/** A board's name for itself: its ceremony's (`rulesOf(room).noun`), or the demo's. */
export type BoardNoun = CeremonyRules["noun"] | "Demo";

/** What the chrome shows of the board. */
export interface ChromeBoard {
  name: string;
  /** The board's address, to copy and share: `/room/…`, or the demo's. */
  link: string;
  /** What the board is called in the chrome's words: "Copy room link", "Retro link copied". */
  noun: BoardNoun;
  /** A word beside the name: the demo says it is one. */
  tag?: string;
}

/** A panel a board docks beside itself. */
export interface ChromePanel {
  id: string;
  /** Its toggle's name, in both layouts. */
  label: string;
  icon: LucideIcon;
  /** The panel, mounted only while it is open; `close` is for its own close button. */
  render: (close: () => void) => ReactNode;
  testId?: string;
}

/** A way to share the board beyond its link (the retro's summary). */
export interface ShareEntry {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

/** What a board can do with its chrome from the board itself: a node's button opening a panel. */
export interface BoardChromeHandle {
  openPanel: (id: string) => void;
}

interface BoardChromeProps {
  board: ChromeBoard;
  panels?: readonly ChromePanel[];
  share?: readonly ShareEntry[];
  /** The account menu, or what the board shows in its place (the demo's way into a room of one's own). */
  account?: ReactNode;
  /** Whether the bars are drawn: the demo embedded on the home page shows only the board and its panels. */
  bars?: boolean;
  ref?: Ref<BoardChromeHandle>;
  /** The whiteboard. */
  children: ReactNode;
}

/** One control, as both layouts draw it. */
interface Control {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** A panel's toggle: whether its panel is open. */
  expanded?: boolean;
}

const NO_PANELS: readonly ChromePanel[] = [];
const NO_SHARE: readonly ShareEntry[] = [];

// Whether the browser can go fullscreen, and whether it is: client-only, so
// read through useSyncExternalStore with a server answer of no, which keeps
// the demo's server render and the hydrating client in agreement. Module
// scope, so the stores aren't re-subscribed on every render.
const subscribeNever = () => () => {};
const canGoFullscreen = () => typeof document !== "undefined" && document.fullscreenEnabled;
const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};
const isFullscreen = () => !!document.fullscreenElement;
const onTheServer = () => false;

function toggleFullscreen(): void {
  const change = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  // The browser may refuse (one without a user gesture does): nothing changes then.
  void change.catch(() => {});
}

const BAR_BUTTON = "h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-surface-3 rounded-md transition-colors";
const BAR =
  "flex items-center gap-2 px-3 h-12 bg-white/95 dark:bg-surface-1/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 dark:border-border";

function BarSeparator() {
  return <Separator orientation="vertical" className="h-6 mx-1 !self-center" aria-hidden="true" />;
}

function Tag({ children }: { children: string }) {
  return (
    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary shrink-0">
      {children}
    </span>
  );
}

/** A control on the desktop's bars: an icon, named by its tooltip. */
function BarButton({ control }: { control: Control }) {
  const { label, icon: Icon, onSelect, expanded } = control;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect()}
            className={cn(BAR_BUTTON, expanded && "bg-gray-100 dark:bg-surface-3")}
            aria-label={label}
            aria-expanded={expanded}
          >
            <Icon className="h-4 w-4" />
          </Button>
        }
      />
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** A control in the phone's menu, a row wide. Choosing it closes the menu when `closeMenu` is given. */
function MenuRow({ control, closeMenu }: { control: Control; closeMenu?: () => void }) {
  const { label, icon: Icon, onSelect, expanded } = control;
  return (
    <Button
      variant="outline"
      onClick={() => {
        closeMenu?.();
        onSelect();
      }}
      className="w-full h-11 justify-start gap-3"
      aria-expanded={expanded}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

interface BarsProps {
  board: ChromeBoard;
  view: Control[];
  fullscreen: Control | null;
  /** Copying the board's link, then whatever else the board shares. */
  share: [Control, ...Control[]];
  panels: Control[];
  account: ReactNode;
}

/** The phone's header and its menu sheet. */
function MobileBar({ board, view, fullscreen, share, panels, account }: BarsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="md:hidden fixed top-2 left-2 right-2 z-50" role="navigation" aria-label="Board" data-testid="mobile-navigation">
      <div className="flex items-center justify-between px-2 py-1.5 bg-white/95 dark:bg-surface-1/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 dark:border-border">
        <Button
          variant="ghost"
          className="h-11 w-11 p-0"
          render={<Link href="/" />}
          nativeButton={false}
          aria-label="Back to home"
        >
          <Home className="h-5 w-5" />
        </Button>

        <div className="flex-1 mx-2 flex items-center justify-center gap-2 min-w-0">
          {board.tag && <Tag>{board.tag}</Tag>}
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate" data-testid="mobile-room-name">
            {board.name}
          </span>
        </div>

        <div data-testid="mobile-user-avatars">
          <UserPresenceAvatars maxVisible={3} size="sm" />
        </div>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" className="h-11 w-11 p-0 ml-1" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent side="right" className="w-[280px] px-4">
            <SheetHeader className="pb-2">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-2">
              {share.map((control) => (
                <MenuRow key={control.label} control={control} closeMenu={closeMenu} />
              ))}

              {/* The view controls keep the menu open, to press again. */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">View controls</span>
                <div className="grid grid-cols-3 gap-2">
                  {view.map(({ label, icon: Icon, onSelect }) => (
                    <Button key={label} variant="outline" onClick={() => onSelect()} className="h-11" aria-label={label}>
                      <Icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              </div>
              {fullscreen && <MenuRow control={fullscreen} />}

              {panels.map((control) => (
                <MenuRow key={control.label} control={control} closeMenu={closeMenu} />
              ))}

              {account && <div className="pt-2 border-t border-gray-200 dark:border-border">{account}</div>}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

/** The desktop's two bars: the board on the left, the controls on the right. */
function DesktopBars({ board, view, fullscreen, share, panels, account }: BarsProps) {
  const [copyLink] = share;
  return (
    <>
      <div className="hidden md:block absolute top-4 left-4 z-50" role="navigation" aria-label="Board" data-testid="canvas-navigation">
        <div className={BAR}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={BAR_BUTTON}
                  render={<Link href="/" />}
                  nativeButton={false}
                  aria-label="Back to home"
                >
                  <Home className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipContent>
              <p>Back to home</p>
            </TooltipContent>
          </Tooltip>

          <BarSeparator />

          <div className="flex items-center gap-2 px-2">
            {board.tag && <Tag>{board.tag}</Tag>}
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{board.name}</span>
            {/* The share menu's first entry, a click away beside the name too. */}
            <BarButton control={copyLink} />
          </div>

          <BarSeparator />

          <div className="flex items-center gap-2 px-2" data-testid="desktop-user-avatars">
            <UserPresenceAvatars maxVisible={4} size="sm" />
          </div>
        </div>
      </div>

      <div className="hidden md:block absolute top-4 right-4 z-50" data-testid="canvas-zoom-controls">
        <div className={BAR}>
          <div className="flex items-center gap-1 px-2">
            {view.map((control) => (
              <BarButton key={control.label} control={control} />
            ))}
          </div>

          <BarSeparator />

          <div className="flex items-center gap-1 px-2">
            {fullscreen && <BarButton control={fullscreen} />}
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="sm" className={BAR_BUTTON} aria-label="Share">
                          <Share2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                  }
                />
                <DropdownMenuContent align="end" className="w-52">
                  {share.map(({ label, icon: Icon, onSelect }) => (
                    <DropdownMenuItem key={label} onClick={() => onSelect()}>
                      <Icon className="h-4 w-4 mr-2" />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent>
                <p>Share</p>
              </TooltipContent>
            </Tooltip>
            {panels.map((control) => (
              <BarButton key={control.label} control={control} />
            ))}
          </div>

          {account && (
            <>
              <BarSeparator />
              {account}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function BoardChrome({
  board,
  panels = NO_PANELS,
  share = NO_SHARE,
  account,
  bars = true,
  ref,
  children,
}: BoardChromeProps): ReactElement {
  const { openId, open, toggle, close } = usePanelState();
  useImperativeHandle(ref, () => ({ openPanel: open }), [open]);
  const view = useWhiteboardView();
  const canFullscreen = useSyncExternalStore(subscribeNever, canGoFullscreen, onTheServer);
  const fullscreenNow = useSyncExternalStore(subscribeFullscreen, isFullscreen, onTheServer);

  // Every control, once; each layout draws them its own way.
  const controls: Omit<BarsProps, "board" | "account"> = {
    view: [
      { label: "Zoom out", icon: ZoomOut, onSelect: view.zoomOut },
      { label: "Zoom in", icon: ZoomIn, onSelect: view.zoomIn },
      { label: "Fit view", icon: Grid3X3, onSelect: view.fit },
    ],
    fullscreen: canFullscreen
      ? {
          label: fullscreenNow ? "Exit fullscreen" : "Enter fullscreen",
          icon: fullscreenNow ? Minimize2 : Maximize2,
          onSelect: toggleFullscreen,
        }
      : null,
    share: [
      {
        label: `Copy ${board.noun.toLowerCase()} link`,
        icon: Copy,
        onSelect: () => void copyRoomLink(board.link, board.noun),
      },
      ...share,
    ],
    panels: panels.map((panel) => ({
      label: panel.label,
      icon: panel.icon,
      expanded: panel.id === openId,
      onSelect: () => toggle(panel.id),
    })),
  };
  const docked = panels.find((panel) => panel.id === openId);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="relative h-full min-w-0 flex-1">
        {bars && (
          <>
            <MobileBar board={board} account={account} {...controls} />
            <DesktopBars board={board} account={account} {...controls} />
          </>
        )}
        {children}
      </div>
      <SidePanel isOpen={!!docked} onClose={close} data-testid={docked?.testId}>
        {docked?.render(close)}
      </SidePanel>
    </div>
  );
}
