"use client";

export function DetailedSensorCard({
  title,
  value,
  status,
  lastSeen,
  online,
  accent,
  icon,
  onReset,
}: {
  title: string;
  value: string;
  status: string;
  lastSeen: string;
  online: boolean;
  accent: "blue" | "emerald" | "orange";
  icon: React.ReactNode;
  onReset?: () => void;
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
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-black text-slate-900 break-words">{value}</h3>
            {onReset && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2.5 py-1 text-[10px] font-black text-orange-600 border border-orange-100 hover:bg-orange-100 active:scale-95 transition"
                title="Reset Hitungan"
              >
                🔄 Reset
              </button>
            )}
          </div>
          {status && status !== "Offline" && status !== "Tidak Terhubung" && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
              status === "Bahaya" || status === "Ada Gerakan" || status === "Peringatan"
                ? "bg-red-50 text-red-600 border-red-200 animate-pulse"
                : status === "Waspada"
                ? "bg-amber-50 text-amber-600 border-amber-200"
                : status === "Aman" || status === "normal"
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-slate-50 text-slate-600 border-slate-200"
            }`}>
              {status}
            </span>
          )}
        </div>
        <div className="mt-3 flex justify-between items-center flex-wrap gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
            online ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"
          }`}>
            {online ? "ONLINE" : "OFFLINE"}
          </span>
          <span className="text-xs text-slate-400 font-semibold font-mono">
            {lastSeen && lastSeen !== "-" ? `Update: ${lastSeen}` : (online ? "Update: Baru saja" : "Belum terhubung")}
          </span>
        </div>
      </div>
    </div>
  );
}
