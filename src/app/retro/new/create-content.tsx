"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowRight } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NewTeamDialog } from "@/components/team/new-team-dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { tintClasses } from "@/components/retro/tints";
import {
  DEFAULT_RETRO_FORMAT,
  RETRO_FORMATS,
  findFormat,
  type RetroFormat,
} from "@/convex/model/retroFormats";
import {
  COLLECT_UNTIL_DESCRIPTION,
  COLLECT_UNTIL_LABEL,
  CREATE_RETRO_BUTTON,
  CREATE_RETRO_FAILED,
  CREATING_RETRO_BUTTON,
  FORMAT_CHANGE,
  FORMAT_COLLAPSE,
  FORMAT_LABEL,
  NEW_RETRO_DESCRIPTION,
  NEW_RETRO_TITLE,
  NEW_TEAM_OPTION,
  NO_TEAM_OPTION,
  RETRO_NAME_DESCRIPTION,
  RETRO_NAME_LABEL,
  RETRO_NAME_PLACEHOLDER,
  TEAMLESS_DISCLOSURE,
  TEAM_DESCRIPTION,
  TEAM_LABEL,
  defaultRetroName,
  keptByTeam,
} from "@/convex/retroCopy";

/** A `<input type="date">` value as the end of that local day, or undefined. */
function parseCollectUntil(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}

/** The picker's "New team" option value; never a Team id. */
const NEW_TEAM_VALUE = "__new";

