/**
 * Stage navigation (ADR-0010, spec §7): the list of entries; any member
 * navigates their own view to another entry and "Back to the team" returns
 * it; a stageFlow holder advances forward or back and brings everyone to
 * the entry they are viewing; the reveal toggle and the timebox act on the
 * current entry; a participant sees the controls disabled with the denial
 * copy, never vanished.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StageNav } from "./stage-nav";
import type { StageEntry } from "@/convex/model/retroFormats";
import { RESOLVED_ALLOWED } from "@/convex/permissions";

afterEach(cleanup);

const stages: StageEntry[] = [
  { id: "s1", kind: "collect", cardsVisible: "hidden", tallyVisible: "visible" },
  { id: "s2", kind: "group", cardsVisible: "visible", tallyVisible: "visible" },
  { id: "s3", kind: "vote", cardsVisible: "visible", tallyVisible: "hidden", voteBudget: 5 },
  { id: "s4", kind: "discuss", cardsVisible: "visible", tallyVisible: "visible" },
];

const denied = { allowed: false as const, message: "Only facilitators and the owner can do this" };

type Props = Parameters<typeof StageNav>[0];
type Controls = NonNullable<Props["controls"]>;

function renderNav(over: Partial<Omit<Props, "controls">> & Partial<Controls> & { controls?: null } = {}) {
  const { stages: s, currentStageId, viewStageId, onView, controls, ...rest } = over;
  const ctl: Controls = {
    stageFlow: RESOLVED_ALLOWED,
    onAdvance: vi.fn(),
    onSetCardsVisible: vi.fn(),
    onSetTimebox: vi.fn(),
    ...rest,
  };
  const props = {
    stages: s ?? stages,
    currentStageId: currentStageId ?? "s2",
    viewStageId: viewStageId ?? null,
    onView: onView ?? vi.fn(),
    ...(controls === null ? {} : { controls: ctl }),
  };
  render(<StageNav {...props} />);
  return { ...props, ...ctl };
}

describe("StageNav — own view", () => {
  it("lists every entry, marks the shared one, and navigates the view on click", () => {
    const props = renderNav();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Collect", "Group", "Vote", "Discuss"]);
    expect(tabs[1].getAttribute("data-shared")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("button", { name: "Back to the team" })).toBeNull();

    fireEvent.click(tabs[3]);
    expect(props.onView).toHaveBeenCalledWith("s4");
  });

  it("when the view is elsewhere, Back to the team returns it", () => {
    const props = renderNav({ viewStageId: "s4" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs[3].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("data-shared")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Back to the team" }));
    expect(props.onView).toHaveBeenCalledWith(null);
  });
});

describe("StageNav — advance", () => {
  it("a stageFlow holder advances forward and back from the shared entry", () => {
    const props = renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Next stage" }));
    expect(props.onAdvance).toHaveBeenCalledWith("s3");
    fireEvent.click(screen.getByRole("button", { name: "Previous stage" }));
    expect(props.onAdvance).toHaveBeenCalledWith("s1");
  });

  it("at the ends, the edge button is disabled; nothing advances by itself", () => {
    renderNav({ currentStageId: "s4" });
    expect((screen.getByRole("button", { name: "Next stage" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Previous stage" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("viewing another entry offers to bring everyone there", () => {
    const props = renderNav({ viewStageId: "s4" });
    fireEvent.click(screen.getByRole("button", { name: "Bring everyone here" }));
    expect(props.onAdvance).toHaveBeenCalledWith("s4");
  });

  it("a participant sees the controls disabled with the denial copy", () => {
    renderNav({ stageFlow: denied, viewStageId: "s4" });
    // The denial overlay renames each control with the copy and disables it.
    const controls = screen.getAllByRole("button", { name: denied.message });
    expect(controls).toHaveLength(3);
    expect(controls.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    // The own-view tabs stay open to everyone.
    expect(screen.getAllByRole("tab").every((t) => !(t as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe("StageNav — the nudge button (spec §16.2)", () => {
  const collect = { currentStageId: "s1" };
  it("shows on a team retro in collect, with the copy for the seat, and presses through", () => {
    const onNudge = vi.fn();
    renderNav({
      ...collect,
      nudge: { status: { recipientCount: 4, lastNudge: null }, attribution: "named", onNudge },
    });
    const button = screen.getByRole("button", { name: "Email 4 people who haven't written" });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(onNudge).toHaveBeenCalledTimes(1);
  });

  it("reads Sent {ago} by {name} and is disabled inside the day", () => {
    renderNav({
      ...collect,
      nudge: {
        status: { recipientCount: 4, lastNudge: { at: Date.now() - 2 * 60 * 60 * 1000, byName: "Sam" } },
        attribution: "anonymous",
        onNudge: vi.fn(),
      },
    });
    const button = screen.getByRole("button", { name: /^Sent 2 hours ago by Sam$/ });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("is disabled at zero recipients", () => {
    renderNav({
      ...collect,
      nudge: { status: { recipientCount: 0, lastNudge: null }, attribution: "named", onNudge: vi.fn() },
    });
    expect(screen.getByRole("button", { name: "Email 0 people who haven't written" }).hasAttribute("disabled")).toBe(true);
  });

  it("is absent outside collect, on a teamless retro, while its read is loading, while viewing another entry, and for a Team reader", () => {
    const nudge = { status: { recipientCount: 3, lastNudge: null }, attribution: "named" as const, onNudge: vi.fn() };
    renderNav({ currentStageId: "s2", nudge });
    expect(screen.queryByRole("button", { name: /Email/ })).toBeNull();
    cleanup();
    renderNav({ ...collect, nudge: { ...nudge, status: null } });
    expect(screen.queryByRole("button", { name: /Email/ })).toBeNull();
    cleanup();
    renderNav({ ...collect, nudge: { ...nudge, status: undefined } });
    expect(screen.queryByRole("button", { name: /Email/ })).toBeNull();
    cleanup();
    renderNav({ ...collect, viewStageId: "s3", nudge });
    expect(screen.queryByRole("button", { name: /Email/ })).toBeNull();
    cleanup();
    renderNav({ ...collect, controls: null });
    expect(screen.queryByRole("button", { name: /Email/ })).toBeNull();
  });
});

describe("StageNav — a Team reader", () => {
  it("gets the tabs and Back to the team, and no stageFlow control at all", () => {
    renderNav({ controls: null, viewStageId: "s4" });
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Back to the team" })).toBeTruthy();
  });
});

describe("StageNav — the current entry's controls", () => {
  it("flips the reveal policy of the current entry", () => {
    const props = renderNav({ currentStageId: "s1" });
    fireEvent.click(screen.getByRole("button", { name: "Show cards" }));
    expect(props.onSetCardsVisible).toHaveBeenCalledWith("visible");
    cleanup();
    const again = renderNav({ currentStageId: "s2" });
    fireEvent.click(screen.getByRole("button", { name: "Hide cards" }));
    expect(again.onSetCardsVisible).toHaveBeenCalledWith("hidden");
  });

  it("sets and clears the current entry's timebox", () => {
    const props = renderNav({
      stages: stages.map((s) => (s.id === "s2" ? { ...s, timeboxMinutes: 10 } : s)),
    });
    const input = screen.getByLabelText("Timebox (minutes)") as HTMLInputElement;
    expect(input.value).toBe("10");
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.blur(input);
    expect(props.onSetTimebox).toHaveBeenCalledWith(15);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(props.onSetTimebox).toHaveBeenCalledWith(undefined);
  });

  it("hides the current entry's controls while the view is elsewhere", () => {
    renderNav({ viewStageId: "s4" });
    expect(screen.queryByRole("button", { name: /cards$/ })).toBeNull();
    expect(screen.queryByLabelText("Timebox (minutes)")).toBeNull();
  });
});
