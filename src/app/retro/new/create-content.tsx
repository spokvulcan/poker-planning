"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
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
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { generateGuestName } from "@/lib/guest-names";
import { tintClasses } from "@/components/retro/tints";
import {
  DEFAULT_RETRO_FORMAT,
  RETRO_FORMATS,
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
  RETRO_NAME_DESCRIPTION,
  RETRO_NAME_LABEL,
  RETRO_NAME_PLACEHOLDER,
  defaultRetroName,
} from "@/convex/retroCopy";

/** A `<input type="date">` value as the end of that local day, or undefined. */
function parseCollectUntil(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}

function PromptList({ format }: { format: RetroFormat }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {format.prompts.map((prompt) => (
        <li
          key={prompt.id}
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-medium",
            tintClasses(prompt.color).zone,
            tintClasses(prompt.color).label
          )}
        >
          {prompt.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * `/retro/new` (spec §6.1): name, format and an optional cards-due date.
 * The format opens pre-selected and collapsed to one line; expanding shows
 * the six-format library with its picker lines and prompts. Editing a format
 * before stamping is #290; the team picker is #289. Anyone, anonymous
 * included, creates a teamless retro.
 */
export function CreateRetroContent() {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<RetroFormat>(DEFAULT_RETRO_FORMAT);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [collectUntil, setCollectUntil] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const createRetro = useMutation(api.retro.create);
  const ensureGlobalUser = useMutation(api.users.ensureGlobalUser);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);

    // Ensure a session exists before creating; a retro room always has an owner.
    if (!isAuthenticated) {
      try {
        const result = await authClient.signIn.anonymous();
        if (result.error) {
          toast.error(result.error.message || "Failed to create session. Please try again.");
          setIsCreating(false);
          return;
        }
        const newAuthUserId = result.data?.user?.id;
        if (newAuthUserId) {
          await ensureGlobalUser({ authUserId: newAuthUserId, name: generateGuestName() });
        }
      } catch {
        toast.error("Failed to create session. Please try again.");
        setIsCreating(false);
        return;
      }
    }

    try {
      const due = parseCollectUntil(collectUntil);
      const roomId = await createRetro({
        name: name.trim() || defaultRetroName(new Date()),
        formatName: format.name,
        ...(due !== undefined ? { collectUntil: due } : {}),
      });
      router.push(`/room/${roomId}`);
    } catch (error) {
      console.error("Failed to create retro:", error);
      toast.error(CREATE_RETRO_FAILED);
      setIsCreating(false);
    }
  }, [isAuthenticated, ensureGlobalUser, collectUntil, createRetro, name, format, router]);

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

                  <Field>
                    <FieldLabel>{FORMAT_LABEL}</FieldLabel>
                    {libraryOpen ? (
                      <div data-testid="format-library" className="space-y-2">
                        {RETRO_FORMATS.map((entry) => {
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
                                  onChange={() => setFormat(entry)}
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
                  disabled={isCreating || authLoading}
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
    </div>
  );
}
