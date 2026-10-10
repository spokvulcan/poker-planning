import { Metadata } from "next";
import { Suspense } from "react";
import { DemoContent } from "./demo-content";

export const metadata: Metadata = {
  title: "Demo",
  robots: {
    index: false,
    follow: false,
  },
};

function DemoLoading() {
  return (
    <div className="flex items-center justify-center h-screen bg-white dark:bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-gray-500 dark:text-gray-400">Loading demo...</p>
      </div>
    </div>
  );
}

export default function DemoPage() {
  return (
    <Suspense fallback={<DemoLoading />}>
      <DemoContent />
    </Suspense>
  );
}
