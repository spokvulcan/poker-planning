/**
 * Retro settings (ADR-0021, spec §6.4): under retroSettings — rename, join
 * policy (teamMembers only on a team retro), cards-due date, prompt edits
 * at any stage, stage-list edits except collect, discuss and the current
 * entry. Each edit is one mutation; a server refusal surfaces as its copy;
 * a participant sees every control disabled with the denial copy.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown }[],
  fail: {} as Record<string, string>,
  toasts: [] as { kind: "success" | "error"; message: string }[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: unknown) => {
      const fn = getFunctionName(ref as never);
      return async (args: unknown) => {
        mocks.calls.push({ fn, args });
        if (mocks.fail[fn]) throw new Error(mocks.fail[fn]);
      };
    },
  };
});
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (message: string) => mocks.toasts.push({ kind: "success", message }),
    error: (message: string) => mocks.toasts.push({ kind: "error", message }),
  },
}));
vi.mock("@/components/ui/dialog", () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogContent: pass,
    DialogHeader: pass,
    DialogFooter: pass,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

import { RetroSettingsDialog } from "./retro-settings-dialog";
import { RESOLVED_ALLOWED } from "@/convex/permissions";
import type { Doc } from "@/convex/_generated/dataModel";

const roomId = "room-1" as never;
const retro = {
  _id: "retro-1",
  roomId,
  attribution: "named",
  format: {
    name: "Went well, Do differently, Ideas",
    prompts: [
      { id: "went-well", label: "What went well?", hint: "Keep it.", color: "green", order: 0 },
      { id: "ideas", label: "Ideas", color: "blue", order: 1 },
    ],
  },
  stages: [
    { id: "s1", kind: "collect", cardsVisible: "hidden", tallyVisible: "visible" },
    { id: "s2", kind: "group", cardsVisible: "visible", tallyVisible: "visible" },
    { id: "s3", kind: "vote", cardsVisible: "visible", tallyVisible: "hidden", voteBudget: 5 },
    { id: "s4", kind: "discuss", cardsVisible: "visible", tallyVisible: "visible" },
    { id: "s5", kind: "close", cardsVisible: "visible", tallyVisible: "visible" },
  ],
  currentStageId: "s5",
  currentStageEnteredAt: 0,
} as unknown as Doc<"retros">;
const denied = { allowed: false as const, message: "Only facilitators and the owner can do this" };
const calledWith = (fn: string) => mocks.calls.filter((c) => c.fn === fn).map((c) => c.args);

function renderDialog(over: Partial<Parameters<typeof RetroSettingsDialog>[0]> = {}) {
  render(
    <RetroSettingsDialog
      open
      onOpenChange={vi.fn()}
      roomId={roomId}
      name="Sprint 12"
      joinPolicy="anyone"
      hasTeam={false}
      retro={retro}
      decision={RESOLVED_ALLOWED}
      {...over}
    />
  );
  return within(screen.getByRole("dialog"));
}

beforeEach(() => {
  mocks.calls = [];
  mocks.fail = {};
  mocks.toasts = [];
});
afterEach(cleanup);

describe("RetroSettingsDialog — the retro", () => {
  it("renames on blur, edits the join policy and the cards-due date", async () => {
    const d = renderDialog();
    const name = d.getByLabelText("Retro name") as HTMLInputElement;
    expect(name.value).toBe("Sprint 12");
    fireEvent.change(name, { target: { value: "Sprint 13" } });
    fireEvent.blur(name);
    await waitFor(() => expect(calledWith("retro:rename")).toEqual([{ roomId, name: "Sprint 13" }]));

    const policy = d.getByLabelText("Who can join") as HTMLSelectElement;
    expect(Array.from(policy.options).map((o) => o.value)).toEqual(["anyone", "permanentAccounts"]);
    fireEvent.change(policy, { target: { value: "permanentAccounts" } });
    await waitFor(() =>
      expect(calledWith("retro:setJoinPolicy")).toEqual([{ roomId, joinPolicy: "permanentAccounts" }])
    );

    fireEvent.change(d.getByLabelText("Cards due"), { target: { value: "2026-09-10" } });
    await waitFor(() => expect(calledWith("retro:setCollectUntil")).toHaveLength(1));
    const due = (calledWith("retro:setCollectUntil")[0] as { collectUntil: number }).collectUntil;
    expect(new Date(due).toISOString().slice(0, 10)).toBe("2026-09-10");
    fireEvent.change(d.getByLabelText("Cards due"), { target: { value: "" } });
    await waitFor(() => expect(calledWith("retro:setCollectUntil")[1]).toEqual({ roomId }));
  });

  it("offers team members only on a team retro", () => {
    const d = renderDialog({ hasTeam: true, joinPolicy: "teamMembers" });
    const policy = d.getByLabelText("Who can join") as HTMLSelectElement;
    expect(Array.from(policy.options).map((o) => o.value)).toEqual(["anyone", "permanentAccounts", "teamMembers"]);
    expect(policy.value).toBe("teamMembers");
  });
});

describe("RetroSettingsDialog — prompts and stages", () => {
  it("edits a prompt's label and hint as two mutations, offers no tint; adds and removes prompts", async () => {
    const d = renderDialog();
    const labels = d.getAllByLabelText("Prompt label") as HTMLInputElement[];
    fireEvent.change(labels[0], { target: { value: "What worked?" } });
    fireEvent.blur(labels[0]);
    const hints = d.getAllByLabelText("Hint") as HTMLInputElement[];
    fireEvent.change(hints[1], { target: { value: "Half-formed is fine." } });
    fireEvent.blur(hints[1]);
    // The tint is a create-form choice (spec §6.1), not a running retro's.
    expect(d.queryAllByLabelText("Tint")).toHaveLength(0);
    await waitFor(() =>
      expect(calledWith("retro:updatePrompt")).toEqual([
        { roomId, promptId: "went-well", label: "What worked?" },
        { roomId, promptId: "ideas", hint: "Half-formed is fine." },
      ])
    );

    fireEvent.click(d.getByRole("button", { name: "Add prompt" }));
    await waitFor(() => expect(calledWith("retro:addPrompt")).toHaveLength(1));
    expect(calledWith("retro:addPrompt")[0]).toMatchObject({ roomId, label: "New prompt" });

    mocks.fail["retro:removePrompt"] = "Cards still answer this prompt";
    fireEvent.click(d.getByRole("button", { name: "Remove Ideas" }));
    await waitFor(() => expect(calledWith("retro:removePrompt")).toEqual([{ roomId, promptId: "ideas" }]));
    await waitFor(() =>
      expect(mocks.toasts.at(-1)).toEqual({ kind: "error", message: "Cards still answer this prompt" })
    );
  });

  it("locks collect, discuss and the current entry; removes and reorders the rest; adds an entry", async () => {
    const d = renderDialog();
    const rows = d.getAllByTestId("stage-row");
    expect(rows[4].getAttribute("data-current")).toBe("true");
    expect((d.getByRole("button", { name: "Remove Collect" }) as HTMLButtonElement).disabled).toBe(true);
    expect((d.getByRole("button", { name: "Remove Discuss" }) as HTMLButtonElement).disabled).toBe(true);
    expect((d.getByRole("button", { name: "Remove Close" }) as HTMLButtonElement).disabled).toBe(true);
    // A move that would shift the current entry's index is disabled; a free
    // entry may pass discuss, and collect may not pass discuss.
    expect((d.getByRole("button", { name: "Move Close up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((d.getByRole("button", { name: "Move Discuss down" }) as HTMLButtonElement).disabled).toBe(true);
    expect((d.getByRole("button", { name: "Move Vote down" }) as HTMLButtonElement).disabled).toBe(false);
    expect((d.getByRole("button", { name: "Move Collect down" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(d.getByRole("button", { name: "Remove Group" }));
    await waitFor(() => expect(calledWith("retro:removeStage")).toEqual([{ roomId, stageId: "s2" }]));

    fireEvent.click(d.getByRole("button", { name: "Move Vote up" }));
    await waitFor(() =>
      expect(calledWith("retro:reorderStages")).toEqual([{ roomId, stageIds: ["s1", "s3", "s2", "s4", "s5"] }])
    );

    fireEvent.change(d.getByLabelText("Add stage"), { target: { value: "review" } });
    fireEvent.click(d.getByRole("button", { name: "Add stage" }));
    await waitFor(() => expect(calledWith("retro:addStage")).toEqual([{ roomId, kind: "review" }]));
  });

  it("a participant sees every control disabled with the denial copy and writes nothing", async () => {
    const d = renderDialog({ decision: denied });
    const name = d.getByLabelText("Retro name") as HTMLInputElement;
    expect(name.readOnly).toBe(true);
    expect(name.title).toBe(denied.message);
    expect((d.getByLabelText("Who can join") as HTMLSelectElement).disabled).toBe(true);
    // Denied buttons read the denial as their accessible name (permissionProps).
    expect(d.queryByRole("button", { name: "Add prompt" })).toBeNull();
    expect(d.queryByRole("button", { name: "Remove Close" })).toBeNull();
    const deniedButtons = d.getAllByRole("button", { name: denied.message }) as HTMLButtonElement[];
    expect(deniedButtons.length).toBeGreaterThanOrEqual(2);
    expect(deniedButtons.every((b) => b.disabled)).toBe(true);
    fireEvent.change(name, { target: { value: "x" } });
    fireEvent.blur(name);
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.calls).toEqual([]);
  });
});
