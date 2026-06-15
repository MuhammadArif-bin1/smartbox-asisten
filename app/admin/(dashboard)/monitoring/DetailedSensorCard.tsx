"use client";

export function DetailedSensorCard({
  title,
  value,
  lastSeen,
  online,
  accent,
  icon,
}: {
  title: string;
  value: string;
  lastSeen: string;
  online: boolean;
  accent: "blue" | "emerald" | "orange";
  icon: React.ReactNode;
}) {
  const accentBorder = {
    blue: "border-blue-100 hover:border-blue-200",
    emerald: "border-emerald-100 hover:border-emerald-200",
    orange: "border-orange-100 hover:border-orange-200",
  };

  const accentBg = {
    blue: "bg-blue-50/75",
    emerald: "bg-emerald-50/75",
    orange: "bg-orange-50/75",
  };

  return (
    <div className={`rounded-3xl border bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md ${accentBorder[accent] || "border-slate-200"} flex flex-col justify-between min-h-[170px]`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</span>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentBg[accent]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-2xl font-black text-slate-900 break-all">{value}</h3>
        <div className="mt-3 flex justify-between items-center flex-wrap gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
            online ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"
          }`}>
            {online ? "ONLINE" : "OFFLINE"}
          </span>
          <span className="text-xs text-slate-400 font-semibold font-mono">{lastSeen !== "-" ? `Update: ${lastSeen}` : "Belum terhubung"}</span>
        </div>
      </div>
    </div>
  );
}
