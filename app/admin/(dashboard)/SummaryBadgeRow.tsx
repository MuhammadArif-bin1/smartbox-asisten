"use client";

export function SummaryBadgeRow({ label, value, active }: { label: string; value: string; active: boolean | null }) {
  return (
    <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
        active 
          ? "bg-red-50 text-red-600 border-red-200 border" 
          : (value === "Offline" || value === "Terputus" || value === "Tidak Terhubung" || value === "Tidak Ada"
            ? "bg-slate-100 text-slate-500 border-slate-200 border"
            : "bg-emerald-50 text-emerald-600 border-emerald-200 border")
      }`}>
        {value}
      </span>
    </div>
  );
}
