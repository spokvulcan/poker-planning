import { AppProviders } from "@/components/providers";
import { getToken } from "@/lib/auth-server";

// The app shell, for every page but the demo. The session's token, fetched
// here, lets Convex authenticate whoever is signed in on the first render.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialToken = await getToken();

  return <AppProviders initialToken={initialToken}>{children}</AppProviders>;
}
