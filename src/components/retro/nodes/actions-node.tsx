"use client";

import { memo, useState, type ReactElement } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { CircleCheckBig, Plus, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-menu/user-avatar";
import { permissionProps } from "@/hooks/usePermissions";
import { MAX_ACTION_TEXT_LENGTH } from "@/convex/retroTemplates";
import { ACTIONS_WIDTH } from "@/convex/retroLayout";
import type { ActionItemView } from "@/convex/model/retro";
import type { ActionsNodeData, RetroBoardActions, RetroMember } from "../types";
import { isOptimistic } from "../optimistic";

function ActionRow({
  item,
  members,
  canManage,
  actions,
}: {
  item: ActionItemView;
  members: RetroMember[];
  canManage: boolean;
  actions: RetroBoardActions;
}) {
  const owner = members.find((m) => m._id === item.ownerId);
  // Until the server has it, a new item has nothing to tick or assign.
  const editable = canManage && !isOptimistic(item._id);
  return (
    <li className="group/item flex items-start gap-2.5 py-1.5" data-testid="retro-action-item" data-pending={!editable || undefined}>
      <Checkbox
        checked={item.done}
        onCheckedChange={editable ? (checked) => actions.updateActionItem(item._id, { done: checked === true }) : undefined}
        disabled={!editable}
        aria-label={item.done ? `Reopen: ${item.text}` : `Done: ${item.text}`}
        className="nodrag mt-0.5"
      />
      <span
        className={cn(
          "min-w-0 flex-1 text-sm leading-snug break-words text-gray-800 dark:text-gray-200",
          item.done && "text-gray-400 line-through dark:text-gray-500"
        )}
      >
        {item.text}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!editable}
          render={
            <button
              type="button"
              className={cn(
                "nodrag flex h-6 max-w-24 shrink-0 items-center gap-1 rounded-full px-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-surface-3",
                !item.ownerId && "opacity-60 group-hover/item:opacity-100"
              )}
              aria-label={item.ownerName ? `Owner: ${item.ownerName}. Change owner` : "Assign an owner"}
            >
              {item.ownerName ? (
                <>
                  <UserAvatar name={item.ownerName} avatarUrl={owner?.avatarUrl} size="sm" className="size-5 text-[9px]" />
                  <span className="truncate">{item.ownerName.split(" ")[0]}</span>
                </>
              ) : (
                <UserRound className="size-4" />
              )}
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Owner</DropdownMenuLabel>
            {members.map((member) => (
              <DropdownMenuItem key={member._id} onClick={() => actions.updateActionItem(item._id, { ownerId: member._id })}>
                <UserAvatar name={member.name} avatarUrl={member.avatarUrl} size="sm" className="mr-2 size-5 text-[9px]" />
                <span className="truncate">{member.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {item.ownerId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => actions.updateActionItem(item._id, { ownerId: null })}>
                No owner
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {editable && (
        <button
          type="button"
          onClick={() => actions.deleteActionItem(item._id)}
          className="nodrag mt-0.5 shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          aria-label={`Delete: ${item.text}`}
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * The action items: what the team agreed to do, and who does it. Anyone
 * can add one by default. Open items carry over when the next retro starts.
 */
export const ActionsNode = memo(({ data, selected }: NodeProps<Node<ActionsNodeData, "actions">>): ReactElement => {
  const { items, members, canManage, actions } = data;
  const [draft, setDraft] = useState("");
  const carried = (items ?? []).filter((i) => i.carriedOver);
  const fresh = (items ?? []).filter((i) => !i.carriedOver);
  const open = (items ?? []).filter((i) => !i.done).length;

  const add = () => {
    const text = draft.trim();
    if (!text || !canManage.allowed) return;
    actions.addActionItem(text);
    setDraft("");
  };

  return (
    <div className="relative" style={{ width: ACTIONS_WIDTH }}>
      <Handle type="target" position={Position.Left} id="left" className="bg-gray-400! dark:bg-surface-3!" aria-hidden="true" />
      <Handle type="target" position={Position.Top} id="top" className="bg-gray-400! dark:bg-surface-3!" aria-hidden="true" />
      <div
        className={cn(
          "rounded-lg border-2 border-gray-300 bg-white shadow-lg dark:border-border dark:bg-surface-1",
          selected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-surface-1"
        )}
        role="region"
        aria-label="Action items"
        data-testid="retro-actions"
      >
        <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-border">
          <CircleCheckBig className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Action items</span>
          {items && items.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 tabular-nums dark:bg-surface-2 dark:text-gray-300">
              {open} open
            </span>
          )}
        </div>

        <div className="nowheel max-h-[420px] overflow-y-auto px-3 py-1.5">
          {items === undefined ? (
            <p className="py-3 text-xs text-gray-400">Loading...</p>
          ) : items.length === 0 ? (
            <p className="py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Nothing yet. During the discussion, write down what the team will actually do, and who does it.
            </p>
          ) : (
            <>
              {carried.length > 0 && (
                <>
                  <p className="pt-1.5 text-[11px] font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    From last retro
                  </p>
                  <ul className="divide-y divide-gray-100 dark:divide-border/60">
                    {carried.map((item) => (
                      <ActionRow key={item._id} item={item} members={members} canManage={canManage.allowed} actions={actions} />
                    ))}
                  </ul>
                  {fresh.length > 0 && (
                    <p className="pt-2 text-[11px] font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                      This retro
                    </p>
                  )}
                </>
              )}
              <ul className="divide-y divide-gray-100 dark:divide-border/60">
                {fresh.map((item) => (
                  <ActionRow key={item._id} item={item} members={members} canManage={canManage.allowed} actions={actions} />
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-200 px-3 py-2 dark:border-border">
          <Plus className="size-4 shrink-0 text-gray-400" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            maxLength={MAX_ACTION_TEXT_LENGTH}
            disabled={!canManage.allowed}
            placeholder="Add an action item"
            aria-label="New action item"
            className="nodrag min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed dark:text-gray-200"
            {...permissionProps(canManage)}
          />
        </div>
      </div>
    </div>
  );
});

ActionsNode.displayName = "ActionsNode";
