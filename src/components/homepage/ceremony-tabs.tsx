"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** The two ceremonies a homepage section can be tabbed by (ADR-0014). */
export type Ceremony = "poker" | "retro";

const ORDER: Ceremony[] = ["poker", "retro"];

export const tabTestId = (prefix: string, ceremony: Ceremony) => `${prefix}-tab-${ceremony}`;

interface CeremonyTabsProps {
  /** Controlled value; leave unset for an uncontrolled switch that starts on poker. */
  value?: Ceremony;
  onValueChange?: (ceremony: Ceremony) => void;
  className?: string;
  children: ReactNode;
}

/** One tabbed section: the shadcn/Base UI Tabs root, which owns the roles and the arrow keys. */
export function CeremonyTabs({ value, onValueChange, className, children }: CeremonyTabsProps) {
  return (
    <Tabs
      value={value}
      defaultValue={value === undefined ? "poker" : undefined}
      onValueChange={(next) => onValueChange?.(next as Ceremony)}
      className={cn("block", className)}
    >
      {children}
    </Tabs>
  );
}

interface CeremonyTabListProps {
  /** Prefix for the triggers' test ids, e.g. `how-it-works`. */
  prefix: string;
  labels: Record<Ceremony, string>;
  className?: string;
}

/** The two triggers as a pill switch. */
export function CeremonyTabList({ prefix, labels, className }: CeremonyTabListProps) {
  return (
    <TabsList
      aria-label={`${labels.poker} or ${labels.retro}`}
      className={cn("rounded-full p-1", className)}
    >
      {ORDER.map((ceremony) => (
        <TabsTrigger
          key={ceremony}
          value={ceremony}
          data-testid={tabTestId(prefix, ceremony)}
          className="rounded-full px-5 font-bold tracking-tight"
        >
          {labels[ceremony]}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

/** The panel a trigger controls; unmounted while inactive, so its animations stop. */
export function CeremonyTabPanel({
  value,
  className,
  children,
}: {
  value: Ceremony;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TabsContent value={value} className={cn("text-base animate-in fade-in duration-300", className)}>
      {children}
    </TabsContent>
  );
}
