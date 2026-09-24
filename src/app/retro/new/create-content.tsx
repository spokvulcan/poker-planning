"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "@/lib/toast";
import { trackConversion } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { useCopyRoomUrlToClipboard } from "@/hooks/use-copy-room-url-to-clipboard";
import { DEFAULT_TEMPLATE_ID, RETRO_TEMPLATES } from "@/convex/retroTemplates";
import { STICKY_TONES } from "@/components/retro/sticky-colors";

/** "Retro, Sep 24": the name a retro gets when nobody types one. */
function defaultRetroName(): string {
  return `Retro, ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/**
 * `/retro/new`: a name (optional) and the columns to start from, then the
 * board. As quick as opening a poker room; everything else is changeable
 * on the board.
 */
export function CreateRetroContent() {
  const router = useRouter();
  const { isLoading: authLoading, accountType } = useAuth();
  const ensureSession = useEnsureSession();
  const createRetro = useMutation(api.retro.create);
  const { copyRoomUrlToClipboard } = useCopyRoomUrlToClipboard();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await ensureSession({ createGlobalUser: true });
      const roomId = await createRetro({ name: name.trim() || defaultRetroName(), templateId });
      trackConversion("create_retro");
      router.push(`/room/${roomId}`);
      try {
        await copyRoomUrlToClipboard(roomId);
      } catch {
        // The link is one click away on the board anyway.
      }
    } catch (error) {
      console.error("Failed to create retro:", error);
      toast.error("Failed to create the retro. Please try again.");
      setIsCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Navbar />

      <main className="relative isolate flex-1">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <svg
            className="absolute inset-0 h-full w-full [mask-image:radial-gradient(100%_100%_at_top_center,white,transparent)] stroke-gray-200 dark:stroke-white/10"
            aria-hidden="true"
          >
            <defs>
              <pattern id="create-retro-pattern" width={200} height={200} x="50%" y={-1} patternUnits="userSpaceOnUse">
                <path d="M100 200V.5M.5 .5H200" fill="none" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" strokeWidth={0} fill="url(#create-retro-pattern)" />
          </svg>
        </div>

        <div className="pt-28 pb-16 sm:pt-32 sm:pb-24">
          <div className="mx-auto max-w-lg px-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">New Retro</CardTitle>
                <CardDescription>A whiteboard for your team to look back on the sprint</CardDescription>
              </CardHeader>

              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="retro-name">Retro Name</FieldLabel>
                    <Input
                      id="retro-name"
                      placeholder="e.g., Sprint 42 Retro"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !isCreating && !authLoading && void handleCreate()}
                    />
                    <FieldDescription>Leave empty for a dated name</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel>Columns</FieldLabel>
                    <div className="mt-1 space-y-3" role="radiogroup" aria-label="Columns">
                      {RETRO_TEMPLATES.map((template) => (
                        <label
                          key={template.id}
                          className={cn(
                            "flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors",
                            templateId === template.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="template"
                              value={template.id}
                              checked={templateId === template.id}
                              onChange={() => setTemplateId(template.id)}
                              className="accent-primary"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium">{template.name}</div>
                              <div className="text-xs text-muted-foreground">{template.description}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pl-6">
                            {template.columns.map((column) => (
                              <span
                                key={column.title}
                                className={cn(
                                  "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs font-medium",
                                  STICKY_TONES[column.color].paper,
                                  STICKY_TONES[column.color].ink
                                )}
                              >
                                <span aria-hidden="true">{column.emoji}</span>
                                {column.title}
                              </span>
                            ))}
                          </div>
                        </label>
                      ))}
                    </div>
                    <FieldDescription>You can rename, add or remove columns on the board</FieldDescription>
                  </Field>
                </FieldGroup>
                <p className="mt-6 text-xs text-muted-foreground" data-testid="retro-retention-note">
                  {accountType === "permanent" ? (
                    "Kept on your account until you delete it."
                  ) : (
                    <>
                      Guest retros are removed after 5 quiet days.{" "}
                      <Link href="/auth/signin?from=/retro/new" className="underline underline-offset-4 hover:text-foreground">
                        Sign in
                      </Link>{" "}
                      to keep yours.
                    </>
                  )}
                </p>
              </CardContent>

              <CardFooter className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => router.push("/")}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={() => void handleCreate()} disabled={isCreating || authLoading}>
                  {isCreating ? "Creating..." : "Start Retro"}
                  {!isCreating && <ArrowRight className="ml-2 size-4" />}
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
