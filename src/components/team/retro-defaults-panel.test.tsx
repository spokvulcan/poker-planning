/**
 * RetroDefaultsPanel — the team page's retro-defaults editor. Every change
 * writes the whole bundle by value (spec §5, ADR-0013): one changed key, the
 * other five untouched, and never a mutation of the bundle it was given. A
 * member sees the current values with no live controls.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { DEFAULT_RETRO_PERMISSIONS } from "@/convex/permissions";
import { RetroDefaultsPanel, type RetroDefaults } from "./retro-defaults-panel";

afterEach(cleanup);

const initial: RetroDefaults = {
  attribution: "named",
  joinPolicy: "anyone",
  permissions: { ...DEFAULT_RETRO_PERMISSIONS },
};

function renderPanel(canEdit = true) {
  const onChange = vi.fn(() => Promise.resolve());
  const value: RetroDefaults = structuredClone(initial);
  render(<RetroDefaultsPanel value={value} canEdit={canEdit} onChange={onChange} />);
  return { onChange, value };
}

function group(name: string) {
  return within(screen.getByRole("radiogroup", { name }));
}

// No jest-dom in this project: read the ARIA state directly.
const checked = (el: HTMLElement) => el.getAttribute("aria-checked") === "true";
const disabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

describe("RetroDefaultsPanel", () => {
  it("renders the six settings at their current values", () => {
    renderPanel();
    expect(checked(group("Attribution").getByRole("radio", { name: "Named" }))).toBe(true);
    expect(checked(group("Who can join").getByRole("radio", { name: "Anyone with the link" }))).toBe(true);
    expect(checked(group("Stage flow").getByRole("radio", { name: "Facilitators" }))).toBe(true);
    expect(checked(group("Card management").getByRole("radio", { name: "Facilitators" }))).toBe(true);
    expect(checked(group("Action items").getByRole("radio", { name: "Everyone" }))).toBe(true);
    expect(checked(group("Retro settings").getByRole("radio", { name: "Facilitators" }))).toBe(true);
  });

  it("changing attribution writes the whole bundle with only that key changed", () => {
    const { onChange, value } = renderPanel();
    fireEvent.click(group("Attribution").getByRole("radio", { name: "Anonymous" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...initial, attribution: "anonymous" });
    // By value: the bundle handed in is untouched.
    expect(value).toEqual(initial);
  });

  it("changing the join policy and a permission level each write the full bundle", () => {
    const { onChange } = renderPanel();
    fireEvent.click(group("Who can join").getByRole("radio", { name: "Team members" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, joinPolicy: "teamMembers" });

    // The second write carries the first: each write replaces the whole
    // stored object, so it must build on what was just written.
    fireEvent.click(group("Card management").getByRole("radio", { name: "Owner only" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...initial,
      joinPolicy: "teamMembers",
      permissions: { ...initial.permissions, cardManagement: "owner" },
    });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("re-selecting the current value writes nothing", () => {
    const { onChange } = renderPanel();
    fireEvent.click(group("Attribution").getByRole("radio", { name: "Named" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a member sees the values but every control is disabled", () => {
    const { onChange } = renderPanel(false);
    const named = group("Attribution").getByRole("radio", { name: "Named" });
    expect(checked(named)).toBe(true);
    for (const radio of screen.getAllByRole("radio")) {
      expect(disabled(radio)).toBe(true);
    }
    fireEvent.click(group("Attribution").getByRole("radio", { name: "Anonymous" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("RetroDefaultsPanel — keyboard", () => {
  it("arrow keys move the selection and wrap, writing the bundle each time", () => {
    const { onChange } = renderPanel();
    const named = group("Attribution").getByRole("radio", { name: "Named" });
    expect(named.tabIndex).toBe(0);
    expect(group("Attribution").getByRole("radio", { name: "Anonymous" }).tabIndex).toBe(-1);

    fireEvent.keyDown(named, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, attribution: "anonymous" });

    // Wraps from the first option back to the last.
    fireEvent.keyDown(named, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, attribution: "anonymous" });
    expect(onChange).toHaveBeenCalledTimes(2);

    // Other keys are ignored.
    fireEvent.keyDown(named, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("RetroDefaultsPanel — quick successive changes", () => {
  it("the second write builds on the first, not on the stale prop, until the query catches up", () => {
    const onChange = vi.fn(() => Promise.resolve());
    const { rerender } = render(<RetroDefaultsPanel value={initial} canEdit onChange={onChange} />);

    fireEvent.click(group("Attribution").getByRole("radio", { name: "Anonymous" }));
    fireEvent.click(group("Who can join").getByRole("radio", { name: "Team members" }));
    expect(onChange).toHaveBeenNthCalledWith(1, { ...initial, attribution: "anonymous" });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      ...initial,
      attribution: "anonymous",
      joinPolicy: "teamMembers",
    });
    // The UI shows both changes before the query has pushed anything back.
    expect(checked(group("Attribution").getByRole("radio", { name: "Anonymous" }))).toBe(true);
    expect(checked(group("Who can join").getByRole("radio", { name: "Team members" }))).toBe(true);

    // The query pushes a new bundle: it wins over the draft.
    const pushed: RetroDefaults = { ...initial, attribution: "anonymous" };
    rerender(<RetroDefaultsPanel value={pushed} canEdit onChange={onChange} />);
    expect(checked(group("Who can join").getByRole("radio", { name: "Anyone with the link" }))).toBe(true);
  });
});
