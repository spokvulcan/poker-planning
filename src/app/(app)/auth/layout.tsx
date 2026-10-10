import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";

// The sign-in pages are client components, so their metadata lives here.
// Without it they carried the homepage's title and description as an
// indexable duplicate of the homepage.
export const metadata: Metadata = pageMetadata({ title: "Sign in", path: "/auth" });

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
