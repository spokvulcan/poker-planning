"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// next-themes keeps the choice in localStorage, so `theme` is undefined on the
// server and set from the browser's first render. Marking the active button
// only once mounted keeps the hydrating render equal to the server HTML (none
// active); the buttons are the same size either way, so nothing shifts.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/** The Light, Dark and System switch at the foot of a settings panel's top section. */
export function ThemeSection({ description }: { description?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const activeTheme = mounted ? theme : undefined;
  return (
    <div className="mt-4 border-t border-gray-100 pt-5 dark:border-border/50">
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</Label>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        <div className="flex gap-1.5 rounded-lg border border-gray-200/50 bg-gray-100/80 p-1 dark:border-border/50 dark:bg-surface-2">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <Tooltip key={value}>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTheme(value)}
                    aria-pressed={activeTheme === value}
                    className={cn(
                      "h-8 flex-1 gap-2 rounded-md px-3 text-xs font-medium transition-all",
                      activeTheme === value
                        ? "border border-gray-200/50 bg-white text-gray-900 shadow-sm dark:border-transparent dark:bg-surface-3 dark:text-white"
                        : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </Button>
                }
              />
              <TooltipContent>
                <p>{label} theme</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
