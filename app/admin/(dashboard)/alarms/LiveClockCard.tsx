"use client";

import { useEffect, useState } from "react";

export function LiveClockCard({ online, rtcReady }: { online: boolean; rtcReady: boolean }) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div className="rounded-3xl bg-blue-600 border-4 border-blue-700 p-8 text-black font-mono shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[220px] transition-all hover:border-blue-500">
      {/* Decorative Radial Background and Glowing Orbs */}
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="absolute -left-20 -top-20 w-48 h-48 rounded-full bg-white/10 blur-[80px] pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 w-48 h-48 rounded-full bg-white/10 blur-[80px] pointer-events-none" />

      <div className="z-10 flex flex-col items-center">
        {/* Status Badge */}
        <div className={`mb-4 flex items-center gap-2 self-center text-xs border px-4 py-1.5 rounded-full transition-all duration-300 ${
          isSync 
            ? "border-black/20 bg-black/10 text-black" 
            : "border-amber-900/20 bg-amber-500/20 text-amber-950"
        }`}>
          <span className={`h-2.5 w-2.5 rounded-full ${
            isSync ? "bg-black shadow-[0_0_8px_rgba(0,0,0,0.3)] animate-pulse" : "bg-amber-700 shadow-[0_0_8px_rgba(180,83,9,0.3)] animate-pulse"
          }`} />
          <span className="text-xs uppercase font-extrabold tracking-widest">
            {isSync ? "RTC / LCD I2C Terhubung" : "Menggunakan Waktu Sistem Web"}
          </span>
        </div>

        {/* Digital Time */}
        <h2 className="text-5xl sm:text-7xl font-black tracking-widest text-black drop-shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all">
          {timeString}
        </h2>

        {/* Date Display */}
        <p className="mt-4 text-base sm:text-lg font-bold text-black text-center tracking-wide">
          {dateString} <span className="text-black/60 font-semibold">•</span> Asia/Jakarta (WIB)
        </p>
      </div>
    </div>
  );
}
