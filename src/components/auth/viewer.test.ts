/**
 * accountKind: the one answer to "does the viewer have a permanent
 * account?", read from their users row by everything that tells one apart
 * (the Account tab, the retention note on /retro/new, the sign-in page's
 * guest button).
 */
import { describe, it, expect } from "vitest";
import { accountKind, type Viewer } from "./viewer";

const signedIn = (isPermanent: boolean): Viewer => ({
  status: "signedIn",
  name: "Ada",
  avatarUrl: null,
  email: null,
  isPermanent,
});

describe("accountKind", () => {
  it("is nothing yet while loading, and nothing for a visitor", () => {
    expect(accountKind({ status: "loading" })).toBeNull();
    expect(accountKind({ status: "visitor" })).toBeNull();
  });

  it("is permanent for a row that says so, and a guest's for any other signed-in viewer", () => {
    expect(accountKind(signedIn(true))).toBe("permanent");
    expect(accountKind(signedIn(false))).toBe("guest");
  });
});
