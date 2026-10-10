"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export function RealtimeVotingAnimation() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        setHovered(null);
        setSelected(null);
        await new Promise((r) => setTimeout(r, 1000));
        if (!isMounted) break;

        setHovered(2); // Card '5'
        await new Promise((r) => setTimeout(r, 400));
        if (!isMounted) break;

        setSelected(2);
        await new Promise((r) => setTimeout(r, 2500));
      }
    };
    play();
    return () => {
      isMounted = false;
    };
  }, []);

  const cards = [1, 3, 5, 8];

  return (
    <div className="absolute inset-0 flex items-end justify-center pr-0 pb-4 sm:pb-16 pointer-events-none">
      <div className="absolute right-1/4 bottom-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="flex gap-4 sm:gap-8 z-10 translate-y-2 sm:translate-y-4 opacity-90">
        {cards.map((c, i) => (
          <div
            key={c}
            className={`w-16 h-24 sm:w-28 sm:h-40 rounded-2xl flex items-center justify-center font-bold text-2xl sm:text-5xl transition-all duration-300
              ${
                selected === i
                  ? "bg-primary text-primary-foreground -translate-y-8 shadow-2xl scale-110"
                  : hovered === i
                  ? "bg-white dark:bg-zinc-800 text-primary -translate-y-4 shadow-xl border border-primary/30"
                  : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 shadow-md"
              }
            `}
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsAnimation() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        setRevealed(false);
        await new Promise((r) => setTimeout(r, 1000));
        if (!isMounted) break;

        setRevealed(true);
        await new Promise((r) => setTimeout(r, 3500));
      }
    };
    play();
    return () => {
      isMounted = false;
    };
  }, []);

  const bars = [
    { height: "h-6", target: "h-12", value: "3" },
    { height: "h-6", target: "h-24", value: "5", active: true },
    { height: "h-6", target: "h-16", value: "8" },
    { height: "h-6", target: "h-8", value: "13" },
  ];

  return (
    <div className="absolute inset-0 flex items-end justify-center pr-0 pb-4 sm:pb-10 pointer-events-none">
      <div className="absolute right-1/4 bottom-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl"></div>
      <div className="flex items-end gap-8 sm:gap-16 z-10 opacity-90 translate-y-4 w-full px-12 sm:px-24 justify-center">
        {bars.map((bar, i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <div className="w-12 sm:w-20 bg-white dark:bg-zinc-800 rounded-t-xl border-t border-x border-gray-200 dark:border-zinc-700 flex flex-col justify-end overflow-hidden shadow-sm">
              <div
                className={`w-full transition-all duration-1000 ease-out ${
                  revealed ? bar.target : bar.height
                } ${
                  bar.active
                    ? "bg-emerald-500"
                    : "bg-gray-200 dark:bg-zinc-700"
                }`}
              ></div>
            </div>
            <span className="text-sm font-bold text-gray-500">{bar.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JiraIntegrationAnimation() {
  const [phase, setPhase] = useState<"idle" | "import" | "sync" | "done">("idle");

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        setPhase("idle");
        await new Promise((r) => setTimeout(r, 1000));
        if (!isMounted) break;

        setPhase("import");
        await new Promise((r) => setTimeout(r, 1200));
        if (!isMounted) break;

        setPhase("sync");
        await new Promise((r) => setTimeout(r, 1200));
        if (!isMounted) break;

        setPhase("done");
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    play();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="absolute inset-0 flex items-end justify-center pb-4 sm:pb-8 pointer-events-none">
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
      <div className="flex items-center gap-4 sm:gap-6 z-10">
        {/* Jira stack */}
        <div className="flex flex-col gap-1.5">
          <div className="w-20 h-7 sm:w-24 sm:h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-800/50 flex items-center px-2 gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
            <div className="h-1.5 w-10 bg-blue-200 dark:bg-blue-800 rounded"></div>
          </div>
          <div className="w-20 h-7 sm:w-24 sm:h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-800/50 flex items-center px-2 gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
            <div className="h-1.5 w-8 bg-blue-200 dark:bg-blue-800 rounded"></div>
          </div>
        </div>

        {/* Arrow / sync area */}
        <div className="flex flex-col items-center gap-1">
          <div className={`text-xs font-bold transition-all duration-500 ${phase === "import" ? "text-blue-500 opacity-100 translate-x-2" : phase === "sync" ? "text-indigo-500 opacity-100 -translate-x-2" : "opacity-0"}`}>
            {phase === "import" ? "→" : "←"}
          </div>
          <div className={`w-8 h-0.5 rounded transition-all duration-500 ${phase === "import" ? "bg-blue-400 scale-x-100" : phase === "sync" ? "bg-indigo-400 scale-x-100" : "bg-gray-200 dark:bg-zinc-700 scale-x-50"}`}></div>
        </div>

        {/* AgileKit stack */}
        <div className="flex flex-col gap-1.5">
          <div className={`w-20 h-7 sm:w-24 sm:h-8 rounded-lg border flex items-center px-2 gap-1.5 transition-all duration-500 ${phase === "done" ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-800/50" : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"}`}>
            <div className="h-1.5 w-10 bg-gray-200 dark:bg-zinc-700 rounded"></div>
            {phase === "done" && <Check className="w-3 h-3 text-green-500" />}
          </div>
          <div className={`w-20 h-7 sm:w-24 sm:h-8 rounded-lg border flex items-center px-2 gap-1.5 transition-all duration-500 ${phase === "sync" || phase === "done" ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-800/50" : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"}`}>
            {(phase === "sync" || phase === "done") && <span className="text-[10px] font-bold text-indigo-500">5 SP</span>}
            <div className="h-1.5 w-8 bg-gray-200 dark:bg-zinc-700 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CanvasAnimation() {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        setPos({ x: 0, y: 0 });
        await new Promise((r) => setTimeout(r, 1000));
        if (!isMounted) break;

        setPos({ x: -20, y: -30 });
        await new Promise((r) => setTimeout(r, 800));
        if (!isMounted) break;

        setPos({ x: -40, y: -10 });
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    play();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="absolute inset-0 flex items-end justify-center sm:justify-end pr-0 sm:pr-8 pb-4 sm:pb-8 pointer-events-none">
      <div className="absolute right-0 bottom-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl"></div>
      <div 
        className="w-32 h-20 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-cyan-200 dark:border-cyan-900/50 flex flex-col justify-between p-3 transition-transform duration-700 ease-in-out z-10"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      >
        <div className="h-2 w-12 bg-cyan-100 dark:bg-cyan-900/50 rounded"></div>
        <div className="flex justify-between items-end">
          <div className="w-6 h-6 rounded-full bg-cyan-500 text-[10px] text-white flex items-center justify-center font-bold">5</div>
          <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-zinc-700"></div>
        </div>
      </div>
      
      {/* Background dots grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
    </div>
  );
}

export function ScalesAnimation() {
  const [scaleIdx, setScaleIdx] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!isMounted) break;
        setScaleIdx((prev) => (prev + 1) % 3);
      }
    };
    play();
    return () => {
      isMounted = false;
    };
  }, []);

  const scales = [
    ["1", "2", "3", "5", "8"],
    ["XS", "S", "M", "L", "XL"],
    ["1", "2", "4", "8", "16"],
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center sm:items-end sm:justify-end pr-0 sm:pr-8 pb-0 sm:pb-8 pointer-events-none">
      <div className="absolute right-0 bottom-0 w-48 h-48 bg-orange-500/5 rounded-full blur-3xl"></div>
      <div className="flex gap-2 z-10 opacity-90">
        {scales[scaleIdx].map((val, i) => (
          <div
            key={i + val} // Key changes to force animation
            className="w-10 h-14 bg-white dark:bg-zinc-800 rounded-lg flex items-center justify-center font-bold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 shadow-sm animate-in zoom-in fade-in duration-300"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {val}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TimeToConsensusAnimation() {
  const [seconds, setSeconds] = useState(0);
  const [dots, setDots] = useState<boolean[]>([false, false, false, false]);
  const [consensus, setConsensus] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        setSeconds(0);
        setDots([false, false, false, false]);
        setConsensus(false);
        await new Promise((r) => setTimeout(r, 800));
        if (!isMounted) break;

        for (let s = 1; s <= 12; s++) {
          if (!isMounted) break;
          setSeconds(s);
          if (s === 3) setDots([true, false, false, false]);
          if (s === 6) setDots([true, true, false, false]);
          if (s === 8) setDots([true, true, true, false]);
          if (s === 11) setDots([true, true, true, true]);
          await new Promise((r) => setTimeout(r, 150));
        }
        if (!isMounted) break;

        setConsensus(true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    };
    play();
    return () => { isMounted = false; };
  }, []);

  const formatTime = (s: number) => `0:${s.toString().padStart(2, "0")}`;

  return (
    <div className="absolute inset-0 flex items-end justify-center pb-4 sm:pb-8 pointer-events-none">
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl"></div>
      <div className="flex flex-col items-center gap-3 z-10">
        <span className={`text-3xl sm:text-4xl font-bold font-mono transition-colors duration-300 ${consensus ? "text-green-500" : "text-rose-500"}`}>
          {formatTime(seconds)}
        </span>
        <div className="flex gap-2">
          {dots.map((filled, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${filled ? (consensus ? "bg-green-500 scale-110" : "bg-rose-400") : "bg-gray-200 dark:bg-zinc-700"}`}
            ></div>
          ))}
        </div>
        <span className={`text-xs font-bold uppercase tracking-widest transition-all duration-500 ${consensus ? "text-green-500 opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
          Consensus
        </span>
      </div>
    </div>
  );
}

export function IssuesAnimation() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!isMounted) break;
        setActive((prev) => (prev + 1) % 3);
      }
    };
    play();
    return () => {
      isMounted = false;
    };
  }, []);

  const issues = ["PROJ-123", "PROJ-124", "PROJ-125"];

  return (
    <div className="absolute inset-0 flex items-end justify-center sm:justify-end pr-0 sm:pr-8 pb-4 sm:pb-8 pointer-events-none">
      <div className="absolute right-0 bottom-0 w-48 h-48 bg-sky-500/5 rounded-full blur-3xl"></div>
      <div className="flex flex-col gap-2 z-10 w-48">
        {issues.map((issue, i) => (
          <div
            key={issue}
            className={`h-10 rounded-lg flex items-center px-3 gap-3 transition-all duration-500 border shadow-sm
              ${
                active === i
                  ? "bg-white dark:bg-zinc-800 border-sky-200 dark:border-sky-900/50 scale-105"
                  : "bg-white/60 dark:bg-zinc-800/60 border-gray-100 dark:border-zinc-800/50 scale-100 opacity-60"
              }
            `}
          >
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${active === i ? "border-sky-500 bg-sky-500 text-white" : "border-gray-300 dark:border-zinc-600"}`}>
              {active === i && <Check className="w-3 h-3" />}
            </div>
            <div className="h-2 w-16 bg-gray-200 dark:bg-zinc-700 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VoterAlignmentAnimation() {
  const [phase, setPhase] = useState<"scattered" | "converging" | "aligned">("scattered");

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        setPhase("scattered");
        await new Promise((r) => setTimeout(r, 1200));
        if (!isMounted) break;

        setPhase("converging");
        await new Promise((r) => setTimeout(r, 1000));
        if (!isMounted) break;

        setPhase("aligned");
        await new Promise((r) => setTimeout(r, 2500));
      }
    };
    play();
    return () => { isMounted = false; };
  }, []);

  const scattered = [
    { top: "12%", left: "10%" },
    { top: "8%", left: "78%" },
    { top: "70%", left: "5%" },
    { top: "75%", left: "85%" },
    { top: "40%", left: "90%" },
    { top: "65%", left: "45%" },
  ];

  const center = { top: "42%", left: "46%" };

  const getPos = (i: number) => {
    if (phase === "aligned") return center;
    if (phase === "converging") {
      const s = scattered[i];
      return {
        top: `${(parseFloat(s.top) + parseFloat(center.top)) / 2}%`,
        left: `${(parseFloat(s.left) + parseFloat(center.left)) / 2}%`,
      };
    }
    return scattered[i];
  };

  return (
    <div className="absolute inset-0 flex items-end justify-center pb-4 sm:pb-8 pointer-events-none">
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-48 h-48 bg-fuchsia-500/5 rounded-full blur-3xl"></div>
      <div className="relative w-36 h-28 sm:w-44 sm:h-36 z-10">
        {/* Background grid */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-px opacity-20">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="border border-gray-300 dark:border-zinc-700 rounded-sm"></div>
          ))}
        </div>
        {/* Dots */}
        {scattered.map((_, i) => {
          const pos = getPos(i);
          return (
            <div
              key={i}
              className={`absolute w-3 h-3 rounded-full transition-all duration-700 ease-in-out ${phase === "aligned" ? "bg-green-500 scale-125" : "bg-rose-400"}`}
              style={{ top: pos.top, left: pos.left }}
            ></div>
          );
        })}
      </div>
    </div>
  );
}
