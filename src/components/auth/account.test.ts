/**
 * What a viewer is offered of their account, and where it leads
 * (account.ts): the same places, Sign in on the same terms and the same way
 * back, wherever the account menus, the command menu, the navbar and the
 * dashboard's sidebar offer them.
 */
import { describe, it, expect } from "vitest";
import { accountEntries, needsAccount, PLACES, returnPath, signInHref } from "./account";
import type { Viewer } from "./viewer";

const signedIn = (isPermanent: boolean): Viewer => ({
  status: "signedIn",
  name: "Ada",
  avatarUrl: null,
  email: null,
  isPermanent,
  confirmed: true,
});

describe("returnPath", () => {
  it("keeps a page on this site, its query and hash included", () => {
    expect(returnPath("/room/room-1")).toBe("/room/room-1");
    expect(returnPath("/dashboard/sessions?range=30d#top")).toBe("/dashboard/sessions?range=30d#top");
  });

  it.each([null, undefined, "", "room/room-1", "https://evil.example", "//evil.example", "/\\evil.example", "/\\/evil.example"])(
    "comes home for %s, which is no page on this site",
    (from) => {
      expect(returnPath(from)).toBe("/");
    }
  );
});

describe("signInHref", () => {
  it("comes back to the page the person is on", () => {
    expect(signInHref("/pricing")).toBe("/auth/signin?from=%2Fpricing");
    expect(signInHref("/room/room-1")).toBe("/auth/signin?from=%2Froom%2Froom-1");
  });

  it("names no way back from the home page, the sign-in pages, or a path to another site", () => {
    expect(signInHref("/")).toBe("/auth/signin");
    expect(signInHref("/auth/signin")).toBe("/auth/signin");
    expect(signInHref("//evil.example")).toBe("/auth/signin");
  });
});

describe("needsAccount", () => {
  it("is the dashboard and its pages only", () => {
    expect(["/dashboard", "/dashboard/retros", "/dashboard/settings"].every(needsAccount)).toBe(true);
    expect(["/", "/dashboards", "/room/room-1", "/retro/new"].some(needsAccount)).toBe(false);
  });
});

describe("accountEntries", () => {
  it("offers nothing while the viewer loads", () => {
    expect(accountEntries({ status: "loading" }, "/pricing")).toEqual({ signIn: null, places: [] });
  });

  it("offers a visitor Sign in, back to the page", () => {
    expect(accountEntries({ status: "visitor" }, "/pricing")).toEqual({
      signIn: "/auth/signin?from=%2Fpricing",
      places: [],
    });
  });

  it("offers a guest their places and Sign in", () => {
    expect(accountEntries(signedIn(false), "/room/room-1")).toEqual({
      signIn: "/auth/signin?from=%2Froom%2Froom-1",
      places: PLACES,
    });
  });

  it("offers a permanent account its places, and no Sign in", () => {
    expect(accountEntries(signedIn(true), "/room/room-1")).toEqual({ signIn: null, places: PLACES });
  });
});
