"use client";

import { useSearchParams } from "next/navigation";
import { RoomCanvas } from "@/components/room/room-canvas";
import {
  DemoSimulationProvider,
  useDemoSimulation,
} from "@/components/room/demo/DemoSimulationProvider";

/**
 * The /demo page. The Demo simulation runs entirely client-side: the provider
 * drives a local reducer and supplies the room data, so there is no Convex
 * round-trip, no spinner, and no backend cost (ADR-0003).
 */
export function DemoContent() {
  const searchParams = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "true";

  return (
    <DemoSimulationProvider>
      <DemoCanvas isEmbedded={isEmbedded} />
    </DemoSimulationProvider>
  );
}

function DemoCanvas({ isEmbedded }: { isEmbedded: boolean }) {
  const demo = useDemoSimulation();
  if (!demo) return null; // always present inside the provider

  return (
    <div className="relative h-screen bg-white dark:bg-black">
      <RoomCanvas roomData={demo.roomData} isEmbedded={isEmbedded} />
    </div>
  );
}
