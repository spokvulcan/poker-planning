/** What a shell shows in place of its pages until a Convex deployment is set up. */
export function ConvexSetupRequired() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Setup Required</h1>
        <p className="mb-4">Please run the following command to set up Convex:</p>
        <code className="bg-gray-100 p-2 rounded">npx convex dev</code>
        <p className="mt-4">Then add the NEXT_PUBLIC_CONVEX_URL to your .env.local file</p>
      </div>
    </div>
  );
}
