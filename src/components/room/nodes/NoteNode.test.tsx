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
import type { NoteNodeData, NoteNodeType } from "../types";
import { NoteNode } from "./NoteNode";

/** A save callback whose saves land only when the test says so. */
function heldSaves() {
  const saves: { content: string; land: () => Promise<void> }[] = [];
  const onUpdateContent = (content: string) =>
    new Promise<void>((resolve) => {
      saves.push({ content, land: () => act(async () => resolve()) });
    });
  return { saves, onUpdateContent };
}

function renderNote(data: Partial<NoteNodeData>) {
  const base: NoteNodeData = {
    issueId: "issue-1" as Id<"issues">,
    issueTitle: "Checkout flow",
    content: "",
    onUpdateContent: () => {},
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
    const { saves, onUpdateContent } = heldSaves();
    const note = renderNote({ content: "Risks:", onUpdateContent });

    note.type("Risks: auth");
    note.serverHas("Risks: from Bob");
    expect(note.textarea.value).toBe("Risks: auth");

    note.debounce();
    expect(saves.map((s) => s.content)).toEqual(["Risks: auth"]);
    note.serverHas("Risks: auth");
    await saves[0].land();
    expect(note.textarea.value).toBe("Risks: auth");
    expect(note.saving()).toBe(false);

    note.serverHas("Risks: auth, perf");
    expect(note.textarea.value).toBe("Risks: auth, perf");
  });

  it("does not let the echo of an earlier save undo what was typed since", async () => {
    const { saves, onUpdateContent } = heldSaves();
    const note = renderNote({ content: "", onUpdateContent });

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
    const { saves, onUpdateContent } = heldSaves();
    const note = renderNote({ content: "", onUpdateContent });

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
    const note = renderNote({ content: "", onUpdateContent: () => {} });

    note.type("note to self");
    note.debounce();

    expect(note.textarea.value).toBe("note to self");
  });
});
