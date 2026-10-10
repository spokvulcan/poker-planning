import type { Metadata } from "next";

// The sign-in pages are client components, so their metadata lives here.
// Without it they carried the homepage's title and description as an
// indexable duplicate of the homepage.
export const metadata: Metadata = {
  title: "Sign in",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
