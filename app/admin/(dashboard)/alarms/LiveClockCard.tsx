"use client";

import { useEffect, useState } from "react";

export function LiveClockCard({ online, rtcReady }: { online: boolean; rtcReady: boolean }) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!currentTime) return null;

  // Formatting time in Asia/Jakarta timezone
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const timeString = timeFormatter.format(currentTime);
  const dateString = dateFormatter.format(currentTime);
  const isSync = online && rtcReady;

  return (
    <div className="rounded-3xl bg-slate-950 border-4 border-slate-800 p-6 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[220px]">
      {/* LCD Backlight Glow Effect */}
      <div className="absolute inset-0 bg-blue-950/20 opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05)_50%,transparent_50%)] bg-[length:100%_4px] pointer-events-none" />
      
      {/* LCD Header */}
      <div className="z-10 w-full flex items-center justify-between px-4 mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-bold tracking-widest text-blue-400 uppercase font-mono">LCD 16X2 SIMULATOR</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${isSync ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"}`} />
          <span className={`text-[10px] font-bold tracking-wider font-mono uppercase ${isSync ? "text-emerald-400" : "text-amber-400"}`}>
            {isSync ? "RTC / LCD I2C Sync" : "Menggunakan waktu sistem web"}
          </span>
        </div>
      </div>

      {/* Main Display screen */}
      <div className="z-10 flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-2xl py-6 px-10 w-full max-w-xl shadow-inner relative">
        {/* Glow border */}
        <div className="absolute inset-0 rounded-2xl border border-blue-500/10 pointer-events-none" />
        
        {/* Digital Time digits with digital/LCD style font */}
        <h2 className="text-5xl sm:text-7xl font-bold font-mono tracking-widest text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)] select-none">
          {timeString}
        </h2>

        {/* Date Display */}
        <p className="mt-4 text-sm sm:text-base font-medium text-slate-400 font-mono tracking-wide select-none text-center">
          {dateString} <span className="text-slate-600 font-semibold">•</span> Asia/Jakarta (WIB)
        </p>
      </div>
    </div>
  );
}
