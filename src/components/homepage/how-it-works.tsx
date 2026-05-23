"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

function CreateRoomAnimation() {
  const [text, setText] = useState("");
  const [clicked, setClicked] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while (isMounted) {
        setText("");
        setClicked(false);
        setCreated(false);
        
        await new Promise(r => setTimeout(r, 800));
        if(!isMounted) break;
        
        const str = "Sprint 42 Planning";
        for(let i=1; i<=str.length; i++) {
          setText(str.slice(0, i));
          await new Promise(r => setTimeout(r, 60)); // Typing speed
        }
        await new Promise(r => setTimeout(r, 400));
        if(!isMounted) break;
        
        setClicked(true);
        await new Promise(r => setTimeout(r, 150));
        if(!isMounted) break;
        
        setClicked(false);
        setCreated(true);
        await new Promise(r => setTimeout(r, 2500));
      }
    };
    play();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="w-full max-w-[260px] bg-white dark:bg-zinc-950 rounded-xl shadow-lg border border-gray-100 dark:border-zinc-800 p-5">
      {created ? (
        <div className="flex flex-col items-center justify-center py-5 animate-in fade-in zoom-in duration-300">
           <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
             <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
           </div>
           <p className="text-sm font-medium text-gray-900 dark:text-white">Room Created!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-in fade-in duration-300">
          <div className="h-3 w-20 bg-gray-100 dark:bg-zinc-800 rounded"></div>
          <div className="h-10 w-full bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg flex items-center px-3 text-sm text-gray-600 dark:text-gray-300">
            {text}
            <span className="w-[2px] h-4 bg-primary animate-pulse ml-1"></span>
          </div>
          <div className={`h-10 w-full bg-primary text-primary-foreground rounded-lg flex items-center justify-center text-sm font-medium transition-transform ${clicked ? 'scale-95' : 'scale-100'}`}>
            Start Session
          </div>
        </div>
      )}
    </div>
  )
}

