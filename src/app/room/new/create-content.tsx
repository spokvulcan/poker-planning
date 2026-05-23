"use client";

import { useState, useCallback } from "react";
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
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import { toast } from "@/lib/toast";
import { useCopyRoomUrlToClipboard } from "@/hooks/use-copy-room-url-to-clipboard";
import {
  VOTING_SCALES,
  VotingScaleType,
  VotingScaleConfig,
  validateCustomScale,
} from "@/lib/voting-scales";
import { cn } from "@/lib/utils";
import { generateGuestName } from "@/lib/guest-names";

const scaleOptions: {
  type: VotingScaleType;
  scale: (typeof VOTING_SCALES)[VotingScaleType];
}[] = [
  { type: "fibonacci", scale: VOTING_SCALES.fibonacci },
  { type: "standard", scale: VOTING_SCALES.standard },
  { type: "tshirt", scale: VOTING_SCALES.tshirt },
];

export function CreateContent() {
  const [roomName, setRoomName] = useState("");
  const [selectedScale, setSelectedScale] = useState<VotingScaleType | "custom">(
    "fibonacci"
  );
  const [customCards, setCustomCards] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const createRoom = useMutation(api.rooms.create);
  const ensureGlobalUser = useMutation(api.users.ensureGlobalUser);
  const { copyRoomUrlToClipboard } = useCopyRoomUrlToClipboard();

  const handleScaleChange = (type: VotingScaleType | "custom") => {
    setSelectedScale(type);
    setCustomError(null);
  };

  const handleCustomCardsChange = (value: string) => {
    setCustomCards(value);
    if (value.trim()) {
      const cards = value
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const validation = validateCustomScale(cards);
      setCustomError(validation.valid ? null : validation.error ?? null);
    } else {
      setCustomError(null);
    }
  };

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    let votingScale: VotingScaleConfig;

    if (selectedScale === "custom") {
      const cards = customCards
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const validation = validateCustomScale(cards);
      if (!validation.valid) {
        setCustomError(validation.error ?? "Invalid scale");
        setIsCreating(false);
        return;
      }
      votingScale = { type: "custom", cards };
    } else {
      votingScale = { type: selectedScale };
    }

    // Ensure user is authenticated before creating a room
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
          await ensureGlobalUser({
            authUserId: newAuthUserId,
            name: generateGuestName(),
          });
        }
      } catch {
        toast.error("Failed to create session. Please try again.");
        setIsCreating(false);
        return;
      }
    }

    let roomId: string | undefined = undefined;

    try {
      roomId = await createRoom({
        name: roomName.trim() || `Game ${new Date().toLocaleTimeString()}`,
        roomType: "canvas",
        votingScale,
      });
      router.push(`/room/${roomId}`);
    } catch (error) {
      console.error("Failed to create room:", error);
      toast.error("Failed to create room. Please try again.");
      setIsCreating(false);
      return;
    }

    if (roomId) {
      try {
        await copyRoomUrlToClipboard(roomId);
      } catch (error) {
        console.error("Failed to copy room URL to clipboard:", error);
      }
    }
  }, [roomName, selectedScale, customCards, createRoom, ensureGlobalUser, router, copyRoomUrlToClipboard, isAuthenticated]);

  const getPreviewCards = (type: VotingScaleType | "custom") => {
    if (type === "custom") {
      if (!customCards.trim()) return ["?", "?", "?"];
      return customCards
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 8);
    }
    return VOTING_SCALES[type].cards.slice(0, 8);
  };

  const isCreateDisabled =
    isCreating ||
    // Wait until the auth state is known. Creating while `isAuthenticated` is
    // still resolving would wrongly trigger a second anonymous sign-in for a
    // user who already has a session (BetterAuth rejects it with a 400).
    authLoading ||
    (selectedScale === "custom" && (!!customError || !customCards.trim()));

  return (
    <div className="bg-white dark:bg-black min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 relative isolate">
        {/* Background pattern */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <svg
            className="absolute inset-0 h-full w-full stroke-gray-200 dark:stroke-white/10 [mask-image:radial-gradient(100%_100%_at_top_center,white,transparent)]"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id="create-pattern"
                width={200}
                height={200}
                x="50%"
                y={-1}
                patternUnits="userSpaceOnUse"
              >
                <path d="M100 200V.5M.5 .5H200" fill="none" />
              </pattern>
            </defs>
            <rect
              width="100%"
              height="100%"
              strokeWidth={0}
              fill="url(#create-pattern)"
            />
          </svg>
        </div>

        <div className="pt-28 pb-16 sm:pt-32 sm:pb-24">
          <div className="mx-auto max-w-lg px-6">
            {/* Form card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Create New Game</CardTitle>
                <CardDescription>
                  Set up your planning poker session
                </CardDescription>
              </CardHeader>

              <CardContent>
                <FieldGroup>
                {/* Room Name Field */}
                <Field>
                  <FieldLabel htmlFor="room-name">Room Name</FieldLabel>
                  <Input
                    id="room-name"
                    placeholder="e.g., Sprint 42 Planning"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                  />
                  <FieldDescription>
                    Leave empty for auto-generated name
                  </FieldDescription>
                </Field>

                {/* Voting Scale Selection */}
                <Field>
                  <FieldLabel>Voting Scale</FieldLabel>
                  <div className="space-y-3 mt-1">
                    {/* Predefined scales */}
                    {scaleOptions.map(({ type, scale }) => (
                      <label
                        key={type}
                        className={cn(
                          "flex flex-col gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedScale === type
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="scale"
                            value={type}
                            checked={selectedScale === type}
                            onChange={() => handleScaleChange(type)}
                            className="accent-primary"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {scale.label}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {scale.description}
                            </div>
                          </div>
                        </div>
                        {/* Card preview */}
                        <div className="flex gap-1 flex-wrap pl-6">
                          {getPreviewCards(type).map((card, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 text-xs font-mono bg-muted rounded"
                            >
                              {card}
                            </span>
                          ))}
                          {VOTING_SCALES[type].cards.length > 8 && (
                            <span className="text-xs text-muted-foreground self-center">
                              +{VOTING_SCALES[type].cards.length - 8}
                            </span>
                          )}
                        </div>
                      </label>
                    ))}

                    {/* Custom scale option */}
                    <label
                      className={cn(
                        "flex flex-col gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedScale === "custom"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="scale"
                          value="custom"
                          checked={selectedScale === "custom"}
                          onChange={() => handleScaleChange("custom")}
                          className="accent-primary"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">Custom Scale</div>
                          <div className="text-xs text-muted-foreground">
                            Define your own card values
                          </div>
                        </div>
                      </div>

                      {selectedScale === "custom" && (
                        <div className="pl-6 space-y-2">
                          <div>
                            <label
                              htmlFor="custom-cards"
                              className="text-xs text-muted-foreground"
                            >
                              Enter card values (comma-separated)
                            </label>
                            <Input
                              id="custom-cards"
                              placeholder="1, 2, 3, 5, 8, ?, ☕"
                              value={customCards}
                              onChange={(e) =>
                                handleCustomCardsChange(e.target.value)
                              }
                              className="mt-1"
                              aria-invalid={!!customError}
                            />
                            {customError && (
                              <FieldError className="mt-1">{customError}</FieldError>
                            )}
                          </div>
                          {/* Custom card preview */}
                          {customCards.trim() && !customError && (
                            <div className="flex gap-1 flex-wrap">
                              {getPreviewCards("custom").map((card, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 text-xs font-mono bg-muted rounded"
                                >
                                  {card}
                                </span>
                              ))}
                              {customCards.split(",").filter((c) => c.trim())
                                .length > 8 && (
                                <span className="text-xs text-muted-foreground self-center">
                                  +
                                  {customCards.split(",").filter((c) => c.trim())
                                    .length - 8}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </label>
                  </div>
                  <FieldDescription>
                    Choose how your team estimates
                  </FieldDescription>
                </Field>
              </FieldGroup>
              </CardContent>

              <CardFooter className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push("/")}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreate}
                  disabled={isCreateDisabled}
                >
                  {isCreating ? "Creating..." : "Create Game"}
                  {!isCreating && <ArrowRight className="h-4 w-4 ml-2" />}
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
