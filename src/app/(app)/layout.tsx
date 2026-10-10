import { AppProviders } from "@/components/providers";
import { getServerViewer } from "@/components/auth/server-viewer";
import { getToken } from "@/lib/auth-server";

// The app shell, for every page but the demo. The session's token, fetched
// here, lets Convex authenticate whoever is signed in on the first render, and
// the viewer, read with it, lets the page draw who that is before it does.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [initialToken, initialViewer] = await Promise.all([getToken(), getServerViewer()]);

  return (
    <AppProviders initialToken={initialToken} initialViewer={initialViewer}>
      {children}
    </AppProviders>
  );
}
