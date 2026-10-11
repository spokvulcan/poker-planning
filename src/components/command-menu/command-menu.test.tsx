/**
 * The command menu: ⌘K (or Ctrl+K) opens it from anywhere in the app shell,
 * a search finds pages, posts and actions, and choosing one goes there and
 * closes the menu. What it offers follows who is looking, and the theme rows
 * set the theme. The 404 page draws the same palette inline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const spy = vi.hoisted(() => ({
  push: vi.fn(),
  setTheme: vi.fn(),
  theme: "dark" as string | undefined,
  auth: { viewer: { status: "visitor" } } as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: spy.push }),
  usePathname: () => "/pricing",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: spy.theme, setTheme: spy.setTheme }),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => spy.auth,
}));

import { CommandMenuButton, CommandMenuProvider } from "./command-menu";
import { CommandPalette } from "./command-palette";
import { resetBlogPostsForTest } from "./use-blog-posts";

const POSTS = [{ slug: "sprint-retrospectives", title: "How to run a sprint retro", tags: ["Scrum"] }];

beforeEach(() => {
  // cmdk measures and scrolls its list; jsdom does neither.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => POSTS }))
  );
  resetBlogPostsForTest();
  spy.push.mockReset();
  spy.setTheme.mockReset();
  spy.theme = "dark";
  spy.auth = { viewer: { status: "visitor" } };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderMenu() {
  return render(
    <CommandMenuProvider>
      <CommandMenuButton />
    </CommandMenuProvider>
  );
}

const pressShortcut = (init: KeyboardEventInit) => fireEvent.keyDown(window, { key: "k", ...init });
const search = () => screen.getByPlaceholderText("Search pages, posts and actions…");
const type = (text: string) => fireEvent.change(search(), { target: { value: text } });
const option = (name: RegExp) => screen.findByRole("option", { name });

describe("the command menu", () => {
  it("opens with ⌘K or Ctrl+K and closes with the same keys", async () => {
    renderMenu();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Its screen-reader title belongs to the open dialog, not to every page.
    expect(screen.queryByText("Command menu")).toBeNull();

    pressShortcut({ metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Command menu" })).toBeTruthy();

    pressShortcut({ metaKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    pressShortcut({ ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("ignores K without a modifier, and with Shift or Alt", () => {
    renderMenu();
    pressShortcut({});
    pressShortcut({ metaKey: true, shiftKey: true });
    pressShortcut({ ctrlKey: true, altKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from the navbar's search button", async () => {
    renderMenu();
    fireEvent.click(screen.getAllByRole("button", { name: /search/i })[0]);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("finds a page by its name and goes there on Enter, closing the menu", async () => {
    renderMenu();
    pressShortcut({ metaKey: true });
    await screen.findByRole("dialog");

    type("pric");
    await waitFor(() => expect(screen.getAllByRole("option")[0].textContent).toMatch(/^Pricing/));
    fireEvent.keyDown(search(), { key: "Enter" });

    expect(spy.push).toHaveBeenCalledWith("/pricing");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says so when nothing matches", async () => {
    renderMenu();
    pressShortcut({ metaKey: true });
    await screen.findByRole("dialog");

    type("zzzzqqq");
    expect(await screen.findByText("Nothing matches “zzzzqqq”.")).toBeTruthy();
  });

  it("searches the blog's posts once someone types", async () => {
    renderMenu();
    pressShortcut({ metaKey: true });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("option", { name: /How to run a sprint retro/ })).toBeNull();

    type("sprint retro");
    fireEvent.click(await option(/How to run a sprint retro/));

    expect(spy.push).toHaveBeenCalledWith("/blog/sprint-retrospectives");
    expect(fetch).toHaveBeenCalledWith("/blog/posts.json");
  });

  it("offers a signed-in person their dashboard", async () => {
    spy.auth = {
      viewer: { status: "signedIn", name: "Ada", avatarUrl: null, email: null, isPermanent: true, confirmed: true },
    };
    renderMenu();
    pressShortcut({ metaKey: true });

    fireEvent.click(await option(/^Your retros/));
    expect(spy.push).toHaveBeenCalledWith("/dashboard/retros");
  });

  it("offers a visitor sign-in instead, back to the page they are on", async () => {
    renderMenu();
    pressShortcut({ metaKey: true });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("option", { name: /^Your retros/ })).toBeNull();

    type("sign in");
    fireEvent.click(await option(/^Sign in/));
    expect(spy.push).toHaveBeenCalledWith("/auth/signin?from=%2Fpricing");
  });

  it("offers neither while it does not know who is looking", async () => {
    spy.auth = { viewer: { status: "loading" } };
    renderMenu();
    pressShortcut({ metaKey: true });
    await screen.findByRole("dialog");

    type("s");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect(screen.queryByRole("option", { name: /^Your retros/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /^Sign in/ })).toBeNull();
  });

  it("ticks the current theme and sets another", async () => {
    renderMenu();
    pressShortcut({ metaKey: true });

    expect((await option(/^Dark/)).getAttribute("data-checked")).toBe("true");
    expect((await option(/^Light/)).getAttribute("data-checked")).toBe("false");

    fireEvent.click(await option(/^Light/));
    expect(spy.setTheme).toHaveBeenCalledWith("light");
  });

  it("keeps the legal pages out of the list until someone searches", async () => {
    renderMenu();
    pressShortcut({ metaKey: true });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("option", { name: /^Privacy Policy/ })).toBeNull();

    type("privacy");
    expect(await option(/^Privacy Policy/)).toBeTruthy();
  });
});

describe("the palette on a page (the 404)", () => {
  it("takes / to the search and Escape back out, clearing it", () => {
    render(<CommandPalette surface="page" />);

    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(search());

    type("blog");
    fireEvent.keyDown(search(), { key: "Escape" });
    expect((search() as HTMLInputElement).value).toBe("");
    expect(document.activeElement).not.toBe(search());
  });

  it("goes where it is told without a dialog to close", async () => {
    render(<CommandPalette surface="page" />);
    fireEvent.click(await option(/^Start a retro/));
    expect(spy.push).toHaveBeenCalledWith("/retro/new");
  });
});
