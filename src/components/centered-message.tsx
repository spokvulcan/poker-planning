/**
 * The full-screen centered title and body the room page shows while it
 * loads, joins, or has nothing to show. One spelling for every branch.
 */
export function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
