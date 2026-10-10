import { CommandMenuButton } from "@/components/command-menu/command-menu";
import { Logo } from "@/components/logo";
import { NavMenu } from "@/components/nav-menu";
import { NavigationSheet } from "@/components/navigation-sheet";
import { NavbarActions } from "@/components/navbar-actions";

export function Navbar() {
  return (
    <nav className="fixed inset-x-4 top-6 z-50 mx-auto h-16 max-w-(--breakpoint-xl) rounded-full border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-full items-center px-4">
        <div className="flex flex-1 justify-start">
          <Logo />
        </div>

        {/* Desktop Menu */}
        <NavMenu className="hidden md:block" />

        <div className="flex flex-1 items-center justify-end gap-3">
          <CommandMenuButton />
          <NavbarActions />

          {/* Mobile Menu */}
          <div className="md:hidden">
            <NavigationSheet />
          </div>
        </div>
      </div>
    </nav>
  );
}
