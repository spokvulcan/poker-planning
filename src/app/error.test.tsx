/**
 * The root error boundary: a page that fails to render says so in words and
 * offers to try again, rather than leaving a blank screen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RouteError from "./error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RouteError", () => {
  it("says the page didn't load, tries again on request, and shows the reference for the server's logs", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<RouteError error={Object.assign(new Error("fetch failed"), { digest: "3227098399" })} retry={retry} />);

    expect(screen.getByRole("heading", { name: "Something went wrong." })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText("Reference 3227098399")).toBeDefined();
    expect(screen.queryByText("fetch failed")).toBeNull();
  });
});
