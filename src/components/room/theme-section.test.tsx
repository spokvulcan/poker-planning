import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

/**
 * next-themes keeps the chosen theme in localStorage, which a server doesn't
 * have: `useTheme().theme` is undefined while the HTML is rendered and holds
 * the stored choice from the browser's first render on. The real provider
 * can't show that here (jsdom has a window, so it reads localStorage on both
 * sides), so the mock plays both sides and the test hydrates server HTML the
 * way a real page load does.
 */
const nextThemes = vi.hoisted(() => ({ theme: undefined as string | undefined }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: nextThemes.theme, setTheme: () => {} }),
}));

import { ThemeSection } from "./theme-section";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Server-render with no theme, then hydrate that HTML with `storedTheme`. */
function hydrateWithStoredTheme(storedTheme: string) {
  nextThemes.theme = undefined;
  const container = document.body.appendChild(document.createElement("div"));
  container.innerHTML = renderToString(<ThemeSection />);

  nextThemes.theme = storedTheme;
  render(<ThemeSection />, { container, hydrate: true });
}

describe("ThemeSection", () => {
  it.each(["light", "dark", "system"])(
    "hydrates server HTML without a mismatch when %s is stored",
    (storedTheme) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      hydrateWithStoredTheme(storedTheme);

      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it("marks the stored theme once hydrated", () => {
    hydrateWithStoredTheme("dark");

    expect(screen.getByRole("button", { name: "Dark", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Light", pressed: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "System", pressed: false })).toBeTruthy();
  });
});
