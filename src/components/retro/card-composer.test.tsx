/**
 * The composer (spec §8.1, §19, ADR-0012, ADR-0015): picks a prompt and
 * shows its hint (the one place a hint appears), carries the attribution
 * line and the hidden-or-visible line, and posts with the chosen prompt.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { CardComposer } from "./card-composer";
import type { FormatPrompt } from "@/convex/model/retroFormats";

afterEach(cleanup);

const prompts: FormatPrompt[] = [
  { id: "p1", label: "What went well?", hint: "Something worth keeping.", color: "green", order: 0 },
  { id: "p2", label: "Ideas", color: "blue", order: 1 },
];

describe("CardComposer", () => {
  it("shows the prompt's hint, the attribution line and the hidden line, and posts with the chosen prompt", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();
    render(
      <CardComposer open onOpenChange={onOpenChange} prompts={prompts} viewerName="Sam" attribution="named" hidden onSubmit={onSubmit} />
    );
    expect(screen.getByText("Posted as Sam. Your name stays with this card.")).toBeTruthy();
    expect(screen.getByTestId("reveal-copy").textContent).toBe(
      "Only you can read this for now. Others can see you've added a card, not what it says. Everyone reads it once cards are revealed."
    );
    expect(screen.getByTestId("prompt-hint").textContent).toBe("Something worth keeping.");

    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "p2" } });
    expect(screen.queryByTestId("prompt-hint")).toBeNull();
    fireEvent.change(screen.getByLabelText("Your card"), { target: { value: "  try mob programming " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post card" }));
    });
    expect(onSubmit).toHaveBeenCalledWith("p2", "try mob programming");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open with the text kept when the write is refused, and reads the visible line in a visible entry", async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();
    render(
      <CardComposer open onOpenChange={onOpenChange} prompts={prompts} viewerName="Sam" attribution="named" hidden={false} onSubmit={onSubmit} />
    );
    expect(screen.getByTestId("reveal-copy").textContent).toBe("Everyone in the retro can read this now.");
    expect((screen.getByRole("button", { name: "Post card" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your card"), { target: { value: "draft" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post card" }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Your card") as HTMLTextAreaElement).value).toBe("draft");
  });

  it("in an anonymous retro reads the anonymous line with the anonymous hidden line stacked, and never the name", () => {
    render(
      <CardComposer open onOpenChange={vi.fn()} prompts={prompts} viewerName="Sam" attribution="anonymous" hidden onSubmit={vi.fn()} />
    );
    expect(screen.getByTestId("attribution-copy").textContent).toBe(
      "Anonymous. Your name is not saved with this card, not even for the facilitator. Edit or delete it from this device."
    );
    expect(screen.getByTestId("reveal-copy").textContent).toBe(
      "Only you can read this for now. Everyone reads it once cards are revealed."
    );
    expect(screen.queryByText(/Sam/)).toBeNull();
    cleanup();
    render(
      <CardComposer open onOpenChange={vi.fn()} prompts={prompts} viewerName="Sam" attribution="anonymous" hidden={false} onSubmit={vi.fn()} />
    );
    expect(screen.getByTestId("reveal-copy").textContent).toBe("Everyone in the retro can read this now.");
  });
});
