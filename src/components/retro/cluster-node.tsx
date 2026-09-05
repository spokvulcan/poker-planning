"use client";

import { memo, useState } from "react";
import { useStore, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ResolvedDecision } from "@/convex/permissions";
import { MAX_CLUSTER_NAME } from "@/convex/model/retroClusters";
import {
  DISSOLVE_GROUP,
  GROUP_MENU,
  GROUP_NAME_LABEL,
  MERGE_GROUP,
  MERGE_GROUP_BUTTON,
  MERGE_GROUP_INTO_LABEL,
  MERGE_GROUP_TITLE,
  RENAME_GROUP,
  RENAME_GROUP_SAVE,
  TIDY_GROUP,
  cardsCount,
} from "@/convex/retroCopy";
import type { Id } from "@/convex/_generated/dataModel";
import type { ClusterChip } from "./clusters";
import { zoomLevelOf } from "./zoom";

/** The `cardManagement` acts on one cluster, as the board wires them. */
export type ClusterId = Id<"retroClusters">;

export interface ClusterChipActions {
  rename: (clusterId: ClusterId, name: string) => Promise<boolean>;
  merge: (from: ClusterId, into: ClusterId) => Promise<boolean>;
  dissolve: (clusterId: ClusterId) => Promise<boolean>;
  /** Tidy: the board computes the positions and issues the one move batch. */
  tidy: (clusterId: ClusterId) => void;
}

/** A merge target: another cluster on the board. */
export interface ClusterTarget {
  clusterId: ClusterId;
  name: string;
}

// A type alias: React Flow node data must satisfy Record<string, unknown>.
export type ClusterNodeData = {
  chip: ClusterChip<ClusterId>;
  /** The other clusters on the board, as merge targets. */
  others: readonly ClusterTarget[];
  /** The `cardManagement` decision; absent for a Team reader, who gets the label alone. */
  decision?: ResolvedDecision;
  actions?: ClusterChipActions;
};

export type ClusterNode = Node<ClusterNodeData, "cluster">;

const selectZoom = (state: { transform: [number, number, number] }) => state.transform[2];

/**
 * A cluster's label chip (spec §10.3, ADR-0011): the name and member count,
 * centred on the members' centroid at render time. The chip is the one
 * place a cluster is acted on: rename, merge, tidy and dissolve sit in its
 * menu under `cardManagement`, disabled with the decision's copy otherwise.
 * It never moves its members; tidy is the explicit opt-in. At the shape
 * level the chip is held at constant screen size and becomes the board's
 * content (spec §10.2).
 */
export const ClusterNodeView = memo(function ClusterNodeView({ data }: NodeProps<ClusterNode>) {
  const { chip, others, decision, actions } = data;
  const zoom = useStore(selectZoom);
  const level = zoomLevelOf(zoom);
  const [renaming, setRenaming] = useState(false);
  const [merging, setMerging] = useState(false);
  const managed = decision !== undefined && actions !== undefined;
  const allowed = managed && decision.allowed;
  const scale = level === "shape" ? 1 / zoom : 1;
  return (
    <div
      data-cluster-chip={chip.clusterId}
      data-count={chip.count}
      data-level={level}
      style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
    >
      <div
        className={cn(
          // React Flow drops pointer events on a node that is neither selectable
          // nor draggable; the chip itself takes them back.
          "nodrag nopan pointer-events-auto flex items-center gap-1 rounded-full border bg-white/95 py-1 pr-1 pl-3 text-xs font-semibold shadow-md",
          "dark:bg-surface-2/95"
        )}
      >
        <span data-testid="cluster-name" className="max-w-48 truncate">
          {chip.name}
        </span>
        <span className="text-muted-foreground font-normal">{cardsCount(chip.count)}</span>
        {managed && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={GROUP_MENU}
                  disabled={!allowed}
                  title={allowed ? undefined : decision.message}
                />
              }
            >
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setRenaming(true)}>{RENAME_GROUP}</DropdownMenuItem>
              <DropdownMenuItem disabled={others.length === 0} onClick={() => setMerging(true)}>
                {MERGE_GROUP}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.tidy(chip.clusterId)}>{TIDY_GROUP}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => void actions.dissolve(chip.clusterId)}>
                {DISSOLVE_GROUP}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {managed && renaming && (
        <RenameDialog
          name={chip.name}
          onClose={() => setRenaming(false)}
          onSave={(name) => actions.rename(chip.clusterId, name)}
        />
      )}
      {managed && merging && (
        <MergeDialog
          others={others}
          onClose={() => setMerging(false)}
          onMerge={(into) => actions.merge(chip.clusterId, into)}
        />
      )}
    </div>
  );
});

function RenameDialog({
  name,
  onClose,
  onSave,
}: {
  name: string;
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    const ok = await onSave(draft.trim());
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent data-testid="rename-cluster" className="nodrag nowheel">
        <DialogHeader>
          <DialogTitle>{RENAME_GROUP}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="cluster-name">{GROUP_NAME_LABEL}</Label>
            <Input
              id="cluster-name"
              value={draft}
              maxLength={MAX_CLUSTER_NAME}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!draft.trim() || saving}>
              {RENAME_GROUP_SAVE}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  others,
  onClose,
  onMerge,
}: {
  others: readonly ClusterTarget[];
  onClose: () => void;
  onMerge: (into: ClusterId) => Promise<boolean>;
}) {
  const [into, setInto] = useState<ClusterId | "">(others[0]?.clusterId ?? "");
  const [merging, setMerging] = useState(false);
  const merge = async () => {
    if (!into || merging) return;
    setMerging(true);
    const ok = await onMerge(into);
    setMerging(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !merging && onClose()}>
      <DialogContent data-testid="merge-cluster" className="nodrag nowheel">
        <DialogHeader>
          <DialogTitle>{MERGE_GROUP_TITLE}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void merge();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="merge-into">{MERGE_GROUP_INTO_LABEL}</Label>
            <select
              id="merge-into"
              value={into}
              onChange={(e) => setInto(e.target.value as ClusterId)}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
            >
              {others.map((other) => (
                <option key={other.clusterId} value={other.clusterId}>
                  {other.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!into || merging}>
              {MERGE_GROUP_BUTTON}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
