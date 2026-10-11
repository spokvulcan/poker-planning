import { AppProviders } from "@/components/providers";
import { getServerViewer } from "@/components/auth/server-viewer";
import { getServerSession } from "@/lib/server-session";

// The app shell, for every page but the demo. The session's token, fetched
// here, lets Convex authenticate whoever is signed in on the first render, and
// the viewer, read with it, lets the page draw who that is before it does.
// Neither may hold the page up: a visitor costs no network, and when Convex is
// slow or unreachable the page renders without them and the browser fetches
// the session itself.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();
  const initialViewer = await getServerViewer(session);
  const initialToken = session.status === "token" ? session.token : undefined;

  return (
    <AppProviders initialToken={initialToken} initialViewer={initialViewer}>
      {children}
    </AppProviders>
  );
}
