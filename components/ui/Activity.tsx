"use client";

export function Activity({ label, time }: { label: string; time: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-slate-50 p-4 text-sm transition-colors duration-150 hover:bg-slate-100/80">
      <span className="min-w-0 truncate font-semibold text-slate-700">{label}</span>
      <span className="text-xs font-bold text-slate-400 whitespace-nowrap">{time}</span>
    </div>
  );
}
