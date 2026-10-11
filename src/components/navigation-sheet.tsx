"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Logo } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { NAVIGATION_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export const NavigationSheet = () => {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <Sheet>
      <SheetTrigger render={<Button className="rounded-full" size="icon" variant="outline" />}><Menu /></SheetTrigger>
      <SheetContent className="flex flex-col px-6 py-6">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <Logo />

        <nav className="mt-8 flex flex-col gap-1">
          {NAVIGATION_ITEMS.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "px-3 py-2.5 text-base font-medium rounded-lg transition-colors",
                isActive(item.href)
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Theme</span>
            <ModeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
