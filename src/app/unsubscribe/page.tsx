import { Metadata } from "next";
import { Suspense } from "react";
import { UnsubscribeContent } from "./unsubscribe-content";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeContent />
    </Suspense>
  );
}