function InviteTeamAnimation() {
  const [avatars, setAvatars] = useState<number[]>([]);
  
  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while(isMounted) {
        setAvatars([]);
        await new Promise(r => setTimeout(r, 1000));
        if(!isMounted) break;
        
        setAvatars([1]);
        await new Promise(r => setTimeout(r, 500));
        if(!isMounted) break;

        setAvatars([1, 2]);
        await new Promise(r => setTimeout(r, 700));
        if(!isMounted) break;

        setAvatars([1, 2, 3]);
        await new Promise(r => setTimeout(r, 2500));
      }
    };
    play();
    return () => { isMounted = false; };
  }, []);

  const colors = [
    "bg-blue-500 text-blue-50", 
    "bg-purple-500 text-purple-50", 
    "bg-orange-500 text-orange-50"
  ];
  const initials = ["JS", "AL", "MK"];

  return (
    <div className="w-full flex flex-col items-center justify-center gap-6 h-full">
      <div className="flex -space-x-4">
        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center z-10 shadow-sm">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">You</span>
        </div>
        {avatars.map((a, i) => (
          <div 
            key={a} 
            className={`w-12 h-12 rounded-full ${colors[i]} border-2 border-white dark:border-zinc-900 flex items-center justify-center shadow-sm animate-in fade-in zoom-in slide-in-from-bottom-4 duration-300`} 
            style={{ zIndex: 10 - a }}
          >
            <span className="text-xs font-medium">{initials[i]}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm px-4 py-2 rounded-full border border-gray-200 dark:border-zinc-800 text-xs font-medium text-gray-600 dark:text-gray-400 shadow-sm">
        <Loader2 className="w-3 h-3 animate-spin text-primary" /> Waiting for others...
      </div>
    </div>
  )
}

function EstimateAnimation() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while(isMounted) {
        setHovered(null);
        setSelected(null);
        await new Promise(r => setTimeout(r, 1000));
        if(!isMounted) break;
        
        setHovered(2); // The card '3'
        await new Promise(r => setTimeout(r, 400));
        if(!isMounted) break;
        
        setSelected(2);
        await new Promise(r => setTimeout(r, 2500));
      }
    }
    play();
    return () => { isMounted = false; };
  }, []);

  const cards = [1, 2, 3, 5];

  return (
    <div className="w-full flex items-center justify-center h-full">
      <div className="flex gap-2 sm:gap-3">
        {cards.map((c, i) => (
          <div 
            key={c}
            className={`w-12 h-16 sm:w-14 sm:h-20 rounded-xl flex items-center justify-center font-bold text-lg sm:text-xl transition-all duration-300
              ${selected === i 
                ? 'bg-primary text-primary-foreground -translate-y-4 shadow-xl scale-110' 
                : hovered === i 
                  ? 'bg-white dark:bg-zinc-800 text-primary -translate-y-2 shadow-lg border border-primary/30'
                  : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 shadow-sm'
              }
            `}
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  )
}

function AlignAnimation() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const play = async () => {
      while(isMounted) {
        setRevealed(false);
        await new Promise(r => setTimeout(r, 1500));
        if(!isMounted) break;
        
        setRevealed(true);
        await new Promise(r => setTimeout(r, 3500));
      }
    }
    play();
    return () => { isMounted = false; };
  }, []);

  const votes = [5, 5, 8, 5];

  return (
    <div className="w-full flex flex-col items-center justify-center gap-6 h-full">
      <div className="flex gap-3 sm:gap-4 [perspective:1000px]">
        {votes.map((v, i) => (
          <div key={i} className="relative w-12 h-16 sm:w-16 sm:h-24">
            <div className={`w-full h-full transition-transform duration-700 [transform-style:preserve-3d] ${revealed ? '[transform:rotateY(180deg)]' : ''}`}>
              {/* Front (Hidden) */}
              <div className="absolute inset-0 [backface-visibility:hidden] bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 border border-primary/30 rounded-xl flex items-center justify-center shadow-sm">
                <div className="w-6 h-8 sm:w-8 sm:h-12 border-2 border-primary/20 rounded-md opacity-50"></div>
              </div>
              {/* Back (Revealed) */}
              <div className="absolute inset-0 [backface-visibility:hidden] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl flex items-center justify-center font-bold text-2xl sm:text-3xl text-gray-900 dark:text-white [transform:rotateY(180deg)] shadow-lg">
                {v}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className={`transition-all duration-500 delay-300 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="px-5 py-2.5 bg-white dark:bg-zinc-800/90 backdrop-blur-md rounded-full border border-gray-200 dark:border-zinc-700 flex items-center gap-3 shadow-xl">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Consensus:</span>
          <span className="font-bold text-xl text-primary">5</span>
        </div>
      </div>
    </div>
  )
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 sm:py-32 bg-surface-1 dark:bg-black overflow-hidden border-t border-b border-gray-100 dark:border-zinc-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 max-w-2xl">
          <h2 className="text-sm font-bold tracking-widest text-primary uppercase mb-6">
            HOW IT WORKS
          </h2>
          <p className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-6">
            A refined workflow for<br />
            <span className="text-primary text-opacity-80">agile consensus.</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-auto md:auto-rows-[380px]">
          {/* Main feature - spanning 2 columns */}
          <div className="md:col-span-2 relative bg-surface-2 dark:bg-zinc-900 rounded-3xl p-8 sm:p-10 border border-gray-200 dark:border-zinc-800 overflow-hidden group flex flex-col md:flex-row gap-8">
            <div className="relative z-10 flex flex-col justify-between flex-1">
              <div className="w-12 h-12 bg-white dark:bg-black rounded-xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-zinc-800">
                <span className="text-lg font-bold text-gray-900 dark:text-white">01</span>
              </div>
              <div className="mt-8 md:mt-0">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Create Room Instantly</h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md leading-relaxed">
                  Start a session with zero configuration. No sign-up required, no passwords to remember. Just click and go.
                </p>
              </div>
            </div>
            
            <div className="relative z-10 flex-1 flex items-center justify-center lg:justify-end">
              <CreateRoomAnimation />
            </div>
          </div>

          {/* Feature 2 */}
          <div className="relative bg-status-info-bg dark:bg-zinc-900/50 rounded-3xl p-8 sm:p-10 border border-status-info-bg dark:border-zinc-800 overflow-hidden group flex flex-col min-h-[350px] md:min-h-0">
            <div className="flex justify-between items-start mb-6 z-10">
              <div className="w-10 h-10 bg-white dark:bg-black rounded-xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-zinc-800">
                <span className="text-base font-bold text-gray-900 dark:text-white">02</span>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center -mx-4 z-10">
              <InviteTeamAnimation />
            </div>
            <div className="mt-6 z-10">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Invite Team</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Share the secure link. Members join from any browser.
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="relative bg-surface-3 dark:bg-zinc-900/80 rounded-3xl p-8 sm:p-10 border border-gray-200 dark:border-zinc-800 overflow-hidden group flex flex-col min-h-[350px] md:min-h-0">
            <div className="flex justify-between items-start mb-6 z-10">
              <div className="w-10 h-10 bg-white dark:bg-black rounded-xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-zinc-800">
                <span className="text-base font-bold text-gray-900 dark:text-white">03</span>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center z-10">
              <EstimateAnimation />
            </div>
            <div className="mt-6 z-10">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Estimate</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Simultaneous voting to eliminate anchoring bias.
              </p>
            </div>
          </div>

          {/* Feature 4 - spanning 2 columns */}
          <div className="md:col-span-2 relative bg-gray-900 dark:bg-zinc-900 rounded-3xl p-8 sm:p-10 border border-gray-800 overflow-hidden group flex flex-col md:flex-row gap-8">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-900 to-gray-800 dark:from-zinc-900 dark:to-zinc-800 z-0" />
            
            <div className="relative z-10 flex flex-col justify-between flex-1">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10">
                  <span className="text-lg font-bold text-white">04</span>
                </div>
              </div>
              <div className="mt-8 md:mt-0">
                <h3 className="text-2xl font-bold text-white mb-3">Align & Conquer</h3>
                <p className="text-gray-400 max-w-md leading-relaxed">
                  Reveal votes, discuss discrepancies, and establish consensus faster than ever before.
                </p>
              </div>
            </div>

            <div className="relative z-10 flex-1 flex items-center justify-center">
               <AlignAnimation />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}