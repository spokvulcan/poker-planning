import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { tintClasses } from "./tints";
import type { Zone } from "./zones";

export type PromptZoneNode = Node<Zone, "zone">;

/**
 * A prompt's soft zone (ADR-0011): a tinted area with the prompt's label,
 * drawn behind the cards. It is a suggestion of where a card goes, never a
 * container — the stored prompt is the one chosen in the composer, and a
 * card dropped elsewhere keeps it.
 */
export const PromptZoneNodeView = memo(function PromptZoneNodeView({
  data,
}: NodeProps<PromptZoneNode>) {
  const tint = tintClasses(data.color);
  return (
    <div
      data-zone-prompt={data.promptId}
      className={cn("rounded-2xl border border-dashed p-4", tint.zone)}
      style={{ width: data.width, height: data.height }}
    >
      <span className={cn("text-lg font-semibold", tint.label)}>{data.label}</span>
    </div>
  );
});
