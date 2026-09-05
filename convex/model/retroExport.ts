import { QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  MAX_BOARD_ROWS,
  board,
  policyOf,
  projectCard,
  requireRetro,
  type BoardRead,
  type ProjectedCard,
  type ProjectionPolicy,
  type Reader,
} from "./retro";
import { MAX_ACTION_ROWS, projectActions, type ActionRead } from "./retroActions";
import { MAX_VOTE_ROWS, countDots, tally, tallyEntryOf } from "./retroVotes";
import { currentStageOf, type StageEntry } from "./retroFormats";
import { liveTopics, projectWalk, topicId, type TopicRef } from "./walk";
import {
  ACTION_STATUS_LABELS,
  ACTIONS_TITLE,
  COVERED_LABEL,
  EXPORT_CREATED,
  EXPORT_DISCUSSION,
  EXPORT_FORMAT,
  EXPORT_NEW,
  EXPORT_NO_TEAM,
  EXPORT_NOT_COVERED,
  EXPORT_OUTSIDE,
  EXPORT_STAGES_WALKED,
  EXPORT_TEAM,
  EXPORT_TOPICS,
  FORMER_MEMBER,
  HIDDEN_CARD_EXPORT,
  STAGE_LABELS,
  UNOWNED_ACTION,
  dueOn,
  noteLine,
  ownedBy,
  votesCount,
} from "../retroCopy";

/**
 * Export (spec §15.3, §15.4; ADR-0019): a projection of read access and
 * never more. One retro as Markdown, for the people who were not there;
 * the JSON history is assembled by `teams.exportHistory` from the board
 * read itself. Everything here runs through `projectCard` with the
 * requester as reader (own cards in full in a named retro, silhouettes for
 * the rest while the entry hides cards), the attribution projection (no
 * author in an anonymous retro) and never names a voter: dots are counts,
 * and only while the board shows its tally.
 */

export interface MarkdownExport {
  filename: string;
  content: string;
}

