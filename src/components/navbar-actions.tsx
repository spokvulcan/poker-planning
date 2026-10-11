"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { accountEntries } from "@/components/auth/account";
import { UserMenu } from "@/components/user-menu/user-menu";
import { Button } from "@/components/ui/button";

export function NavbarActions() {
  const { viewer } = useAuth();
  const pathname = usePathname();

  // The server already knows the viewer, so the first paint draws the menu or
  // Sign in, the same in the browser as on the server
  const { signIn } = accountEntries(viewer, pathname);
  if (viewer.status !== "visitor" || !signIn) {
    return <UserMenu />;
  }

  return (
    <Button
      className="hidden rounded-full sm:inline-flex"
      render={<Link href={signIn} />}
      nativeButton={false}
    >
      Sign in
    </Button>
  );
}
