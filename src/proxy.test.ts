/**
 * The proxy puts the page's path on every dashboard request, where the
 * dashboard's gate reads it to send a visitor to sign in coming back to the
 * page, and runs for nothing else.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { PAGE_PATH_HEADER } from "@/lib/page-path";
import { config, proxy } from "./proxy";

describe("the proxy", () => {
  it("runs for the dashboard's pages only", () => {
    const runsFor = (url: string) => unstable_doesMiddlewareMatch({ config, url });

    expect(["/dashboard", "/dashboard/sessions", "/dashboard/retros", "/dashboard/settings"].every(runsFor)).toBe(true);
    expect(["/", "/demo", "/room/abc123", "/auth/signin", "/api/auth/get-session"].filter(runsFor)).toEqual([]);
  });

  it("puts the page's path on the request the page is rendered for", () => {
    const response = proxy(new NextRequest("https://agilekit.test/dashboard/retros?range=30d"));

    // How Next hands the request headers a proxy sets on to the render
    expect(response.headers.get(`x-middleware-request-${PAGE_PATH_HEADER}`)).toBe("/dashboard/retros");
  });
});
