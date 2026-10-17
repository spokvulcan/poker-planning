import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { PAGE_PATH_HEADER } from "@/lib/page-path";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { signInHref } from "@/components/auth/account";

// Every dashboard page is an account's own. The server sends a visitor who
// asks for one to sign in, coming back to the page, as the browser's gate
// does (DashboardLayout); a visitor with no session cookie costs no network.
// A session the server couldn't confirm in time is the browser's to decide.
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (session.status === "none") {
    redirect(signInHref((await headers()).get(PAGE_PATH_HEADER) ?? "/dashboard"));
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return <DashboardLayout defaultOpen={defaultOpen}>{children}</DashboardLayout>;
}
