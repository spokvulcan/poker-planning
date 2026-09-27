import type { ReactNode } from "react";

/**
 * The full-screen centered title and body the room page shows while it
 * loads, joins, or has nothing to show. One spelling for every branch, with
 * an optional way on for a page that is a dead end.
 */
export function CenteredMessage({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{body}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}
