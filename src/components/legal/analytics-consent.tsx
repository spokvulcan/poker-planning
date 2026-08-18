"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

const ANALYTICS_CONSENT_COOKIE = "analytics_consent";
const ANALYTICS_CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

type AnalyticsConsentValue = "granted" | "denied" | null;

function setAnalyticsConsent(value: Exclude<AnalyticsConsentValue, null>) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${ANALYTICS_CONSENT_COOKIE}=${value}; ` +
    `Path=/; Max-Age=${ANALYTICS_CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  window.location.reload();
}

export function AnalyticsConsentBanner({
  initialConsent,
}: {
  initialConsent: AnalyticsConsentValue;
}) {
  if (initialConsent !== null) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:right-6 sm:max-w-md">
      <div className="rounded-3xl border border-gray-200/70 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-black">
        <p className="text-sm font-semibold tracking-wide text-gray-900 dark:text-white">
          Analytics consent
        </p>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
          We use essential cookies to run the app. Optional analytics stay off
          unless you allow them. Read more in our{" "}
          <Link
            href="/privacy"
            className="font-medium text-gray-900 underline underline-offset-4 dark:text-white"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            className="w-full"
            onClick={() => setAnalyticsConsent("granted")}
          >
            Allow analytics
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setAnalyticsConsent("denied")}
          >
            Refuse analytics
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPreferenceControls() {
  return (
    <div className="rounded-3xl border border-gray-200/70 bg-gray-50/70 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-base font-semibold text-gray-900 dark:text-white">
        Manage analytics preferences
      </p>
      <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
        Non-essential analytics remain off unless you allow them. Changing this
        setting reloads the page. You can also remove the{" "}
        <code className="rounded bg-white px-1 py-0.5 text-xs dark:bg-black">
          analytics_consent
        </code>{" "}
        cookie in your browser at any time.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          className="w-full"
          onClick={() => setAnalyticsConsent("granted")}
        >
          Allow analytics
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setAnalyticsConsent("denied")}
        >
          Refuse analytics
        </Button>
      </div>
    </div>
  );
}
