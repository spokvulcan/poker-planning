/**
 * useLiveText: a field over shared text keeps what's typed until it has
 * landed, takes in other people's edits otherwise, and keeps the caret next
 * to its text when it does.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { rebaseIndex, useLiveText, type LiveTextOptions } from "./use-live-text";

function Field(props: LiveTextOptions & { onResult?: (landed: boolean) => void }) {
  const text = useLiveText<HTMLInputElement>(props);
  return (
    <>
      <input aria-label="field" ref={text.ref} value={text.value} onChange={(e) => text.setValue(e.target.value)} />
      <button onClick={() => void text.commit().then((landed) => props.onResult?.(landed))}>commit</button>
      <button onClick={text.revert}>revert</button>
      <output aria-label="state">{`${text.dirty ? "dirty" : "clean"} ${text.unsaved ? "unsaved" : "saved"}`}</output>
    </>
  );
}

/** Saves that land only when the test says so. */
function heldSaves() {
  const saves: { value: string; land: () => Promise<void>; fail: () => Promise<void> }[] = [];
  const save = (value: string) =>
    new Promise<void>((resolve, reject) => {
      saves.push({
        value,
        land: () => act(async () => resolve()),
        fail: () => act(async () => reject(new Error("refused"))),
      });
    });
  return { saves, save };
}

function renderField(options: LiveTextOptions & { onResult?: (landed: boolean) => void }) {
  const view = render(<Field {...options} />);
  const input = screen.getByLabelText("field") as HTMLInputElement;
  return {
    input,
    serverHas: (value: string) => view.rerender(<Field {...options} value={value} />),
    type: (value: string) => {
      input.focus();
      fireEvent.change(input, { target: { value } });
    },
    commit: () => act(async () => fireEvent.click(screen.getByText("commit"))),
    revert: () => act(() => fireEvent.click(screen.getByText("revert"))),
    state: () => screen.getByLabelText("state").textContent,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a field saved on commit (a name)", () => {
  it("keeps what's typed over someone else's rename, until the commit lands", async () => {
    const { saves, save } = heldSaves();
    const field = renderField({ value: "Sprint 41", save });

    field.type("Sprint 42");
    field.serverHas("Planning");
    expect(field.input.value).toBe("Sprint 42");
    expect(field.state()).toBe("dirty unsaved");

    await field.commit();
    expect(saves.map((s) => s.value)).toEqual(["Sprint 42"]);
    field.serverHas("Sprint 42");
    await saves[0].land();
    expect(field.state()).toBe("clean saved");

    field.serverHas("Sprint 43");
    expect(field.input.value).toBe("Sprint 43");
  });

  it("takes in someone else's rename while nothing is typed", () => {
    const field = renderField({ value: "Sprint 41" });

    field.serverHas("Planning");

    expect(field.input.value).toBe("Planning");
    expect(field.state()).toBe("clean saved");
  });

  it("keeps what's typed when the save is refused, and says so", async () => {
    const { saves, save } = heldSaves();
    const results: boolean[] = [];
    const field = renderField({ value: "Sprint 41", save, onResult: (landed) => results.push(landed) });

    field.type("Sprint 42");
    await field.commit();
    await saves[0].fail();

    expect(results).toEqual([false]);
    expect(field.input.value).toBe("Sprint 42");
    expect(field.state()).toBe("dirty unsaved");
  });

  it("saves nothing when what's typed is no change, by the field's own measure", async () => {
    const { saves, save } = heldSaves();
    const field = renderField({ value: "Sprint 41", save, normalize: (v) => v.trim() });

    field.type("Sprint 41  ");
    await field.commit();

    expect(saves).toEqual([]);
    expect(field.state()).toBe("clean saved");
  });

  it("drops what's typed on revert and shows the server's value", async () => {
    const field = renderField({ value: "Sprint 41" });

    field.type("Sprint 4");
    field.serverHas("Planning");
    await field.revert();

    expect(field.input.value).toBe("Planning");
    expect(field.state()).toBe("clean saved");
  });
});

describe("a field saved as it's typed (a note)", () => {
  it("saves once typing stops, and not before", () => {
    const { saves, save } = heldSaves();
    const field = renderField({ value: "", save, autosaveMs: 500 });

    field.type("a");
    field.type("ab");
    act(() => vi.advanceTimersByTime(499));
    expect(saves).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(saves.map((s) => s.value)).toEqual(["ab"]);
  });

  it("does not let the echo of an earlier save undo what was typed since", async () => {
    const { saves, save } = heldSaves();
    const field = renderField({ value: "", save, autosaveMs: 500 });

    field.type("a");
    act(() => vi.advanceTimersByTime(500));
    field.type("ab");
    field.serverHas("a");
    await saves[0].land();

    expect(field.input.value).toBe("ab");
    expect(field.state()).toBe("dirty unsaved");
  });

  it("keeps what's typed when saving writes nowhere, as in the demo", () => {
    const field = renderField({ value: "", save: () => undefined, autosaveMs: 500 });

    field.type("note to self");
    act(() => vi.advanceTimersByTime(500));

    expect(field.input.value).toBe("note to self");
  });

  it("saves what's still queued when the field goes away", () => {
    const save = vi.fn();
    const view = render(<Field value="" save={save} autosaveMs={500} />);
    fireEvent.change(screen.getByLabelText("field"), { target: { value: "last words" } });

    view.unmount();

    expect(save).toHaveBeenCalledWith("last words");
  });
});

describe("the caret", () => {
  it("stays next to the text it was next to when someone else's edit lands", () => {
    const field = renderField({ value: "hello world" });
    field.input.focus();
    field.input.setSelectionRange(5, 5);

    field.serverHas("Oh, hello world");

    expect(field.input.value).toBe("Oh, hello world");
    expect([field.input.selectionStart, field.input.selectionEnd]).toEqual([9, 9]);
  });
});

describe("rebaseIndex", () => {
  it("keeps an index ahead of the edit, and one past it at its distance from the end", () => {
    expect(rebaseIndex("hello world", "hello big world", 3)).toBe(3);
    expect(rebaseIndex("hello world", "hello big world", 8)).toBe(12);
    expect(rebaseIndex("hello world", "Oh, hello world", 5)).toBe(9);
  });
});
