"use client";

import { audioTracks } from "@/lib/smartbox-constants";

export function AudioMap() {
  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      {audioTracks.map((track) => (
        <div key={track.id} className="flex justify-between items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-colors duration-150 hover:bg-slate-50">
          <div className="min-w-0 flex-1">
            <span className="block font-mono font-bold text-slate-400 text-xs">Track {track.id.toString().padStart(4, "0")}</span>
            <span className="block font-semibold text-slate-800 truncate" title={track.label}>{track.label}</span>
          </div>
          <span className="text-right text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0 self-center">{track.use}</span>
        </div>
      ))}
    </div>
  );
}
