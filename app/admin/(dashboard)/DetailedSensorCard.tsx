"use client";

export function DetailedSensorCard({
  title,
  value,
  status,
  lastSeen,
  online,
  accent,
  icon,
  onClick,
}: {
  title: string;
  value: string;
  status: string;
  lastSeen: string;
  online: boolean;
  accent: "blue" | "emerald" | "orange";
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const isDanger = status === "Bahaya" || status === "Gas Terdeteksi";
  const isWarning = status === "Waspada" || status === "Asap Terdeteksi" || status === "Peringatan" || status === "Suhu Terdeteksi / Suhu Tinggi" || status === "Ada Gerakan" || status === "Gerakan Terdeteksi";

  const cardBorderClass = isDanger
    ? "border-red-200 hover:border-red-300"
    : isWarning
    ? "border-amber-200 hover:border-amber-300"
    : accent === "blue"
    ? "border-blue-100 hover:border-blue-200"
    : accent === "emerald"
    ? "border-emerald-100 hover:border-emerald-200"
    : "border-orange-100 hover:border-orange-200";

  const cardBgClass = isDanger
    ? "bg-red-50/50 animate-pulse"
    : isWarning
    ? "bg-amber-50/50"
    : "bg-white";

  const accentBg = {
    blue: "bg-blue-50/75",
    emerald: "bg-emerald-50/75",
    orange: "bg-orange-50/75",
  };

  return (
    <div 
      onClick={onClick}
      className={`rounded-3xl border p-6 shadow-sm transition-all duration-200 hover:shadow-md flex flex-col justify-between min-h-[170px] ${
        onClick ? "cursor-pointer hover:border-slate-400 active:scale-[0.98]" : ""
      } ${cardBorderClass} ${cardBgClass}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</span>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentBg[accent]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h3 className="text-2xl font-black text-slate-900 break-words">{value}</h3>
          {status && status !== "Offline" && status !== "Tidak Terhubung" && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
              status === "Bahaya" || status === "Ada Gerakan" || status === "Peringatan" || status === "Waspada"
                ? "bg-red-50 text-red-600 border-red-200 animate-pulse"
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
        {onClick && (
          <div className="mt-2 text-right">
            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Klik untuk simulasi</span>
          </div>
        )}
      </div>
    </div>
  );
}
