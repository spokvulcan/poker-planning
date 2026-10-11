/**
 * authTrustedOrigins: the origins BetterAuth takes requests from. Production
 * and Vercel's previews always; every local port only on a development
 * deployment, whose site is on localhost, so a dev server in each worktree
 * can sign in. Production never trusts a local origin.
 */
import { describe, it, expect } from "vitest";
import { authTrustedOrigins } from "./site-config";

const LOCAL_ORIGIN = /localhost|127\.0\.0\.1/;

describe("authTrustedOrigins", () => {
  it("takes production, its subdomains and Vercel's previews on every deployment", () => {
    for (const site of ["https://agilekit.app", "http://localhost:3000"]) {
      expect(authTrustedOrigins(site)).toEqual(
        expect.arrayContaining([site, "https://agilekit.app", "https://*.agilekit.app", "https://*.vercel.app"]),
      );
    }
  });

  it("takes every local port on a development deployment", () => {
    expect(authTrustedOrigins("http://localhost:3000")).toContain("http://localhost:*");
  });

  it.each(["https://agilekit.app", "https://agilekit-git-main-team.vercel.app"])(
    "takes no local origin on %s",
    (site) => {
      expect(authTrustedOrigins(site).filter((origin) => LOCAL_ORIGIN.test(origin))).toEqual([]);
    },
  );
});
