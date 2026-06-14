"use client";

export function WarningCard({
  title,
  value,
  threshold,
  active,
  message,
}: {
  title: string;
  value: string;
  threshold: string;
  active: boolean;
  message: string;
}) {
  return (
    <article className={`rounded-2xl border p-5 transition-colors duration-200 ${active ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-base font-black ${active ? "text-red-700" : "text-slate-900"}`}>{title}</p>
          <p className="mt-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">Ambang: {threshold}</p>
        </div>
        <span className={`rounded-full px-3.5 py-1.5 text-xs font-black ${active ? "bg-red-600 text-white" : "bg-emerald-50 text-emerald-600"}`}>
          {active ? "Peringatan" : "Normal"}
        </span>
      </div>
      <div className="mt-5 grid gap-1">
        <p className="text-sm font-bold text-slate-500">Angka estimasi saat ini</p>
        <p className={`text-4xl font-black ${active ? "text-red-700" : "text-slate-950"}`}>{value}</p>
      </div>
      <p className={`mt-4 text-sm leading-relaxed ${active ? "text-red-700" : "text-slate-600"}`}>{message}</p>
    </article>
  );
}
