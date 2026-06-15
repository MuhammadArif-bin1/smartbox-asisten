"use client";

export function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:grid sm:grid-cols-[160px_1fr] gap-2 sm:gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
      <span className="font-bold text-slate-600 shrink-0">{label}</span>
      <span className="min-w-0 break-words font-mono text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}