function PromptList({ format }: { format: RetroFormat }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {format.prompts.map((prompt) => {
        const tint = tintClasses(prompt.color);
        return (
          <li
            key={prompt.id}
            className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", tint.zone, tint.label)}
          >
            {prompt.label}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * `/retro/new` (spec §6.1): name, team, format and an optional cards-due
 * date. The team picker lists the person's Teams with *New team* and is
 * hidden entirely for an anonymous account, who can only create a teamless
 * retro; `?team=` pre-selects one. The format opens pre-selected — the
 * chosen Team's newest retro's format, else the default — and collapsed to
 * one line; expanding shows the six-format library with the pre-selected
 * format first. The write-time disclosure shows before the retro exists.
 * Editing a format before stamping is #290.
 */
export function CreateRetroContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: authLoading, accountType } = useAuth();
  const ensureSession = useEnsureSession();
  const createRetro = useMutation(api.retro.create);

  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<string>(searchParams.get("team") ?? "");
  /** The person's explicit pick; null means "the pre-selection". */
  const [chosenFormat, setChosenFormat] = useState<RetroFormat | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [collectUntil, setCollectUntil] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamOpen, setNewTeamOpen] = useState(false);

  const isPermanent = accountType === "permanent";
  const myTeams = useQuery(api.teams.listMine, isPermanent ? {} : "skip");
  const selectedTeam = myTeams?.find((team) => team._id === teamId);
  const lastFormat = useQuery(
    api.retro.lastFormat,
    selectedTeam ? { teamId: selectedTeam._id } : "skip"
  );

  // Pre-selection (spec §6.1): the Team's newest retro's format when it is
  // one the library carries, else the default. The edited-copy case (#290)
  // widens this to the stamped format itself.
  const preselected = useMemo(
    () => (lastFormat ? findFormat(lastFormat.name) : undefined) ?? DEFAULT_RETRO_FORMAT,
    [lastFormat]
  );
  const format = chosenFormat ?? preselected;
  const library = useMemo(
    () => [preselected, ...RETRO_FORMATS.filter((entry) => entry.name !== preselected.name)],
    [preselected]
  );

  const handleTeamChange = (value: string) => {
    if (value === NEW_TEAM_VALUE) {
      setNewTeamOpen(true);
      return;
    }
    setTeamId(value);
    // A new Team brings its own pre-selection; a pick made for the old one
    // does not carry over.
    setChosenFormat(null);
  };

  const handleCreate = useCallback(async () => {
    setIsCreating(true);

    // A retro room always has an owner, so the creator needs a session and a
    // users row before the mutation.
    try {
      await ensureSession({ createGlobalUser: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create session. Please try again.");
      setIsCreating(false);
      return;
    }

    try {
      const due = parseCollectUntil(collectUntil);
      const roomId = await createRetro({
        name: name.trim() || defaultRetroName(new Date()),
        formatName: format.name,
        ...(due !== undefined ? { collectUntil: due } : {}),
        ...(selectedTeam ? { teamId: selectedTeam._id } : {}),
      });
      router.push(`/room/${roomId}`);
    } catch (error) {
      console.error("Failed to create retro:", error);
      toast.error(CREATE_RETRO_FAILED);
      setIsCreating(false);
    }
  }, [ensureSession, collectUntil, createRetro, name, format, selectedTeam, router]);

  // A Team named in the URL that the reads have not confirmed yet would be
  // silently dropped; hold the button until they have.
  const teamPending = isPermanent && teamId !== "" && myTeams === undefined;

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Navbar />

      <main className="relative isolate flex-1">
        <div className="pt-28 pb-16 sm:pt-32 sm:pb-24">
          <div className="mx-auto max-w-lg px-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{NEW_RETRO_TITLE}</CardTitle>
                <CardDescription>{NEW_RETRO_DESCRIPTION}</CardDescription>
              </CardHeader>

              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="retro-name">{RETRO_NAME_LABEL}</FieldLabel>
                    <Input
                      id="retro-name"
                      placeholder={RETRO_NAME_PLACEHOLDER}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={100}
                    />
                    <FieldDescription>{RETRO_NAME_DESCRIPTION}</FieldDescription>
                  </Field>

                  {isPermanent && (
                    <Field>
                      <FieldLabel htmlFor="retro-team">{TEAM_LABEL}</FieldLabel>
                      <select
                        id="retro-team"
                        value={selectedTeam ? selectedTeam._id : ""}
                        onChange={(e) => handleTeamChange(e.target.value)}
                        className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                      >
                        <option value="">{NO_TEAM_OPTION}</option>
                        {(myTeams ?? []).map((team) => (
                          <option key={team._id} value={team._id}>
                            {team.name}
                          </option>
                        ))}
                        <option value={NEW_TEAM_VALUE}>{NEW_TEAM_OPTION}</option>
                      </select>
                      <FieldDescription>{TEAM_DESCRIPTION}</FieldDescription>
                    </Field>
                  )}

                  <Field>
                    <FieldLabel>{FORMAT_LABEL}</FieldLabel>
                    {libraryOpen ? (
                      <div data-testid="format-library" className="space-y-2">
                        {library.map((entry) => {
                          const id = `format-${entry.name.replace(/\W+/g, "-").toLowerCase()}`;
                          const selected = entry.name === format.name;
                          return (
                            <label
                              key={entry.name}
                              htmlFor={id}
                              className={cn(
                                "flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors",
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/50"
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  id={id}
                                  type="radio"
                                  name="format"
                                  value={entry.name}
                                  checked={selected}
                                  onChange={() => setChosenFormat(entry)}
                                  aria-label={entry.name}
                                  className="mt-0.5 accent-primary"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium">{entry.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {entry.description}
                                  </div>
                                </div>
                              </div>
                              <div className="pl-6">
                                <PromptList format={entry} />
                              </div>
                            </label>
                          );
                        })}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setLibraryOpen(false)}
                        >
                          {FORMAT_COLLAPSE}
                        </Button>
                      </div>
                    ) : (
                      <div
                        data-testid="format-selected"
                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div className="truncate text-sm font-medium">{format.name}</div>
                          <PromptList format={format} />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setLibraryOpen(true)}
                        >
                          {FORMAT_CHANGE}
                        </Button>
                      </div>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="collect-until">{COLLECT_UNTIL_LABEL}</FieldLabel>
                    <Input
                      id="collect-until"
                      type="date"
                      value={collectUntil}
                      onChange={(e) => setCollectUntil(e.target.value)}
                    />
                    <FieldDescription>{COLLECT_UNTIL_DESCRIPTION}</FieldDescription>
                  </Field>

                  <p
                    data-testid="disclosure"
                    data-kept={selectedTeam ? "team" : "none"}
                    className="text-xs text-muted-foreground"
                  >
                    {selectedTeam ? keptByTeam(selectedTeam.name) : TEAMLESS_DISCLOSURE}
                  </p>
                </FieldGroup>
              </CardContent>

              <CardFooter className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => router.push("/")}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreate}
                  // Wait until the auth state is known: creating while it is
                  // still resolving would trigger a second anonymous sign-in
                  // for a user who already has a session.
                  disabled={isCreating || authLoading || teamPending}
                >
                  {isCreating ? CREATING_RETRO_BUTTON : CREATE_RETRO_BUTTON}
                  {!isCreating && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </main>

      <Footer />

      <NewTeamDialog
        open={newTeamOpen}
        onOpenChange={setNewTeamOpen}
        returnTo="/retro/new"
        onCreated={(id: Id<"teams">) => handleTeamChange(id)}
      />
    </div>
  );
}
