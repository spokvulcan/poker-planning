import { CommandMenuButton } from "@/components/command-menu/command-menu";
import { Logo } from "@/components/logo";
import { NavMenu } from "@/components/nav-menu";
import { NavigationSheet } from "@/components/navigation-sheet";
import { NavbarActions } from "@/components/navbar-actions";

export function Navbar() {
  return (
    <nav className="fixed inset-x-4 top-6 z-50 mx-auto h-16 max-w-(--breakpoint-xl) rounded-full border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-full items-center gap-3 px-4">
        {/* The menu sits beside the logo, the search and account at the far end.
            Below lg the six links, search and account do not fit: the sheet takes the links. */}
        <div className="flex items-center gap-6">
          <Logo />
          <NavMenu className="hidden lg:block" />
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <CommandMenuButton />
          <NavbarActions />

          {/* Mobile Menu */}
          <div className="lg:hidden">
            <NavigationSheet />
          </div>
        </div>
      </div>
    </nav>
  );
}
