/**
 * usePanelState — mutual exclusion + Escape-to-close (user stories 6, 7, 16, 21).
 *
 * Tests the keyboard and exclusivity rules through the hook's public surface,
 * driving Escape via real DOM events so the input/dialog guards are exercised
 * exactly as they fire in the canvas.
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

describe("usePanelState — mutual exclusion", () => {
  it("opening Issues closes Settings, and vice versa", () => {
    const { result } = renderHook(() => usePanelState());

    act(() => result.current.openSettings());
    expect(result.current.isSettingsOpen).toBe(true);
    expect(result.current.isIssuesPanelOpen).toBe(false);

    act(() => result.current.openIssues());
    expect(result.current.isIssuesPanelOpen).toBe(true);
    expect(result.current.isSettingsOpen).toBe(false);

    act(() => result.current.openSettings());
    expect(result.current.isSettingsOpen).toBe(true);
    expect(result.current.isIssuesPanelOpen).toBe(false);
  });

  it("closeAll closes both panels", () => {
    const { result } = renderHook(() => usePanelState());
    act(() => result.current.openIssues());
    act(() => result.current.closeAll());
    expect(result.current.isIssuesPanelOpen).toBe(false);
    expect(result.current.isSettingsOpen).toBe(false);
  });
});

describe("usePanelState — Escape", () => {
  it("closes an open panel", () => {
    const { result } = renderHook(() => usePanelState());
    act(() => result.current.openIssues());

    pressEscape();

    expect(result.current.isIssuesPanelOpen).toBe(false);
  });

  it("is ignored while focus is in an input/textarea/contenteditable", () => {
    const { result } = renderHook(() => usePanelState());
    act(() => result.current.openSettings());

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    pressEscape(input);

    expect(result.current.isSettingsOpen).toBe(true);
  });

  it("is ignored while a dialog is layered over the panel", () => {
    const { result } = renderHook(() => usePanelState());
    act(() => result.current.openIssues());

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    document.body.appendChild(dialog);
    pressEscape();

    expect(result.current.isIssuesPanelOpen).toBe(true);
  });

  it("does not listen while both panels are closed (no throw)", () => {
    renderHook(() => usePanelState());
    // No panel open: Escape is a no-op and must not error.
    expect(() => pressEscape()).not.toThrow();
  });
});
