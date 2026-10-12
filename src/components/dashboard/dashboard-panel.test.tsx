/**
 * The shell every chart panel on the Overview shares: one title, help and
 * line, in each of its three states. Until the read lands it shows a
 * skeleton and nothing of the body; with nothing to draw it says so; and
 * otherwise it draws the body, its caption in place of the description.
 */
import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { DashboardPanel } from "./dashboard-panel";

afterEach(cleanup);

const PANEL = {
  title: "Agreement Trend",
  help: "The board's Agree figure for each issue.",
  description: "Team alignment over time",
  caption: "Trending down 12%",
  emptyText: "No voting data yet",
  children: <p>The chart</p>,
} as const;

function renderPanel(props: Partial<ComponentProps<typeof DashboardPanel>>) {
  const { container } = render(<DashboardPanel {...PANEL} isEmpty={false} {...props} />);
  const card = within(container.querySelector("[data-slot=card]") as HTMLElement);
  return { container, card };
}

const skeleton = (container: HTMLElement) => container.querySelector(".animate-pulse");

describe("DashboardPanel", () => {
  it("shows its title and description over a skeleton until the read lands, and nothing of the body", () => {
    const { container, card } = renderPanel({ isLoading: true });

    expect(card.getByText(PANEL.title)).toBeTruthy();
    expect(card.getByText(PANEL.description)).toBeTruthy();
    expect(skeleton(container)).not.toBeNull();
    expect(card.queryByText("The chart")).toBeNull();
    expect(card.queryByText(PANEL.caption)).toBeNull();
    expect(card.queryByText(PANEL.emptyText)).toBeNull();
  });

  it("says when there is nothing to draw, under its description", () => {
    const { container, card } = renderPanel({ isEmpty: true });

    expect(card.getByText(PANEL.title)).toBeTruthy();
    expect(card.getByText(PANEL.description)).toBeTruthy();
    expect(card.getByText(PANEL.emptyText)).toBeTruthy();
    expect(skeleton(container)).toBeNull();
    expect(card.queryByText("The chart")).toBeNull();
    expect(card.queryByText(PANEL.caption)).toBeNull();
  });

  it("draws its body once there is something to draw, its caption in place of the description", () => {
    const { container, card } = renderPanel({});

    expect(card.getByText(PANEL.title)).toBeTruthy();
    expect(card.getByText("The chart")).toBeTruthy();
    expect(card.getByText(PANEL.caption)).toBeTruthy();
    expect(card.queryByText(PANEL.description)).toBeNull();
    expect(card.queryByText(PANEL.emptyText)).toBeNull();
    expect(skeleton(container)).toBeNull();
  });

  it("keeps its description when the body comes with no caption", () => {
    const { card } = renderPanel({ caption: null });

    expect(card.getByText("The chart")).toBeTruthy();
    expect(card.getByText(PANEL.description)).toBeTruthy();
  });

  it("shows its help from the icon beside the title", async () => {
    const { container } = renderPanel({ isLoading: true });

    await act(async () => {
      fireEvent.mouseEnter(container.querySelector("[data-slot=tooltip-trigger]") as Element);
    });

    expect(await screen.findByText(PANEL.help)).toBeTruthy();
  });
});
