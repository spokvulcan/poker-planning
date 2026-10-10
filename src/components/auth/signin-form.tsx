"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/components/auth/auth-provider";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function SigninForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAnonymous } = useAuth();
  const ensureSession = useEnsureSession();

  const rawFrom = searchParams.get("from") || "/";
  // Prevent open redirect: only allow relative paths, reject protocol-relative URLs
  const from = rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/";

  const [email, setEmail] = useState("");
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [loadingGuest, setLoadingGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Cooldown timer after sending magic link
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => setCooldownSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  const startCooldown = useCallback(() => setCooldownSeconds(30), []);

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: from,
      });
      if (result.error) {
        setError(result.error.message || `Sign in failed (${result.error.statusText})`);
        setLoadingGoogle(false);
      }
      // On success, the browser redirects to Google — no need to handle data
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sign in with Google";
      setError(message);
      setLoadingGoogle(false);
    }
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoadingMagic(true);
    setError(null);
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: from,
      });
      if (result.error) {
        setError(result.error.message || `Failed to send magic link (${result.error.statusText})`);
      } else {
        setIsSent(true);
        startCooldown();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send magic link";
      setError(message);
    } finally {
      setLoadingMagic(false);
    }
  };

  const handleGuestSignIn = async () => {
    setLoadingGuest(true);
    setError(null);
    try {
      // Already a guest: this is cancel-and-return. Otherwise a new guest,
      // whose users row is made on their first room write.
      await ensureSession();
      router.push(from);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to continue as guest";
      setError(message);
      setLoadingGuest(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in with Google or a magic link
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="rounded-full bg-primary/10 p-3">
                <CheckCircle2 className="size-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Check your email</h3>
                <p className="text-sm text-muted-foreground">
                  We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.<br />
                  It expires in 10 minutes.
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full"
                disabled={cooldownSeconds > 0}
                onClick={() => {
                  setIsSent(false);
                  setEmail("");
                }}
              >
                {cooldownSeconds > 0
                  ? `Try another email (${cooldownSeconds}s)`
                  : "Try another email"}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleMagicLinkSubmit}>
              <FieldGroup>
                <Field>
                  <Button 
                    variant="outline" 
                    type="button" 
                    className="w-full"
                    onClick={handleGoogleSignIn}
                    disabled={loadingGoogle || loadingMagic || loadingGuest}
                  >
                    {loadingGoogle ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <svg className="mr-2 size-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        <path d="M1 1h22v22H1z" fill="none"/>
                      </svg>
                    )}
                    Continue with Google
                  </Button>
                </Field>
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                  Or continue with email
                </FieldSeparator>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loadingGoogle || loadingMagic || loadingGuest}
                  />
                </Field>
                <Field>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loadingGoogle || loadingMagic || loadingGuest || !email}
                  >
                    {loadingMagic ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Send magic link
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}

          {/* Guest button outside the form to prevent auto-submit by password managers */}
          {!isSent && (
            <div className="mt-4">
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card mb-4">
                Or
              </FieldSeparator>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGuestSignIn}
                disabled={loadingGoogle || loadingMagic || loadingGuest}
              >
                {loadingGuest ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                {isAnonymous ? "Cancel and return to room" : "Continue as guest"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="px-6 text-center text-balance text-muted-foreground text-sm">
        By clicking continue, you agree to our <Link href="/terms" className="underline underline-offset-4 hover:text-primary">Terms of Service</Link>{" "}
        and <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">Privacy Policy</Link>.
      </div>
    </div>
  );
}
