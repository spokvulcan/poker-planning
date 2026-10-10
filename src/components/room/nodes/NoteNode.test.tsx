/**
 * NoteNode — what someone is typing is never replaced by the server's copy
 * of the note (issue #272). The textarea takes in the server's text only
 * once nothing typed locally is unsaved, and keeps the caret next to the
 * text it was next to.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { NoteNodeData, NoteNodeType, PokerBoardActions } from "../types";
import { NoteNode } from "./NoteNode";

/** The board's actions; a note's text saves at once and writes nowhere, as in the demo. */
function boardActions(): PokerBoardActions {
  return {
    reveal: vi.fn(),
    reset: vi.fn(),
    toggleAutoComplete: vi.fn(),
    cancelAutoReveal: vi.fn(),
    selectCard: vi.fn(),
    openIssues: vi.fn(),
    updateNoteContent: vi.fn(async () => true),
    deleteNote: vi.fn(),
  };
}

/** The board's actions, with note saves that land only when the test says so. */
function heldSaves() {
  const saves: { nodeId: string; content: string; land: () => Promise<void> }[] = [];
  const actions: PokerBoardActions = {
    ...boardActions(),
    updateNoteContent: (nodeId, content) =>
      new Promise<boolean>((resolve) => {
        saves.push({ nodeId, content, land: () => act(async () => resolve(true)) });
      }),
  };
  return { saves, actions };
}

function renderNote(data: Partial<NoteNodeData>) {
  const base: NoteNodeData = {
    issueId: "issue-1" as Id<"issues">,
    issueTitle: "Checkout flow",
    content: "",
    actions: boardActions(),
    ...data,
  };
  const ui = (next: NoteNodeData) => (
    <ReactFlowProvider>
      <NoteNode {...({ id: "note-1", data: next } as NodeProps<NoteNodeType>)} />
    </ReactFlowProvider>
  );
  const view = render(ui(base));
  const textarea = screen.getByLabelText("Discussion notes") as HTMLTextAreaElement;
  return {
    textarea,
    /** The server's copy of the note changes (anyone's save, ours included). */
    serverHas: (content: string) => view.rerender(ui({ ...base, content })),
    type: (value: string) => {
      textarea.focus();
      fireEvent.change(textarea, { target: { value } });
    },
    debounce: () => act(() => vi.advanceTimersByTime(500)),
    saving: () => screen.queryByText("Saving...") !== null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NoteNode — concurrent edits", () => {
  it("keeps what is being typed when another user's edit arrives, then takes in edits after its own save lands", async () => {
    const { saves, actions } = heldSaves();
    const note = renderNote({ content: "Risks:", actions });

    note.type("Risks: auth");
    note.serverHas("Risks: from Bob");
    expect(note.textarea.value).toBe("Risks: auth");

    note.debounce();
    expect(saves.map((s) => [s.nodeId, s.content])).toEqual([["note-1", "Risks: auth"]]);
    note.serverHas("Risks: auth");
    await saves[0].land();
    expect(note.textarea.value).toBe("Risks: auth");
    expect(note.saving()).toBe(false);

    note.serverHas("Risks: auth, perf");
    expect(note.textarea.value).toBe("Risks: auth, perf");
  });

  it("does not let the echo of an earlier save undo what was typed since", async () => {
    const { saves, actions } = heldSaves();
    const note = renderNote({ content: "", actions });

    note.type("a");
    note.debounce();
    note.type("ab");
    note.serverHas("a");
    await saves[0].land();
    expect(note.textarea.value).toBe("ab");
    expect(note.saving()).toBe(true);

    note.debounce();
    note.serverHas("ab");
    await saves[1].land();
    expect(note.textarea.value).toBe("ab");
    expect(note.saving()).toBe(false);
  });

  it("holds another user's edit until a save still in flight lands, then shows it if it came last", async () => {
    const { saves, actions } = heldSaves();
    const note = renderNote({ content: "", actions });

    note.type("mine");
    note.debounce();
    note.serverHas("mine");
    note.serverHas("theirs");
    expect(note.textarea.value).toBe("mine");

    await saves[0].land();
    expect(note.textarea.value).toBe("theirs");
  });

  it("keeps the caret next to the text it was next to when a remote edit lands", () => {
    const note = renderNote({ content: "hello world" });
    note.textarea.focus();
    note.textarea.setSelectionRange(5, 5);

    note.serverHas("Oh, hello world");
    expect(note.textarea.value).toBe("Oh, hello world");
    expect([note.textarea.selectionStart, note.textarea.selectionEnd]).toEqual([9, 9]);

    note.serverHas("Oh, hello big world");
    expect([note.textarea.selectionStart, note.textarea.selectionEnd]).toEqual([9, 9]);
  });

  it("keeps typed text when saving writes nowhere, as in the demo", () => {
    const note = renderNote({ content: "" });

    note.type("note to self");
    note.debounce();

    expect(note.textarea.value).toBe("note to self");
  });
});

describe("NoteNode — its limit", () => {
  it("stops typing at the discussion note's limit", () => {
    const note = renderNote({ content: "" });

    expect(note.textarea.maxLength).toBe(10000);
  });
});

describe("NoteNode — the board's actions", () => {
  it("asks the board to take it off by its node id", () => {
    const actions = boardActions();
    renderNote({ content: "Risks: auth", actions });

    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

    expect(actions.deleteNote).toHaveBeenCalledWith("note-1");
  });
});