/** A file name the browser will take: the room's name with path and shell characters replaced. */
export function exportFilename(name: string, extension: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${safe || "retro"}.${extension}`;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const isFullCard = (card: ProjectedCard): card is ProjectedCard & { text: string; authorId?: Id<"users"> } =>
  "text" in card;

/** A card's line: its text and, in a named retro, its author; a silhouette has neither (ADR-0015). */
function cardLine(card: ProjectedCard, names: Map<Id<"users">, string>): string {
  if (!isFullCard(card)) return `- ${HIDDEN_CARD_EXPORT}`;
  const author = card.authorId !== undefined ? ` — ${names.get(card.authorId) ?? FORMER_MEMBER}` : "";
  return `- ${card.text}${author}`;
}

/** A topic's title: a cluster's name, a lone card's text through the projection. */
function topicTitle(
  ref: TopicRef,
  clusters: Map<Id<"retroClusters">, Doc<"retroClusters">>,
  projected: Map<Id<"retroCards">, ProjectedCard>
): string {
  if (ref.kind === "cluster") return clusters.get(ref.id)?.name ?? "";
  const card = projected.get(ref.id);
  return card && isFullCard(card) ? card.text : HIDDEN_CARD_EXPORT;
}

/** The stages the shared pointer has passed, in list order up to and including the current entry. */
export function stagesWalked(stages: readonly StageEntry[], currentStageId: string): string[] {
  const index = stages.findIndex((stage) => stage.id === currentStageId);
  return stages.slice(0, index + 1).map((stage) => STAGE_LABELS[stage.kind]);
}

const STATUS_MARK: Record<Doc<"retroActions">["status"], string> = { open: "[ ]", done: "[x]", dropped: "[-]" };

function actionLine(action: Doc<"retroActions">, names: Map<Id<"users">, string>): string {
  const parts = [
    action.ownerId !== undefined ? ownedBy(names.get(action.ownerId) ?? FORMER_MEMBER) : UNOWNED_ACTION,
    ...(action.dueAt !== undefined ? [dueOn(isoDate(action.dueAt))] : []),
    ACTION_STATUS_LABELS[action.status],
    ...(action.note ? [noteLine(action.note)] : []),
  ];
  return `- ${STATUS_MARK[action.status]} ${action.text} — ${parts.join(" · ")}`;
}

/**
 * The dots the export counts (spec §15.3): the entry the board's tally
 * reads (`tallyEntryOf`), through the tally's own `countDots`, and only
 * while the current entry shows its tally, so a hidden vote round exports
 * no counts. Null when the retro has had no vote round to count.
 */
async function dotCounts(
  ctx: QueryCtx,
  retro: Doc<"retros">,
  cards: readonly Doc<"retroCards">[]
): Promise<Record<string, number> | null> {
  if (currentStageOf(retro).tallyVisible !== "visible") return null;
  const entry = tallyEntryOf(retro);
  if (entry.voteBudget === undefined) return null;
  const rows = await ctx.db
    .query("retroVotes")
    .withIndex("by_room_entry", (q) => q.eq("roomId", retro.roomId).eq("stageEntryId", entry.id))
    .take(MAX_VOTE_ROWS);
  return countDots(rows, cards);
}

/** The display names of the referenced people, one read each; a missing row renders by the register. */
async function namesOf(ctx: QueryCtx, ids: Iterable<Id<"users">>): Promise<Map<Id<"users">, string>> {
  const names = new Map<Id<"users">, string>();
  for (const id of new Set(ids)) {
    const user = await ctx.db.get(id);
    if (user) names.set(id, user.name);
  }
  return names;
}

const byCreation = <T extends { createdAt: number }>(a: T, b: T) => a.createdAt - b.createdAt;

/**
 * `retro.exportMarkdown` (spec §15.3): the retro's facts, then each topic
 * with its cards under their prompts and its dot count — the walk as
 * covered / not covered over the order, then topics outside it, or every
 * topic in creation order when no walk exists — then the action items.
 * The guard (`requireRoomReader`) has passed; `readerId` is who reads.
 */
export async function exportMarkdown(
  ctx: QueryCtx,
  room: Doc<"rooms">,
  readerId: Id<"users">
): Promise<MarkdownExport> {
  const retro = await requireRetro(ctx, room._id);
  const policy: ProjectionPolicy = policyOf(retro);
  const reader: Reader = { userId: readerId };
  const [cards, clusterRows, actions, team] = await Promise.all([
    ctx.db
      .query("retroCards")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .take(MAX_BOARD_ROWS),
    ctx.db
      .query("retroClusters")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .take(MAX_BOARD_ROWS),
    ctx.db
      .query("retroActions")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .take(MAX_ACTION_ROWS),
    room.teamId ? ctx.db.get(room.teamId) : Promise.resolve(null),
  ]);
  const counts = await dotCounts(ctx, retro, cards);
  const projected = new Map(cards.map((card) => [card._id, projectCard(policy, reader, card)]));
  const names = await namesOf(ctx, [
    ...[...projected.values()].flatMap((card) => (isFullCard(card) && card.authorId !== undefined ? [card.authorId] : [])),
    ...actions.flatMap((action) => (action.ownerId !== undefined ? [action.ownerId] : [])),
  ]);
  const clusters = new Map(clusterRows.map((cluster) => [cluster._id, cluster]));
  const sortedCards = [...cards].sort(byCreation);
  const cardsOf = (ref: TopicRef) =>
    ref.kind === "cluster"
      ? sortedCards.filter((card) => card.clusterId === ref.id)
      : sortedCards.filter((card) => card._id === ref.id);

  const topicSection = (ref: TopicRef, tags: string[]): string[] => {
    const votes = counts ? [votesCount(counts[topicId(ref)] ?? 0)] : [];
    const lines = [`### ${[topicTitle(ref, clusters, projected), ...tags, ...votes].join(" · ")}`, ""];
    for (const prompt of retro.format.prompts) {
      const answers = cardsOf(ref).filter((card) => card.promptId === prompt.id);
      if (answers.length === 0) continue;
      lines.push(`**${prompt.label}**`, "", ...answers.map((card) => cardLine(projected.get(card._id)!, names)), "");
    }
    return lines;
  };

  const lines: string[] = [
    `# ${room.name}`,
    "",
    team ? `- ${EXPORT_TEAM}: ${team.name}` : `- ${EXPORT_NO_TEAM}`,
    `- ${EXPORT_CREATED}: ${isoDate(room.createdAt)}`,
    `- ${EXPORT_FORMAT}: ${retro.format.name}`,
    `- ${EXPORT_STAGES_WALKED}: ${stagesWalked(retro.stages, retro.currentStageId).join(", ")}`,
    "",
  ];

  if (retro.walk) {
    const walk = projectWalk(retro.walk, cards, clusterRows);
    lines.push(`## ${EXPORT_DISCUSSION}`, "");
    for (const entry of walk.entries) {
      lines.push(...topicSection(entry.ref, [(entry.covered ? COVERED_LABEL : EXPORT_NOT_COVERED).toLowerCase()]));
    }
    if (walk.outside.length > 0) {
      lines.push(`## ${EXPORT_OUTSIDE}`, "");
      for (const topic of walk.outside) {
        lines.push(...topicSection(topic.ref, topic.late ? [EXPORT_NEW.toLowerCase()] : []));
      }
    }
  } else {
    lines.push(`## ${EXPORT_TOPICS}`, "");
    for (const topic of liveTopics(cards, clusterRows).sort(byCreation)) {
      lines.push(...topicSection(topic.ref, []));
    }
  }

  lines.push(`## ${ACTIONS_TITLE}`, "");
  for (const action of [...actions].sort(byCreation)) {
    lines.push(actionLine(action, names));
  }
  if (actions.length > 0) lines.push("");

  return { filename: exportFilename(room.name, "md"), content: lines.join("\n") };
}

