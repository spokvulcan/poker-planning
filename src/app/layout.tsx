import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { cookies } from "next/headers";

import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { Providers } from "@/components/providers";
import { Toaster } from "sonner";
import { getToken } from "@/lib/auth-server";
import { isEmbeddedDocument } from "@/lib/embed";
import { TopLevelOnly } from "@/components/top-level-only";
import { AnalyticsConsentBanner } from "@/components/legal/analytics-consent";
import { SITE } from "@/lib/site-copy";

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

const baseUrl = "https://agilekit.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: SITE.title,
    template: SITE.titleTemplate,
  },
  description: SITE.description,
  keywords: SITE.keywords,
  authors: [{ name: "AgileKit Team" }],
  creator: "AgileKit",
  publisher: "AgileKit",
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
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "AgileKit",
    title: SITE.openGraph.title,
    description: SITE.openGraph.description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: SITE.openGraph.imageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.twitter.title,
    description: SITE.twitter.description,
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: baseUrl,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialToken = await getToken();
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
        <Providers initialToken={initialToken}>
          {children}
          <Toaster />
          {!isEmbedded && (
            <TopLevelOnly>
              <AnalyticsConsentBanner initialConsent={analyticsConsent} />
              {analyticsEnabled && <SpeedInsights />}
            </TopLevelOnly>
          )}
        </Providers>
        {analyticsEnabled && process.env.NEXT_PUBLIC_GA_ID && (
          <TopLevelOnly>
            <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
          </TopLevelOnly>
        )}
      </body>
    </html>
  );
}
