import { Background, BackgroundVariant } from "@xyflow/react";

/**
 * The dots background both boards share (poker and retro): the one place the
 * light and dark stroke tokens are paired.
 */
export function CanvasDotsBackground() {
  return (
    <Background
      variant={BackgroundVariant.Dots}
      gap={20}
      size={1}
      className="*:stroke-gray-300 dark:*:stroke-surface-3"
    />
  );
}
