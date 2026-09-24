import type { RetroColumn, RetroStep } from "@/convex/retroTemplates";
import type { ActionItemView, StickyView } from "@/convex/model/retro";

export interface RetroSummaryInput {
  name: string;
  createdAt: number;
  step: RetroStep;
  columns: readonly RetroColumn[];
  stickies: readonly StickyView[];
  /** The discussion order: topic ids, most votes first. */
  topics: readonly string[];
  actionItems: readonly ActionItemView[];
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stickyLine(sticky: StickyView): string {
  const text = oneLine(sticky.text ?? "");
  const gif = sticky.gif ? `![${oneLine(sticky.gif.title ?? "GIF")}](${sticky.gif.url})` : "";
  return [text, gif].filter(Boolean).join(" ") || "(empty)";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function stickiesLabel(n: number): string {
  return n === 1 ? "1 sticky" : `${n} stickies`;
}

/**
 * The retro as Markdown, ready to paste into Slack, Confluence or a ticket:
 * the action items first (the part people act on), then the topics in the
 * order they were discussed, then every sticky by column. Built from what
 * the viewer can see, so a face-down sticky never leaks into it and authors
 * appear only as action item owners.
 */
export function buildRetroSummary(input: RetroSummaryInput): string {
  const created = new Date(input.createdAt);
  const date = `${created.getDate()} ${MONTHS[created.getMonth()]} ${created.getFullYear()}`;
  const visible = input.stickies.filter((s) => !s.hidden);
  const byId = new Map(visible.map((s) => [s._id as string, s]));
  const members = (rootId: string) => visible.filter((s) => s.stackId === rootId);

  const lines: string[] = [`# ${input.name}`, "", `_${date} · ${stickiesLabel(visible.length)}_`, ""];

  lines.push("## Action items", "");
  if (input.actionItems.length === 0) {
    lines.push("_None yet._", "");
  } else {
    for (const item of input.actionItems) {
      const owner = item.ownerName ? ` (@${item.ownerName})` : "";
      lines.push(`- [${item.done ? "x" : " "}] ${oneLine(item.text)}${owner}`);
    }
    lines.push("");
  }

  const discussed = input.step === "discuss" || input.step === "done";
  const topics = input.topics.map((id) => byId.get(id)).filter((s): s is StickyView => !!s);
  if (discussed && topics.length > 0) {
    lines.push("## Top topics", "");
    topics.forEach((topic, i) => {
      const votes = topic.votes ?? 0;
      lines.push(`${i + 1}. ${stickyLine(topic)}${votes > 0 ? ` (${plural(votes, "vote")})` : ""}`);
      for (const member of members(topic._id)) lines.push(`   - ${stickyLine(member)}`);
    });
    lines.push("");
  }

  for (const column of input.columns) {
    const roots = visible.filter((s) => s.columnId === column.id && s.stackId === undefined);
    const stacked = visible.filter((s) => s.columnId === column.id && s.stackId !== undefined);
    lines.push(`## ${column.emoji} ${column.title}`, "");
    if (roots.length === 0 && stacked.length === 0) {
      lines.push("_Nothing here._", "");
      continue;
    }
    for (const sticky of [...roots, ...stacked].sort((a, b) => a.createdAt - b.createdAt)) {
      lines.push(`- ${stickyLine(sticky)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
