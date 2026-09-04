"use client";

import type { PermissionLevel, RetroPermissionCategory } from "@/convex/permissions";
import type { RetroDefaults } from "@/convex/model/teams";
import { cn } from "@/lib/utils";

export type { RetroDefaults };

interface RetroDefaultsPanelProps {
  value: RetroDefaults;
  /** Admins edit; members read. */
  canEdit: boolean;
  /** Receives the whole bundle, by value, on every change. */
  onChange: (next: RetroDefaults) => Promise<void> | void;
}

type Option<V extends string> = { value: V; label: string };

const ATTRIBUTION_OPTIONS: Option<RetroDefaults["attribution"]>[] = [
  { value: "named", label: "Named" },
  { value: "anonymous", label: "Anonymous" },
];

const JOIN_POLICY_OPTIONS: Option<RetroDefaults["joinPolicy"]>[] = [
  { value: "anyone", label: "Anyone with the link" },
  { value: "permanentAccounts", label: "Signed-in accounts" },
  { value: "teamMembers", label: "Team members" },
];

const LEVEL_OPTIONS: Option<PermissionLevel>[] = [
  { value: "everyone", label: "Everyone" },
  { value: "facilitators", label: "Facilitators" },
  { value: "owner", label: "Owner only" },
];

const PERMISSION_ROWS: { category: RetroPermissionCategory; label: string; description: string }[] = [
  {
    category: "stageFlow",
    label: "Stage flow",
    description: "Advance stages, reveal cards, run the timebox and the discussion",
  },
  {
    category: "cardManagement",
    label: "Card management",
    description: "Edit, move or delete other people's cards; tidy and manage groups",
  },
  {
    category: "actionManagement",
    label: "Action items",
    description: "Edit, reassign or close action items other than your own",
  },
  {
    category: "retroSettings",
    label: "Retro settings",
    description: "Rename the retro, edit prompts, stages and the join policy",
  },
];

function SegmentedControl<V extends string>({
  label,
  options,
  value,
  disabled,
  onSelect,
}: {
  label: string;
  options: Option<V>[];
  value: V;
  disabled: boolean;
  onSelect: (next: V) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-border bg-white p-0.5 dark:bg-surface-2"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => {
              if (!selected) onSelect(option.value);
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              "disabled:cursor-default",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * The retro-defaults panel (spec §5): attribution, join policy and the four
 * retro permission levels. Every change hands the parent the whole bundle by
 * value — the server replaces the stored object, never patches a key, so a
 * retro created a moment later copies exactly what is shown here.
 */
export function RetroDefaultsPanel({ value, canEdit, onChange }: RetroDefaultsPanelProps) {
  const write = (next: RetroDefaults) => {
    void onChange(next);
  };

  return (
    <div className="divide-y divide-border">
      <Row label="Attribution" description="Whether cards carry their author. A retro can be made anonymous later, never named again.">
        <SegmentedControl
          label="Attribution"
          options={ATTRIBUTION_OPTIONS}
          value={value.attribution}
          disabled={!canEdit}
          onSelect={(attribution) => write({ ...value, permissions: { ...value.permissions }, attribution })}
        />
      </Row>
      <Row label="Who can join" description="Who may become an attendee of a new retro. Team members always can.">
        <SegmentedControl
          label="Who can join"
          options={JOIN_POLICY_OPTIONS}
          value={value.joinPolicy}
          disabled={!canEdit}
          onSelect={(joinPolicy) => write({ ...value, permissions: { ...value.permissions }, joinPolicy })}
        />
      </Row>
      {PERMISSION_ROWS.map((row) => (
        <Row key={row.category} label={row.label} description={row.description}>
          <SegmentedControl
            label={row.label}
            options={LEVEL_OPTIONS}
            value={value.permissions[row.category]}
            disabled={!canEdit}
            onSelect={(level) =>
              write({ ...value, permissions: { ...value.permissions, [row.category]: level } })
            }
          />
        </Row>
      ))}
    </div>
  );
}
