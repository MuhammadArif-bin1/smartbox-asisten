"use client";

import { useEffect, useState } from "react";

export function AutoOffCountdown({ deadline }: { deadline: number }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [deadline]);

  if (secondsLeft <= 0) return null;

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-blue-600">
        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        Mati otomatis dalam {secondsLeft} detik
      </p>
    </div>
  );
}
