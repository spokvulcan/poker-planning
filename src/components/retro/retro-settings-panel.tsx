"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  ClipboardCopy,
  Info,
  Minus,
  Monitor,
  Moon,
  Plus,
  Settings,
  ShieldAlert,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { PermissionLevel, RetroPermissionCategory, RetroPermissions } from "@/convex/permissions";
import {
  MAX_COLUMN_TITLE_LENGTH,
  MAX_COLUMNS,
  MAX_VOTES_PER_PERSON,
  MIN_VOTES_PER_PERSON,
  STICKY_COLORS,
  type RetroColumn,
  type StickyColor,
} from "@/convex/retroTemplates";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ParticipantsSection } from "@/components/room/participants-section";
import { permissionInputProps, permissionProps, useRetroPermissions } from "@/hooks/usePermissions";
import { runAct } from "@/lib/run-act";
import { cn } from "@/lib/utils";
import { STICKY_TONES } from "./sticky-colors";

const PERMISSION_CONFIG: Record<RetroPermissionCategory, { label: string; description: string }> = {
  stageFlow: { label: "Run the retro", description: "Reveal, move between steps, walk the topics" },
  cardManagement: { label: "Other people's stickies", description: "Edit or delete stickies someone else wrote" },
  actionManagement: { label: "Action items", description: "Add, assign, tick off and delete" },
  retroSettings: { label: "Retro settings", description: "Name, columns, votes, authors" },
};

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  everyone: "Everyone",
  facilitators: "Facilitators",
  owner: "Owner only",
};

const FAILED = "That didn't save. Try again.";

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-sm font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">{children}</h3>
  );
}

function ColumnRow({
  roomId,
  column,
  count,
  canEdit,
  canRemove,
}: {
  roomId: Id<"rooms">;
  column: RetroColumn;
  count: number;
  canEdit: boolean;
  canRemove: boolean;
}) {
  const updateColumn = useMutation(api.retro.updateColumn);
  const removeColumn = useMutation(api.retro.removeColumn);
  const [title, setTitle] = useState(column.title);
  const [emoji, setEmoji] = useState(column.emoji);
  // Someone else renamed the column: show theirs (adjusting state in render).
  const [seen, setSeen] = useState({ title: column.title, emoji: column.emoji });
  if (seen.title !== column.title || seen.emoji !== column.emoji) {
    setSeen({ title: column.title, emoji: column.emoji });
    setTitle(column.title);
    setEmoji(column.emoji);
  }

  const save = (patch: { title?: string; emoji?: string; color?: StickyColor }) =>
    void runAct(updateColumn({ roomId, columnId: column.id, ...patch }), FAILED);

  return (
    <div className="space-y-2 rounded-lg border border-gray-200/50 bg-white p-3 dark:border-border dark:bg-surface-2/30" data-testid="retro-column-row">
      <div className="flex items-center gap-2">
        <Input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          onBlur={() => emoji.trim() && emoji !== column.emoji && save({ emoji })}
          aria-label={`${column.title} emoji`}
          className="h-9 w-12 px-0 text-center text-lg"
          disabled={!canEdit}
        />
        <Input
          value={title}
          maxLength={MAX_COLUMN_TITLE_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== column.title && save({ title })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={`${column.title} title`}
          className="h-9 flex-1 text-sm"
          disabled={!canEdit}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void runAct(removeColumn({ roomId, columnId: column.id }), FAILED)}
                disabled={!canEdit || !canRemove || count > 0}
                aria-label={`Remove ${column.title}`}
                className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              >
                <Trash2 className="size-4" />
              </Button>
            }
          />
          <TooltipContent>
            <p>{count > 0 ? "Move or delete its stickies first" : canRemove ? "Remove column" : "A retro needs a column"}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-1.5 pl-14" role="radiogroup" aria-label={`${column.title} colour`}>
        {STICKY_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={column.color === color}
            aria-label={color}
            disabled={!canEdit}
            onClick={() => color !== column.color && save({ color })}
            className={cn(
              "size-5 rounded-full transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:hover:scale-100",
              STICKY_TONES[color].swatch,
              column.color === color && "ring-2 ring-gray-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-surface-1"
            )}
          />
        ))}
        <span className="ml-auto text-xs text-gray-500 tabular-nums dark:text-gray-400">
          {count === 1 ? "1 sticky" : `${count} stickies`}
        </span>
      </div>
    </div>
  );
}

