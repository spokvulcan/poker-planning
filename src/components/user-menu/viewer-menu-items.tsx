"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import type { SignedInViewer } from "@/components/auth/viewer";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { UserAvatar } from "./user-avatar";

// What both user menus (UserMenu in the app's header, NavUser in the
// dashboard's sidebar) show of the viewer.

/** The name a user menu shows: the users row's, or "Guest" until it names them. */
export function menuName(viewer: SignedInViewer): string {
  return viewer.name || "Guest";
}

/** A user menu's header: the viewer's avatar, name, and email, or "Guest" without one. */
export function MenuProfile({ viewer }: { viewer: SignedInViewer }) {
  const name = menuName(viewer);
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <UserAvatar name={name} avatarUrl={viewer.avatarUrl} size="lg" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{viewer.email || "Guest"}</span>
      </div>
    </div>
  );
}

/** Sign in, shown first, for anyone without a permanent account. */
export function MenuSignIn({ viewer, href }: { viewer: SignedInViewer; href: string }) {
  if (viewer.isPermanent) return null;
  return (
    <>
      <DropdownMenuItem render={<Link href={href} />}>
        <LogIn className="mr-2 size-4" />
        Sign in
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}
