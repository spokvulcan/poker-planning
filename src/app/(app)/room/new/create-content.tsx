"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

import { SESSION_FAILED, useEnsureSession } from "@/hooks/useEnsureSession";
import { CreatePage } from "@/components/create/create-page";
import { ChoiceSection, type Choice } from "@/components/create/choice-section";
import { toast } from "@/lib/toast";
import { failureCopy } from "@/lib/refusal";
import { runAct } from "@/lib/run-act";
import { trackConversion } from "@/lib/analytics";
import { useCopyRoomUrlToClipboard } from "@/hooks/use-copy-room-url-to-clipboard";
import { CUSTOM_DECK, checkPick, type VotingScaleType } from "@/convex/scales";
import { ROOM_NAME } from "@/convex/constants";
import { CustomDeck, PresetDeck } from "./deck-table";
import { useRememberedTimeNodes } from "./use-remembered-time-nodes";
import { Switch } from "@/components/ui/switch";

type ScaleChoice = VotingScaleType | "custom";

const SCALES: readonly Choice<ScaleChoice>[] = [
  { value: "fibonacci", label: "Fibonacci" },
  { value: "standard", label: "Standard" },
  { value: "tshirt", label: "T-shirt" },
  { value: "custom", label: "Custom" },
];

const DESCRIPTIONS: Record<ScaleChoice, string> = {
  fibonacci: "The usual choice. Gaps widen as uncertainty grows.",
  standard: "Fibonacci with half points and round big numbers.",
  tshirt: "Rough sizing for roadmaps and early refinement.",
  custom: `Your own deck: ${CUSTOM_DECK.minCards} to ${CUSTOM_DECK.maxCards} cards, up to ${CUSTOM_DECK.card.maxLength} characters each.`,
};

/**
 * `/room/new`: a name (optional) and the cards to deal, then the board. The
 * name field starts the room on Enter; the cards lie on a table below it.
 */
export function CreateContent() {
  const [roomName, setRoomName] = useState("");
  const [scale, setScale] = useState<ScaleChoice>("fibonacci");
  const [customCards, setCustomCards] = useState<string[]>([]);
  // Whether the custom deck's field takes focus: for a click, not for arrow keys.
  const [focusDeck, setFocusDeck] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  // The time nodes the board shows, remembered for the next room (ADR-0032).
  const [timeNodes, setTimeNodes] = useRememberedTimeNodes();

  const router = useRouter();
  const createRoom = useMutation(api.rooms.create);
  const ensureSession = useEnsureSession();
  const { copyRoomUrlToClipboard } = useCopyRoomUrlToClipboard();

  // What the creator picked, and the deck's one reading of it (convex/scales),
  // asked on every change: the cards the table shows and whether the room can
  // start. Room creation reads the same pick the same way, so what the page
  // shows is what the room stores.
  const pick = useMemo(
    () => (scale === "custom" ? { type: scale, cards: customCards } : { type: scale }),
    [scale, customCards]
  );
  const checked = checkPick(pick);
  const canCreate = !isCreating && checked.ok;

  const handleCreate = useCallback(async () => {
    setIsCreating(true);

    // A guest session, ready in Convex before the create that needs it.
    if (!(await runAct(ensureSession(), SESSION_FAILED))) {
      setIsCreating(false);
      return;
    }

    let roomId: string | undefined = undefined;

    try {
      roomId = await createRoom({
        name: roomName.trim() || `Game ${new Date().toLocaleTimeString()}`,
        roomType: "canvas",
        votingScale: pick,
        timeNodes,
      });
      trackConversion("create_poker_room");
      router.push(`/room/${roomId}`);
    } catch (error) {
      console.error("Failed to create room:", error);
      toast.error(failureCopy(error, "Failed to create room. Please try again."));
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
  }, [roomName, pick, timeNodes, createRoom, ensureSession, router, copyRoomUrlToClipboard]);

  const start = () => void handleCreate();

  return (
    <CreatePage
      ceremony="poker"
      title="What are you estimating?"
      subtitle="Name it and press Enter. You can change the rest on the board."
      quickStart={{
        id: "room-name",
        label: "Room name",
        placeholder: "Sprint 42 planning",
        value: roomName,
        maxLength: ROOM_NAME.maxLength,
        onChange: setRoomName,
        submitLabel: "Start estimating",
        isSubmitting: isCreating,
        canSubmit: canCreate,
        onSubmit: start,
      }}
      caption={
        !checked.ok && !isCreating
          ? "Finish your deck below to start."
          : "No name? It’s named after the time it starts. The invite link is copied for you."
      }
    >
      <ChoiceSection
        id="cards"
        heading="Cards"
        choices={SCALES}
        value={scale}
        onChange={(next, byPointer) => {
          setScale(next);
          setFocusDeck(byPointer);
        }}
        description={DESCRIPTIONS[scale]}
      >
        {scale === "custom" ? (
          <CustomDeck
            deck={checked}
            onChange={setCustomCards}
            autoFocus={focusDeck}
            canStart={canCreate}
            onStart={start}
          />
        ) : (
          <PresetDeck cards={checked.cards} />
        )}
      </ChoiceSection>
      <section aria-labelledby="time-heading" className="mt-14 flex flex-col items-center">
        <h2 id="time-heading" className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Time
        </h2>
        <div className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-3">
          <label className="flex items-center gap-2.5 text-sm">
            <Switch
              checked={timeNodes.timer}
              onCheckedChange={(timer) => setTimeNodes({ ...timeNodes, timer })}
            />
            Timer
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Switch
              checked={timeNodes.sessionTime}
              onCheckedChange={(sessionTime) => setTimeNodes({ ...timeNodes, sessionTime })}
            />
            Session time
          </label>
        </div>
        <p className="mt-3 text-center text-sm text-balance text-muted-foreground">
          Time is tracked either way. Your choice is kept for the next room.
        </p>
      </section>
    </CreatePage>
  );
}
