"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** One picture in a marketing animation. */
export interface Frame<T> {
  /** What the animation draws from: a phase, a flag, a few values. */
  show: T;
  /** How long it stays up, in milliseconds. */
  hold: number;
}

/** A scene's frames in the order it shows them; the last is where it ends. */
export type Scene<T> = readonly Frame<T>[];

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotionSetting(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Plays a scene: shows each frame for its hold, in order, then starts over.
 * Unmounting stops it with nothing left scheduled.
 *
 * A visitor who prefers reduced motion sees only the final frame, held, and
 * nothing is scheduled; turning the setting on mid-scene jumps there. The
 * server can't know the setting, so it renders the first frame.
 */
export function useLoopingScene<T>(scene: Scene<T>): T {
  const reduceMotion = useSyncExternalStore(
    subscribeToMotionSetting,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const [index, setIndex] = useState(0);
  // The frame the timers are on, so a restarted effect picks up where it was.
  const cursor = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    let timer = setTimeout(function advance() {
      cursor.current = (cursor.current + 1) % scene.length;
      setIndex(cursor.current);
      timer = setTimeout(advance, scene[cursor.current].hold);
    }, scene[cursor.current % scene.length].hold);
    return () => clearTimeout(timer);
  }, [scene, reduceMotion]);

  return scene[reduceMotion ? scene.length - 1 : index % scene.length].show;
}
