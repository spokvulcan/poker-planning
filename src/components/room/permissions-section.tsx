"use client";

import { Info, ShieldAlert } from "lucide-react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PermissionLevel } from "@/convex/permissions";

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  everyone: "Everyone",
  facilitators: "Facilitators",
  owner: "Owner only",
};

const LEVELS = Object.keys(LEVEL_LABELS) as PermissionLevel[];

interface PermissionsSectionProps<C extends string> {
  /** Each category's name and what it covers, in the order they're listed. */
  config: Record<C, { label: string; description: string }>;
  permissions: Record<C, PermissionLevel>;
  /** Whether the viewer may change them (the owner). */
  canChange: boolean;
  /** The note above the list, for the owner and for everyone else. */
  note: { owner: string; others: string };
  onChange: (category: C, level: PermissionLevel) => void;
}

/**
 * The Permissions item of a settings panel's accordion, shared by the poker
 * room and the retro: each category with who may do it, a select for the
 * owner and a plain label for everyone else.
 */
export function PermissionsSection<C extends string>({
  config,
  permissions,
  canChange,
  note,
  onChange,
}: PermissionsSectionProps<C>) {
  return (
    <AccordionItem
      value="permissions"
      className="rounded-lg border border-gray-200/50 bg-white px-4 shadow-sm dark:border-border dark:bg-surface-2/30"
    >
      <AccordionTrigger className="py-3.5 text-sm font-medium text-gray-700 hover:no-underline dark:text-gray-300">
        <div className="flex items-center gap-3">
          <ShieldAlert className="size-4 text-gray-400" />
          Permissions
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-1 pb-4">
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-border/50 dark:bg-surface-3">
            <Info className="size-4 shrink-0 text-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">{canChange ? note.owner : note.others}</span>
          </div>
          <div className="space-y-2">
            {(Object.keys(config) as C[]).map((category) => (
              <div
                key={category}
                className="flex items-center justify-between gap-4 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-gray-100 hover:bg-gray-50 dark:hover:border-border/50 dark:hover:bg-surface-3/50"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{config[category].label}</span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{config[category].description}</p>
                </div>
                <div className="shrink-0">
                  {canChange ? (
                    <Select
                      value={permissions[category]}
                      onValueChange={(value) => onChange(category, value as PermissionLevel)}
                    >
                      <SelectTrigger size="sm" className="h-8 w-[130px] bg-white text-xs dark:bg-surface-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {LEVEL_LABELS[level]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 dark:bg-surface-3 dark:text-gray-300">
                      {LEVEL_LABELS[permissions[category]]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
