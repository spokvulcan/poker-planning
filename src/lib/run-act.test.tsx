/**
 * runAct, the write runner both ceremonies' writes go through: a refused
 * write shows the refusal's own message, and a failure whose message the
 * server redacted shows the caller's copy, never "Server Error". The errors
 * have the shapes the Convex client rejects with, and the toast renders in
 * the page's toaster, where the person reads it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { Toaster, toast } from "sonner";
import { refusal } from "@/convex/model/refusal";
import { runAct } from "./run-act";

/** A plain Error thrown on the server, as production hands it to the browser. */
const REDACTED = new Error("[CONVEX M(rooms:showCards)] [Request ID: 7c1f2a9b] Server Error\n  Called by client");

/** Runs one write with the toaster mounted; resolves to whether it went through. */
async function runWithToaster(write: Promise<unknown>, fallback: string): Promise<boolean> {
  render(<Toaster />);
  let wentThrough = true;
  await act(async () => {
    wentThrough = await runAct(write, fallback);
  });
  return wentThrough;
}

afterEach(() => {
  toast.dismiss();
  cleanup();
});

describe("runAct", () => {
  it("shows a refused write's own message", async () => {
    const write = Promise.reject(refusal("forbidden", "Only facilitators and the owner can do this."));

    expect(await runWithToaster(write, "Try again.")).toBe(false);
    expect(await screen.findByText("Only facilitators and the owner can do this.")).toBeTruthy();
    expect(screen.queryByText("Try again.")).toBeNull();
  });

  it("shows the caller's copy for a failure the server redacted", async () => {
    expect(await runWithToaster(Promise.reject(REDACTED), "That didn't go through. Try again.")).toBe(false);
    expect(await screen.findByText("That didn't go through. Try again.")).toBeTruthy();
    expect(screen.queryByText(/Server Error/)).toBeNull();
  });

  it("shows nothing when the write lands", async () => {
    expect(await runWithToaster(Promise.resolve(null), "Try again.")).toBe(true);
    expect(screen.queryByText("Try again.")).toBeNull();
  });
});
