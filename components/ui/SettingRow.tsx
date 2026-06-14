"use client";

export function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
      <span className="font-bold text-slate-600">{label}</span>
      <span className="min-w-0 break-words font-mono text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}
