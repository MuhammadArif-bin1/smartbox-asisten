"use client";

import { useEffect, useState } from "react";

export function LiveClockCard({ online, rtcReady }: { online: boolean; rtcReady: boolean }) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => { setCurrentTime(new Date()); }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!currentTime) return null;

  const timeFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const timeString = timeFormatter.format(currentTime);
  const dateString = dateFormatter.format(currentTime);
  const isSync = online && rtcReady;

  return (
    <div className="rounded-3xl bg-slate-950 border-4 border-slate-900 p-8 text-blue-400 font-mono shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[220px] transition-all hover:border-slate-800">
      {/* Decorative Radial Background and Glowing Orbs */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="absolute -left-20 -top-20 w-48 h-48 rounded-full bg-blue-500/10 blur-[80px] pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 w-48 h-48 rounded-full bg-blue-600/10 blur-[80px] pointer-events-none" />

      <div className="z-10 flex flex-col items-center">
        {/* Status Badge */}
        <div className={`mb-4 flex items-center gap-2 self-center text-xs border px-4 py-1.5 rounded-full transition-all duration-300 ${
          isSync 
            ? "border-blue-500/30 bg-blue-950/40 text-blue-300" 
            : "border-amber-500/30 bg-amber-950/40 text-amber-300"
        }`}>
          <span className={`h-2.5 w-2.5 rounded-full ${
            isSync ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse" : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse"
          }`} />
          <span className="text-xs uppercase font-extrabold tracking-widest">
            {isSync ? "RTC / LCD I2C Terhubung" : "Menggunakan Waktu Sistem Web"}
          </span>
        </div>

        {/* Digital Time */}
        <h2 className="text-5xl sm:text-7xl font-black tracking-widest text-blue-300 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)] transition-all">
          {timeString}
        </h2>

        {/* Date Display */}
        <p className="mt-4 text-base sm:text-lg font-bold text-blue-400/80 text-center tracking-wide">
          {dateString} <span className="text-blue-500/60 font-semibold">•</span> Asia/Jakarta (WIB)
        </p>
      </div>
    </div>
  );
}
