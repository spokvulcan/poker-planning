"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The invite route (spec §5): a permanent account becomes a member and lands
 * on the team page; an anonymous account (or nobody) is shown "Sign in to
 * join {team}" and returns here after linking. The only writer of a team
 * membership.
 */
export function JoinTeamContent() {
  const params = useParams();
  const router = useRouter();
  const inviteToken = params.inviteToken as string;
  const { isAuthenticated, isLoading: authLoading, accountType } = useAuth();

  const team = useQuery(api.teams.getByInviteToken, { inviteToken });
  const joinByInvite = useMutation(api.teams.joinByInvite);
  const [error, setError] = useState<string | null>(null);
  // Bumped by "Try again" so the join effect runs once more.
  const [attempt, setAttempt] = useState(0);
  const attemptedRef = useRef(false);

  const isPermanent = isAuthenticated && accountType === "permanent";
  const signInHref = `/auth/signin?from=${encodeURIComponent(`/team/join/${inviteToken}`)}`;

  useEffect(() => {
    if (!team || !isPermanent || attemptedRef.current) return;
    attemptedRef.current = true;
    joinByInvite({ inviteToken })
      .then((teamId) => router.replace(`/team/${teamId}`))
      .catch((e: unknown) => {
        attemptedRef.current = false;
        setError(e instanceof Error ? e.message : "Failed to join the team");
      });
  }, [team, isPermanent, inviteToken, joinByInvite, router, attempt]);

  let body: React.ReactNode;
  if (team === undefined || authLoading || (isAuthenticated && accountType === null)) {
    body = <p className="text-sm text-muted-foreground">Checking the invite…</p>;
  } else if (team === null) {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          This invite link is no longer valid. Ask a team admin for a new one.
        </p>
        <Button variant="outline" render={<Link href="/dashboard/retros" />} nativeButton={false}>
          Go to Retros
        </Button>
      </>
    );
  } else if (error) {
    body = (
      <>
        <p className="text-sm text-destructive">{error}</p>
        <Button
          onClick={() => {
            setError(null);
            attemptedRef.current = false;
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </>
    );
  } else if (isPermanent) {
    body = <p className="text-sm text-muted-foreground">Joining {team.name}…</p>;
  } else {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          Team membership needs a signed-in account, so the team knows who can read its retros.
        </p>
        <Button render={<Link href={signInHref} />} nativeButton={false}>Sign in to join {team.name}</Button>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 pt-32 pb-16 sm:pt-40">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{team ? `Join ${team.name}` : "Join team"}</CardTitle>
            <CardDescription>
              {team ? "You've been invited to a team on AgileKit." : "Team invite"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-4">{body}</CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
