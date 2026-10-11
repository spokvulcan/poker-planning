"use client";

import { useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useMutation } from "convex/react";
import { LogIn, LogOut, Monitor, Moon, Sun, UserPen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { SignedInViewer } from "@/components/auth/viewer";
import { useSignOut } from "@/hooks/useSignOut";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "./user-avatar";
import { EditNameDialog } from "./edit-name-dialog";

/** The name a user menu shows: the users row's, or "Guest" until it names them. */
export function menuName(viewer: SignedInViewer): string {
  return viewer.name || "Guest";
}

/**
 * The account menu both user menus open (UserMenu in the app's header,
 * NavUser in the dashboard's sidebar): the viewer's avatar, name and email,
 * Sign in for anyone without a permanent account, Edit name, Appearance and
 * Sign out. Each brings its own trigger and placement, and what only it has:
 * pages to go to, and settings of its own.
 */
export function ViewerMenu({
  viewer,
  trigger,
  signInHref,
  links,
  settings,
  ...placement
}: {
  viewer: SignedInViewer;
  /** The menu's DropdownMenuTrigger. */
  trigger: ReactElement;
  signInHref: string;
  /** Pages to go to, after the profile. */
  links?: ReactNode;
  /** Settings only this menu has, after Edit name. */
  settings?: ReactNode;
} & Pick<ComponentProps<typeof DropdownMenuContent>, "align" | "side" | "sideOffset" | "className">) {
  const { theme, setTheme } = useTheme();
  const [editingName, setEditingName] = useState(false);
  const editGlobalUser = useMutation(api.users.editGlobalUser);
  // The one sign-out policy (anonymous-account deletion included)
  const handleSignOut = useSignOut();
  const name = menuName(viewer);

  const handleEditName = async (newName: string) => {
    try {
      await editGlobalUser({ name: newName });
    } catch {
      toast.error("Failed to update name. Please try again.");
    }
  };

  return (
    <>
      <DropdownMenu>
        {trigger}
        <DropdownMenuContent {...placement}>
          <div className="flex items-center gap-3 px-2 py-2">
            <UserAvatar name={name} avatarUrl={viewer.avatarUrl} size="lg" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{viewer.email || "Guest"}</span>
            </div>
          </div>

          <DropdownMenuSeparator />

          {links && (
            <>
              {links}
              <DropdownMenuSeparator />
            </>
          )}

          {!viewer.isPermanent && (
            <>
              <DropdownMenuItem render={<Link href={signInHref} />}>
                <LogIn className="mr-2 size-4" />
                Sign in
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onClick={() => setEditingName(true)}>
            <UserPen className="mr-2 size-4" />
            Edit name
          </DropdownMenuItem>

          {settings}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="relative mr-2 size-4">
                <Sun className="absolute size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </span>
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuGroup>
                <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value)}>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 size-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 size-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="mr-2 size-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
            <LogOut className="mr-2 size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Outside the menu, so it stays open when the menu closes */}
      <EditNameDialog currentName={name} onSave={handleEditName} open={editingName} onOpenChange={setEditingName} />
    </>
  );
}
