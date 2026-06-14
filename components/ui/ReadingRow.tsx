"use client";

export function ReadingRow({ label, value, status, percent, tone }: { label: string; value: string; status: string; percent: number; tone: "blue" | "emerald" | "orange" }) {
  const color = { blue: "bg-blue-600", emerald: "bg-emerald-500", orange: "bg-orange-500" };
  const warning = status === "Peringatan" || status === "Waspada" || status === "Panas" || status === "Bahaya" || status === "Terdeteksi" || status === "Ada Gerakan" || status === "Gerakan Terdeteksi" || status === "Dekat";
  const offline = status === "Offline" || status === "Tidak Terhubung" || status.includes("Menunggu");
  const badgeClass = offline
    ? "bg-slate-100 text-slate-500"
    : (warning ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50 flex flex-col justify-between h-full min-h-[150px] transition-shadow duration-200 hover:shadow-md">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <div className="mt-3 flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-3xl font-black text-slate-950 tracking-tight break-all">{value}</p>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${badgeClass} shrink-0`}>
            {status}
          </span>
        </div>
      </div>
      <div className="mt-5">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all duration-500 ${offline ? "bg-slate-200" : (warning ? "bg-red-500" : color[tone])}`} style={{ width: `${offline ? 0 : Math.min(percent, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
