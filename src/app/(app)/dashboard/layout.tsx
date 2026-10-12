import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { signInHref } from "@/components/auth/account";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    redirect(signInHref("/dashboard"));
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return <DashboardLayout defaultOpen={defaultOpen}>{children}</DashboardLayout>;
}
