/**
 * Auto-push's one rule, which a mapping's save refuses by and the room's
 * settings hold Save back by, in the same words: a mapping that pushes
 * estimates names the field they are written to, or every reveal would push
 * nothing (CONTEXT.md: Estimate push). Pure, for the server and the browser.
 */
export const AUTO_PUSH_NEEDS_A_FIELD = "Choose the story points field estimates are pushed to, or turn auto-push off.";

/** What stops these push settings from being saved, in the rule's words, or null when nothing does. */
export function autoPushProblem(settings: { autoPushEstimates?: boolean; storyPointsFieldId?: string }): string | null {
  return settings.autoPushEstimates && !settings.storyPointsFieldId?.trim() ? AUTO_PUSH_NEEDS_A_FIELD : null;
}
