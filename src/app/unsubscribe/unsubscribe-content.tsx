"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UNSUBSCRIBED, UNSUBSCRIBED_TITLE, UNSUBSCRIBE_FAILED } from "@/convex/retroCopy";

const SETTINGS_HREF = "/dashboard/settings?tab=account";

/** The line with "Settings" as the link; the whole line plain if the copy ever loses the word. */
function LineWithSettingsLink({ text }: { text: string }) {
  const at = text.indexOf("Settings");
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Link href={SETTINGS_HREF} className="underline underline-offset-4 hover:text-foreground">
        Settings
      </Link>
      {text.slice(at + "Settings".length)}
    </>
  );
}

/**
 * `/unsubscribe?token=…` (spec §16.4): the footer link's landing. Calls
 * the guardless mutation once, signed in or not, and shows one line with
 * the way back on, whatever the token did: a stale or tampered token
 * flips nothing server-side, and the person is told the same thing. Only
 * a request that failed outright (the deployment unreachable, the secret
 * unset) reads differently, so nobody is told "done" when nothing ran.
 */
export function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const unsubscribe = useMutation(api.email.unsubscribe);
  const sentRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token || sentRef.current) return;
    sentRef.current = true;
    unsubscribe({ token }).catch((error: unknown) => {
      console.error("Unsubscribe failed:", error);
      setFailed(true);
    });
  }, [token, unsubscribe]);

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Navbar />
      <main className="relative isolate flex-1">
        <div className="pt-28 pb-16 sm:pt-32 sm:pb-24">
          <div className="mx-auto max-w-lg px-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{UNSUBSCRIBED_TITLE}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground" data-testid="unsubscribed" data-failed={String(failed)}>
                  <LineWithSettingsLink text={failed ? UNSUBSCRIBE_FAILED : UNSUBSCRIBED} />
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