// --- The JSON history (spec §15.4) ---

/** One retro of the JSON history: the board read for that reader, the tally's counts and the names the ids point at. */
export interface RetroExport {
  roomId: Id<"rooms">;
  name: string;
  createdAt: number;
  board: BoardRead;
  /** The tally as the board shows it: counts, never a voter (spec §9). */
  tally: { stageEntryId: string; visible: boolean; counts: Record<string, number> };
  /** Display names for the ids the board carries; a deleted account is absent and renders by the register. */
  people: Record<Id<"users">, string>;
}

/**
 * `retro.exportBoard` (spec §15.4): the same shape `retro.board` returns
 * for that reader, with the tally's counts and the names beside it. The
 * board read is the identity-free one (spec §9): the reader's own hidden
 * text travels in `retro.mine` on the board and in the Markdown export,
 * not here, so the file is what the board shows the Team. The guard
 * (`requireRoomReader`) has passed.
 */
export async function exportBoard(ctx: QueryCtx, room: Doc<"rooms">, readerId: Id<"users">): Promise<RetroExport> {
  const [read, counts] = await Promise.all([board(ctx, room._id), tally(ctx, { roomId: room._id, viewerId: readerId })]);
  const names = await namesOf(ctx, [
    ...read.cards.flatMap((card) => (isFullCard(card) && card.authorId !== undefined ? [card.authorId] : [])),
    ...read.writers,
  ]);
  return {
    roomId: room._id,
    name: room.name,
    createdAt: room.createdAt,
    board: read,
    tally: { stageEntryId: counts.stageEntryId, visible: counts.visible, counts: counts.counts },
    people: Object.fromEntries(names) as Record<Id<"users">, string>,
  };
}

/** An action item in the history file: the projected read without the reader's rights. */
export type ExportedAction = Omit<ActionRead, "rights">;

/**
 * `teams.exportActions` (spec §15.4): every action item across the Team's
 * retros, every status, oldest first, through the one action projection
 * (names by reference, sources through the room's card projection).
 */
export async function exportActions(ctx: QueryCtx, viewer: Doc<"users">, teamId: Id<"teams">): Promise<ExportedAction[]> {
  const statuses: Doc<"retroActions">["status"][] = ["open", "done", "dropped"];
  const rows = (
    await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("retroActions")
          .withIndex("by_team_status", (q) => q.eq("teamId", teamId).eq("status", status))
          .take(MAX_ACTION_ROWS)
      )
    )
  )
    .flat()
    .sort(byCreation);
  const { items } = await projectActions(ctx, viewer, rows);
  return items.map(({ rights: _rights, ...item }) => item);
}

/** One page of a Team's rooms for the history export, in creation order, with the Team's name. */
export interface ExportRoomsPage {
  team: { name: string };
  page: Id<"rooms">[];
  isDone: boolean;
  continueCursor: string;
}

/** The whole file as the action assembles it. */
export interface HistoryExport {
  team: { name: string; exportedAt: string };
  retros: RetroExport[];
  actions: ExportedAction[];
}
