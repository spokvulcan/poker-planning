/**
 * usePanelState — one panel open at a time, and Escape-to-close (user
 * stories 6, 7, 16, 21).
 *
 * Tests the keyboard and exclusivity rules through the hook's public surface,
 * driving Escape via real DOM events so the input/dialog guards are exercised
 * exactly as they fire in the board's chrome.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePanelState } from "./usePanelState";

function pressEscape(target?: Element) {
  act(() => {
    // A real Escape keydown targets the focused element (document.body when
    // nothing is focused), never the document itself.
    (target ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("usePanelState — one panel at a time", () => {
  it("opening Issues closes Settings, and vice versa", () => {
    const { result } = renderHook(() => usePanelState());

    act(() => result.current.open("settings"));
    expect(result.current.openId).toBe("settings");

    act(() => result.current.open("issues"));
    expect(result.current.openId).toBe("issues");

    act(() => result.current.open("settings"));
    expect(result.current.openId).toBe("settings");
  });

  it("toggling the open panel closes it; toggling another opens that one instead", () => {
    const { result } = renderHook(() => usePanelState());

    act(() => result.current.toggle("issues"));
    expect(result.current.openId).toBe("issues");

    act(() => result.current.toggle("settings"));
    expect(result.current.openId).toBe("settings");

    act(() => result.current.toggle("settings"));
    expect(result.current.openId).toBeNull();
  });

  it("close closes the open panel", () => {
    const { result } = renderHook(() => usePanelState());
    act(() => result.current.open("issues"));
    act(() => result.current.close());
    expect(result.current.openId).toBeNull();
  });
});

describe("usePanelState — Escape", () => {
  it("closes an open panel", () => {
    const { result } = renderHook(() => usePanelState());
    act(() => result.current.open("issues"));

    pressEscape();

    expect(result.current.openId).toBeNull();
  });

  it("is ignored while focus is in an input/textarea/contenteditable", () => {
    const { result } = renderHook(() => usePanelState());
    act(() => result.current.open("settings"));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    pressEscape(input);

    expect(result.current.openId).toBe("settings");
  });

  it("is ignored while a dialog is layered over the panel", () => {
    const { result } = renderHook(() => usePanelState());
    act(() => result.current.open("issues"));

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    document.body.appendChild(dialog);
    pressEscape();

    expect(result.current.openId).toBe("issues");
  });

  it("does not listen while no panel is open (no throw)", () => {
    renderHook(() => usePanelState());
    // No panel open: Escape is a no-op and must not error.
    expect(() => pressEscape()).not.toThrow();
  });
});
