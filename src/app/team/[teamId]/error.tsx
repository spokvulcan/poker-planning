"use client";

import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { NOT_A_TEAM_MEMBER, TEAM_NOT_FOUND } from "@/convex/teamCopy";

/**
 * The team page is members only: `teams.get` throws for anyone else, and the
 * Convex client surfaces that during render. Land here rather than on the
 * generic error page.
 */
export default function TeamError({ error }: { error: Error }) {
  const notMember =
    error.message.includes(NOT_A_TEAM_MEMBER) || error.message.includes(TEAM_NOT_FOUND);
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-2xl font-bold">
            {notMember ? "This team isn't yours to see" : "Something went wrong"}
          </h1>
          <p className="mb-6 text-muted-foreground">
            {notMember
              ? "Only members can open a team page. Ask an admin for the invite link."
              : error.message}
          </p>
          <Button render={<Link href="/dashboard/retros" />} nativeButton={false}>Back to Retros</Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
