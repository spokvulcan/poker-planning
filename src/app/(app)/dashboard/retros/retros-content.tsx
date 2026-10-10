"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, CircleCheckBig, Clock, Plus, StickyNote } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { DashboardHeader } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STICKY_TONES } from "@/components/retro/sticky-colors";
import type { RetroStep } from "@/convex/retroTemplates";
import { cn } from "@/lib/utils";

const STEP_LABELS: Record<RetroStep, string> = {
  write: "Writing",
  vote: "Voting",
  discuss: "Discussing",
  done: "Done",
};

/**
 * The person's retros, newest first, in the same cards as the poker
 * sessions: where each one got to, its columns, and its action items.
 */
export function RetrosContent() {
  const { isAuthenticated } = useAuth();
  const retros = useQuery(api.retro.listMine, isAuthenticated ? {} : "skip");

  return (
    <>
      <DashboardHeader title="Retros" showDateRange={false} />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Your Retros</h2>
            <p className="mt-1 text-sm text-muted-foreground">Every retro you joined. Open action items follow each one into the next.</p>
          </div>
          <Button render={<Link href="/retro/new" />} nativeButton={false} className="shrink-0">
            <Plus className="size-4" />
            New retro
          </Button>
        </div>

        {retros === undefined ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[190px] animate-pulse rounded-2xl border bg-card p-5">
                <div className="mb-4 h-6 w-2/3 rounded-md bg-muted" />
                <div className="h-4 w-1/2 rounded-md bg-muted" />
              </div>
            ))}
          </div>
        ) : retros.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <StickyNote className="size-6 text-primary" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">No retros yet</h2>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Open a board, share the link, and let the team write. Stickies stay face-down until you reveal them.
            </p>
            <Button render={<Link href="/retro/new" />} nativeButton={false}>
              Start a retro
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="retro-list">
            {retros.map((retro) => (
              <Link
                key={retro.roomId}
                href={`/room/${retro.roomId}`}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-card p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-md"
                data-testid="retro-card"
              >
                <div className="relative z-10 mb-5">
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div className="flex -space-x-1.5" aria-hidden="true">
                      {retro.columns.slice(0, 4).map((column) => (
                        <span
                          key={column.id}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-lg border-2 text-base shadow-sm",
                            STICKY_TONES[column.color].paper
                          )}
                        >
                          {column.emoji}
                        </span>
                      ))}
                    </div>
                    <Badge variant={retro.step === "done" ? "default" : "secondary"} className="font-medium">
                      {STEP_LABELS[retro.step]}
                    </Badge>
                  </div>
                  <h3 className="line-clamp-2 text-lg leading-tight font-semibold transition-colors group-hover:text-primary">
                    {retro.name}
                  </h3>
                </div>

                <div className="relative z-10 mt-auto">
                  <div className="mb-4 flex items-center gap-1.5 border-b border-border/50 pb-4 text-sm">
                    <CircleCheckBig className="size-4 text-emerald-600 dark:text-emerald-400" />
                    {retro.openActions + retro.doneActions === 0 ? (
                      <span className="text-muted-foreground">No action items</span>
                    ) : (
                      <span>
                        <span className="font-medium">{retro.openActions}</span>
                        <span className="text-muted-foreground"> open · </span>
                        <span className="font-medium">{retro.doneActions}</span>
                        <span className="text-muted-foreground"> done</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center">
                      <Clock className="mr-1.5 size-3.5" />
                      {formatDistanceToNow(retro.lastActivityAt, { addSuffix: true })}
                    </span>
                    {!retro.retained && <span title="Guest retros go after 5 quiet days">Guest</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
