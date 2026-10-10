import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { cookies } from "next/headers";

import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isEmbeddedDocument } from "@/lib/embed";
import { TopLevelOnly } from "@/components/top-level-only";
import { AnalyticsConsentBanner } from "@/components/legal/analytics-consent";
import { SITE } from "@/lib/site-copy";
import { SITE_ORIGIN, siteConfig } from "@/lib/site-config";
import { SITE_OPEN_GRAPH, SITE_TWITTER } from "@/lib/page-metadata";

import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// No canonical here: every page inherits the root's, so one set here named
// the homepage as the canonical of any page that forgot its own.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE.title,
    template: SITE.titleTemplate,
  },
  description: SITE.description,
  keywords: SITE.keywords,
  authors: [{ name: siteConfig.author.name }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    ...SITE_OPEN_GRAPH,
    url: SITE_ORIGIN,
    title: SITE.openGraph.title,
    description: SITE.openGraph.description,
  },
  twitter: {
    ...SITE_TWITTER,
    title: SITE.twitter.title,
    description: SITE.twitter.description,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

// What every page shares, the demo included. A page's backend comes from its
// route group's layout: (app) fetches the session's token and mounts BetterAuth
// and the auth provider, and (demo) has none of them (ADR-0003).
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const isEmbedded = await isEmbeddedDocument();
  const analyticsConsentValue = cookieStore.get("analytics_consent")?.value;
  const analyticsConsent =
    analyticsConsentValue === "granted"
      ? "granted"
      : analyticsConsentValue === "denied"
        ? "denied"
        : null;
  // A framed document is a second render of this layout inside a page that is
  // already reporting the same visit, so it must not report it again. The
  // toaster stays: toasts raised inside the demo belong to the demo's viewport.
  const analyticsEnabled = analyticsConsent === "granted" && !isEmbedded;

  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          defaultTheme="system"
          storageKey="agilekit-theme"
          attribute="class"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
          {!isEmbedded && (
            <TopLevelOnly>
              <AnalyticsConsentBanner initialConsent={analyticsConsent} />
              {analyticsEnabled && <SpeedInsights />}
            </TopLevelOnly>
          )}
        </ThemeProvider>
        {analyticsEnabled && process.env.NEXT_PUBLIC_GA_ID && (
          <TopLevelOnly>
            <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
          </TopLevelOnly>
        )}
      </body>
    </html>
  );
}
