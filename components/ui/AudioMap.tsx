"use client";

import { audioTracks } from "@/lib/smartbox-constants";

export function AudioMap() {
  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      {audioTracks.map((track) => (
        <div key={track.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-colors duration-150 hover:bg-slate-50">
          <span className="min-w-0 truncate font-semibold text-slate-800">{track.name}</span>
          <span className="text-right text-slate-500">{track.use}</span>
        </div>
      ))}
    </div>
  );
}
