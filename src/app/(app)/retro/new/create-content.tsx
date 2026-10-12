"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { signInHref } from "@/components/auth/account";
import { accountKind } from "@/components/auth/viewer";
import { CreatePage } from "@/components/create/create-page";
import { ChoiceSection, type Choice } from "@/components/create/choice-section";
import { toast } from "@/lib/toast";
import { trackConversion } from "@/lib/analytics";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { copyRoomLink } from "@/lib/copy-room-link";
import { ROOM_NAME } from "@/convex/constants";
import { DEFAULT_TEMPLATE_ID, RETRO_TEMPLATES, templateById } from "@/convex/retroTemplates";
import { TemplateBoard } from "./template-board";

/** The control's labels: a template's name, short enough to sit in a row. */
const SHORT_NAMES: Record<string, string> = {
  classic: "Classic",
  "start-stop-continue": "Start · Stop · Continue",
  "mad-sad-glad": "Mad · Sad · Glad",
  "4ls": "4Ls",
  sailboat: "Sailboat",
};

const TEMPLATES: readonly Choice<string>[] = RETRO_TEMPLATES.map((template) => ({
  value: template.id,
  label: SHORT_NAMES[template.id] ?? template.name,
}));

/** "Retro, Sep 24": the name a retro gets when nobody types one. */
function defaultRetroName(): string {
  return `Retro, ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/**
 * `/retro/new`: a name (optional) and the template to start from, then the
 * board. As quick as opening a poker room; everything else is changeable
 * on the board.
 */
export function CreateRetroContent() {
  const router = useRouter();
  const { viewer } = useAuth();
  // A retro a permanent account creates is retained: the five-day sweep leaves it alone
  const isRetained = accountKind(viewer) === "permanent";
  const ensureSession = useEnsureSession();
  const createRetro = useMutation(api.retro.create);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [isCreating, setIsCreating] = useState(false);
  const template = templateById(templateId);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await ensureSession();
      const roomId = await createRetro({ name: name.trim() || defaultRetroName(), templateId });
      trackConversion("create_retro");
      router.push(`/room/${roomId}`);
      // The invite link, copied as the retro opens, in the board chrome's words.
      await copyRoomLink(`/room/${roomId}`, "Retro");
    } catch (error) {
      console.error("Failed to create retro:", error);
      toast.error("Failed to create the retro. Please try again.");
      setIsCreating(false);
    }
  };

  return (
    <CreatePage
      ceremony="retro"
      title="What are you looking back on?"
      subtitle="Name it and press Enter. You can change the rest on the board."
      quickStart={{
        id: "retro-name",
        label: "Retro name",
        placeholder: "Sprint 42 retro",
        value: name,
        maxLength: ROOM_NAME.maxLength,
        onChange: setName,
        submitLabel: "Start retro",
        isSubmitting: isCreating,
        canSubmit: !isCreating,
        onSubmit: () => void handleCreate(),
      }}
      caption={
        <p data-testid="retro-retention-note">
          {isRetained ? (
            "Kept on your account until you delete it."
          ) : (
            <>
              Guest retros are removed after 5 quiet days.{" "}
              <Link href={signInHref("/retro/new")} className="underline underline-offset-4 hover:text-foreground">
                Sign in
              </Link>{" "}
              to keep yours.
            </>
          )}
        </p>
      }
    >
      <ChoiceSection
        id="columns"
        heading="Columns"
        choices={TEMPLATES}
        value={templateId}
        onChange={setTemplateId}
        description={template.description}
      >
        <TemplateBoard template={template} />
      </ChoiceSection>
    </CreatePage>
  );
}