interface RetroSettingsPanelProps {
  roomData: RoomWithRelatedData;
  currentUserId: Id<"users">;
  isOpen: boolean;
  onClose: () => void;
  onCopySummary: () => void;
}

/**
 * The retro's settings, docked like the poker room's: name, columns, votes,
 * whether stickies show their author, theme, permissions, the roster, and
 * deleting the retro.
 */
export function RetroSettingsPanel({
  roomData,
  currentUserId,
  isOpen,
  onClose,
  onCopySummary,
}: RetroSettingsPanelProps): ReactElement {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { room } = roomData;
  const retro = room.retro!;
  const perms = useRetroPermissions(roomData, currentUserId);
  const board = useQuery(api.retro.board, isOpen ? { roomId: room._id } : "skip");
  const rename = useMutation(api.retro.rename);
  const updateSettings = useMutation(api.retro.updateSettings);
  const updatePermissions = useMutation(api.retro.updatePermissions);
  const addColumn = useMutation(api.retro.addColumn);
  const removeRetro = useMutation(api.retro.remove);
  const [name, setName] = useState(room.name);
  const [seenName, setSeenName] = useState(room.name);
  if (seenName !== room.name) {
    setSeenName(room.name);
    setName(room.name);
  }
  const [confirmDelete, setConfirmDelete] = useState(false);

  const counts = new Map<string, number>();
  for (const s of board?.stickies ?? []) counts.set(s.columnId, (counts.get(s.columnId) ?? 0) + 1);
  const canSettings = perms.retroSettings.allowed;

  const setVotes = (votesPerPerson: number) =>
    void runAct(updateSettings({ roomId: room._id, votesPerPerson }), FAILED);

  const handlePermissionChange = (category: RetroPermissionCategory, level: PermissionLevel) => {
    const permissions: RetroPermissions = { ...perms.permissions, [category]: level };
    void runAct(updatePermissions({ roomId: room._id, permissions }), FAILED);
  };

  const unusedColor = STICKY_COLORS.find((c) => !retro.columns.some((col) => col.color === c)) ?? "yellow";

  return (
    <>
      <SidePanel isOpen={isOpen} onClose={onClose} data-testid="retro-settings-panel">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200/50 bg-white px-6 dark:border-border dark:bg-surface-1">
          <div className="flex items-center gap-2.5">
            <Settings className="size-5 text-gray-600 dark:text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Retro Settings</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close settings" className="hover:bg-gray-100 dark:hover:bg-surface-3">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50/30 dark:bg-surface-1">
          <div className="shrink-0 space-y-6 border-b border-gray-200/50 bg-white p-6 dark:border-border dark:bg-surface-1">
            {perms.isOwnerAbsent && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-status-warning-bg">
                <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-status-warning-fg" />
                <span className="text-sm text-amber-700 dark:text-status-warning-fg">
                  The owner has left. Owner-level actions are disabled.
                </span>
              </div>
            )}

            {/* Name */}
            <div className="space-y-2.5">
              <Label htmlFor="retro-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Retro name
              </Label>
              <div className="flex gap-2">
                <Input
                  id="retro-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim() && name !== room.name && canSettings) {
                      void runAct(rename({ roomId: room._id, name: name.trim() }), FAILED);
                    }
                  }}
                  className="h-10 bg-gray-50 text-sm dark:bg-surface-2"
                  {...permissionInputProps(perms.retroSettings)}
                />
                <Button
                  className="h-10 px-4"
                  onClick={() => void runAct(rename({ roomId: room._id, name: name.trim() }), FAILED)}
                  disabled={!name.trim() || name === room.name}
                  {...permissionProps(perms.retroSettings)}
                >
                  Save
                </Button>
              </div>
            </div>

            {/* Votes per person */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Votes per person</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">One per topic, spent in the Vote step</p>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-gray-200/50 bg-gray-100/80 p-1 dark:border-border/50 dark:bg-surface-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setVotes(retro.votesPerPerson - 1)}
                  disabled={!canSettings || retro.votesPerPerson <= MIN_VOTES_PER_PERSON}
                  aria-label="Fewer votes"
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-6 text-center font-mono text-sm font-semibold tabular-nums" data-testid="votes-per-person">
                  {retro.votesPerPerson}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setVotes(retro.votesPerPerson + 1)}
                  disabled={!canSettings || retro.votesPerPerson >= MAX_VOTES_PER_PERSON}
                  aria-label="More votes"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Authors */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="show-authors" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Show who wrote each sticky
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Off by default: teammates see what was written, not by whom
                </p>
              </div>
              <Switch
                id="show-authors"
                checked={retro.showAuthors}
                onCheckedChange={canSettings ? (checked) => void runAct(updateSettings({ roomId: room._id, showAuthors: checked }), FAILED) : undefined}
                {...permissionProps(perms.retroSettings)}
              />
            </div>

            {/* Theme */}
            <div className="mt-4 border-t border-gray-100 pt-5 dark:border-border/50">
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</Label>
                <div className="flex gap-1.5 rounded-lg border border-gray-200/50 bg-gray-100/80 p-1 dark:border-border/50 dark:bg-surface-2">
                  {(
                    [
                      { value: "light", label: "Light", icon: Sun },
                      { value: "dark", label: "Dark", icon: Moon },
                      { value: "system", label: "System", icon: Monitor },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      variant="ghost"
                      size="sm"
                      onClick={() => setTheme(value)}
                      className={cn(
                        "h-8 flex-1 gap-2 rounded-md px-3 text-xs font-medium transition-all",
                        theme === value
                          ? "border border-gray-200/50 bg-white text-gray-900 shadow-sm dark:border-transparent dark:bg-surface-3 dark:text-white"
                          : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                      )}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-8 p-6">
            {/* Columns */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle>Columns</SectionTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void runAct(addColumn({ roomId: room._id, title: "New column", emoji: "📌", color: unusedColor }), FAILED)
                  }
                  disabled={!canSettings || retro.columns.length >= MAX_COLUMNS}
                  {...permissionProps(perms.retroSettings)}
                >
                  <Plus className="size-3.5" />
                  Add column
                </Button>
              </div>
              {retro.columns.map((column) => (
                <ColumnRow
                  key={column.id}
                  roomId={room._id}
                  column={column}
                  count={counts.get(column.id) ?? 0}
                  canEdit={canSettings}
                  canRemove={retro.columns.length > 1}
                />
              ))}
            </div>

            {/* Permissions */}
            <Accordion className="space-y-3">
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
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        {perms.changePermissions.allowed
                          ? "As the owner, you decide who can do what in this retro."
                          : "Only the owner can change these permissions."}
                      </span>
                    </div>
                    {(Object.keys(PERMISSION_CONFIG) as RetroPermissionCategory[]).map((category) => (
                      <div key={category} className="flex items-center justify-between gap-4 px-3 py-2">
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {PERMISSION_CONFIG[category].label}
                          </span>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {PERMISSION_CONFIG[category].description}
                          </p>
                        </div>
                        {perms.changePermissions.allowed ? (
                          <Select
                            value={perms.permissions[category]}
                            onValueChange={(value) => handlePermissionChange(category, value as PermissionLevel)}
                          >
                            <SelectTrigger size="sm" className="h-8 w-[130px] bg-white text-xs dark:bg-surface-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="end">
                              <SelectItem value="everyone">Everyone</SelectItem>
                              <SelectItem value="facilitators">Facilitators</SelectItem>
                              <SelectItem value="owner">Owner only</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 dark:bg-surface-3 dark:text-gray-300">
                            {LEVEL_LABELS[perms.permissions[category]]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <ParticipantsSection roomId={room._id} currentUserId={currentUserId} perms={perms} isOpen={isOpen} />

            {/* Keeping it */}
            <div className="space-y-3 border-t border-gray-200/50 pt-6 dark:border-border">
              <SectionTitle>This retro</SectionTitle>
              <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {room.retained
                  ? "Kept for you: this retro stays until its owner deletes it."
                  : "A guest retro is removed after 5 days without activity. Its owner can sign in to keep it."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onCopySummary}>
                  <ClipboardCopy className="size-3.5" />
                  Copy summary
                </Button>
                {perms.isOwner && (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="size-3.5" />
                    Delete retro
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </SidePanel>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this retro?</AlertDialogTitle>
            <AlertDialogDescription>
              Every sticky, vote and action item goes, for everyone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (await runAct(removeRetro({ roomId: room._id }), "Couldn't delete the retro.")) {
                  router.push("/dashboard/retros");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
