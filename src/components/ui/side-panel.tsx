"use client";

import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  side?: "left" | "right";
  "data-testid"?: string;
}

export function SidePanel({ isOpen, onClose, children, className, side = "right", "data-testid": dataTestId }: SidePanelProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          data-testid={dataTestId}
          side={side}
          className={cn(
            "w-[100vw] sm:w-[420px] sm:max-w-md p-0 gap-0 bg-white! dark:bg-surface-1! flex flex-col",
            side === "right" ? "border-l" : "border-r",
            "border-gray-200/50 dark:border-border",
            className
          )} 
          showCloseButton={false} 
          overlayClassName="bg-black/20 dark:bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        >
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop docked panel
  return (
    <div
      data-testid={dataTestId}
      className={cn(
        "hidden md:flex flex-col border-gray-200/50 dark:border-border bg-white dark:bg-surface-1 overflow-hidden h-full z-40 relative shrink-0",
        "transition-[width] duration-300 ease-in-out",
        isOpen ? "w-[380px] lg:w-[420px]" : "w-0",
        isOpen && side === "right" ? "border-l" : "",
        isOpen && side === "left" ? "border-r" : "",
        !isOpen ? "border-none" : ""
      )}
      inert={!isOpen}
    >
      <div
        className={cn(
          "w-[380px] lg:w-[420px] h-full flex flex-col min-w-0 bg-white dark:bg-surface-1",
          "transition-[opacity,transform] duration-300 ease-in-out",
          isOpen
            ? "opacity-100 translate-x-0 delay-75"
            : side === "right"
              ? "opacity-0 translate-x-4"
              : "opacity-0 -translate-x-4",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}