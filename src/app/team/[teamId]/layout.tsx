import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";

/**
 * The team page is for signed-in accounts: redirect on the server, as the
 * dashboard does, so a signed-out visitor never renders the client shell.
 * Membership itself is decided by `teams.get` behind `requireTeamRole`.
 */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    const { teamId } = await params;
    redirect(`/auth/signin?from=${encodeURIComponent(`/team/${teamId}`)}`);
  }
  return children;
}
