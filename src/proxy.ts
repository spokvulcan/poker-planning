import { NextResponse, type NextRequest } from "next/server";
import { PAGE_PATH_HEADER } from "@/lib/page-path";

/**
 * Puts the page's path on a dashboard request, for the dashboard's gate to
 * send a visitor to sign in coming back to it: Next gives a layout no
 * pathname. It reads nothing else and costs no network.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PAGE_PATH_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/dashboard/:path*",
};
