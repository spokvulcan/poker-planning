"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Crown, Plus, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { DashboardHeader } from "@/components/dashboard";
import { NewTeamDialog } from "@/components/team/new-team-dialog";
import { HistoryRows } from "@/components/retro/history-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MY_RETROS_EMPTY, MY_RETROS_TITLE } from "@/convex/retroCopy";

/**
 * /dashboard/retros (spec §18.1): the retros the person attended, grouped
 * by Team with teamless ones under "No team" and `collect` retros first, as
 * history rows (spec §17); then the person's Teams with New team, the door
 * to every team page.
 */
export function RetrosContent() {
  const { isAuthenticated } = useAuth();
  const groups = useQuery(api.retro.listMine, isAuthenticated ? {} : "skip");
  const teams = useQuery(api.teams.listMine, isAuthenticated ? {} : "skip");
  const [newTeamOpen, setNewTeamOpen] = useState(false);

  return (
    <>
      <DashboardHeader title="Retros" showDateRange={false} />
      <div className="flex-1 space-y-10 p-6">
        <section className="space-y-6" data-testid="my-retros">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{MY_RETROS_TITLE}</h2>
              <p className="text-sm text-muted-foreground">
                Every retro you have taken part in, kept by its team.
              </p>
            </div>
            <Button render={<Link href="/retro/new" />} nativeButton={false}>
              <Plus className="size-4" />
              New retro
            </Button>
          </div>

          {groups === undefined ? (
            <div className="h-24 animate-pulse rounded-2xl border bg-card" />
          ) : groups.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              {MY_RETROS_EMPTY}
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.teamId ?? "none"} className="space-y-2" data-testid="retro-group">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {group.teamId ? (
                      <Link href={`/team/${group.teamId}`} className="hover:text-foreground">
                        {group.teamName}
                      </Link>
                    ) : (
                      group.teamName
                    )}
                  </h3>
                  <HistoryRows rows={group.retros} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Teams</h2>
              <p className="text-sm text-muted-foreground">
                A team keeps its retros and decides who can read them.
              </p>
            </div>
            <Button onClick={() => setNewTeamOpen(true)} data-testid="new-team-button">
              <Plus className="size-4" />
              New team
            </Button>
          </div>

          {teams === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-2xl border bg-card p-5">
                  <div className="mb-3 h-5 w-2/3 rounded-md bg-muted" />
                  <div className="h-4 w-1/3 rounded-md bg-muted" />
                </div>
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">No teams yet</h3>
              <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                Create a team to keep your retros, or open an invite link a teammate sent you.
              </p>
              <Button onClick={() => setNewTeamOpen(true)}>
                <Plus className="size-4" />
                New team
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="team-list">
              {teams.map((team) => (
                <Link
                  key={team._id}
                  href={`/team/${team._id}`}
                  className="group flex items-center justify-between gap-3 rounded-2xl border bg-card p-5 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{team.name}</p>
                    <Badge variant={team.role === "admin" ? "default" : "secondary"} className="mt-2">
                      {team.role === "admin" && <Crown className="size-3" />}
                      {team.role}
                    </Badge>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <NewTeamDialog open={newTeamOpen} onOpenChange={setNewTeamOpen} returnTo="/dashboard/retros" />
    </>
  );
}
