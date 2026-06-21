"use client";

export function GasChart({ value, series }: { value: number; series: number[] }) {
  // Convert series items from RAW to PPM: ppm = Math.round(raw / 60)
  // X range: 60 to 580. Y range: 40 to 220 (height = 180)
  // Max PPM scale: 50 PPM
  const points = series
    .map((raw, index) => {
      const ppm = Math.round(raw / 60);
      const x = 60 + index * 30;
      const y = 220 - (Math.min(50, ppm) / 50) * 160;
      return `${x},${y}`;
    })
    .join(" ");

  const currentPpm = Math.round(value / 60);
  
  // Define status color based on PPM
  let strokeColor = "#10b981"; // Green (Safe)
  let fillColor = "rgba(16,185,129,0.08)";
  let statusLabel = "Aman";
  if (currentPpm >= 23) {
    strokeColor = "#ef4444"; // Red (Bahaya)
    fillColor = "rgba(239,68,68,0.08)";
    statusLabel = "Bahaya";
  } else if (currentPpm >= 21) {
    strokeColor = "#f97316"; // Orange (Waspada)
    fillColor = "rgba(249,115,22,0.08)";
    statusLabel = "Waspada";
  }

  // Ambang batas Y coordinates
  const yWaspada = 220 - (21 / 50) * 160; // 21 PPM
  const yBahaya = 220 - (23 / 50) * 160;  // 23 PPM

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/50 p-6 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-slate-400">Grafik Gas & Asap</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
          statusLabel === "Bahaya" ? "bg-red-50 text-red-600" :
          statusLabel === "Waspada" ? "bg-orange-50 text-orange-600" :
          "bg-emerald-50 text-emerald-600"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            statusLabel === "Bahaya" ? "bg-red-500 animate-pulse" :
            statusLabel === "Waspada" ? "bg-orange-500" :
            "bg-emerald-500"
          }`} />
          {statusLabel}
        </span>
      </div>
      
      <svg className="w-full h-auto aspect-[620/270]" viewBox="0 0 620 270" role="img" aria-label="Grafik kadar gas/asap dalam PPM">
        {/* Y Grid lines & Labels */}
        {[0, 10, 20, 30, 40, 50].map((val) => {
          const y = 220 - (val / 50) * 160;
          return (
            <g key={val} className="opacity-40">
              <line x1="60" x2="580" y1={y} y2={y} stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth="1" />
              <text x="20" y={y + 4} fill="#64748b" fontSize="11" fontWeight="700" className="font-sans">{val} PPM</text>
            </g>
          );
        })}

        {/* Warning Threshold Line (21 PPM) */}
        <g>
          <line x1="60" x2="580" y1={yWaspada} y2={yWaspada} stroke="#f97316" strokeDasharray="6 4" strokeWidth="2.5" className="opacity-90" />
          <text x="320" y={yWaspada - 8} fill="#f97316" fontSize="16" fontWeight="900" className="font-sans uppercase tracking-widest">⚠️ ASAP (21 PPM)</text>
        </g>

        {/* Danger Threshold Line (23 PPM) */}
        <g>
          <line x1="60" x2="580" y1={yBahaya} y2={yBahaya} stroke="#ef4444" strokeDasharray="6 4" strokeWidth="2.5" className="opacity-90" />
          <text x="320" y={yBahaya - 8} fill="#ef4444" fontSize="16" fontWeight="900" className="font-sans uppercase tracking-widest">🚨 GAS/BAHAYA (23 PPM)</text>
        </g>

        {/* Area Fill */}
        {points && (
          <polyline points={`60,220 ${points} 570,220`} fill={fillColor} stroke="none" />
        )}

        {/* Line Path */}
        {points && (
          <polyline points={points} fill="none" stroke={strokeColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        )}

        {/* Data Points */}
        {series.map((raw, index) => {
          const ppm = Math.round(raw / 60);
          const x = 60 + index * 30;
          const y = 220 - (Math.min(50, ppm) / 50) * 160;
          return (
            <circle
              key={`${raw}-${index}`}
              cx={x}
              cy={y}
              r="4.5"
              fill={strokeColor}
              stroke="#ffffff"
              strokeWidth="1.5"
              className="transition-all duration-300"
            />
          );
        })}

        {/* X Axis Timeline Labels */}
        <g className="opacity-60">
          <line x1="60" x2="580" y1="225" y2="225" stroke="#cbd5e1" strokeWidth="1.5" />
          <text x="60" y="245" fill="#64748b" fontSize="11" fontWeight="700" textAnchor="start">3 menit lalu</text>
          <text x="320" y="245" fill="#64748b" fontSize="11" fontWeight="700" textAnchor="middle">1.5 menit lalu</text>
          <text x="580" y="245" fill="#64748b" fontSize="11" fontWeight="700" textAnchor="end">Sekarang</text>
        </g>

        {/* Floating current value display */}
        <g>
          <rect x="68" y="48" width="130" height="52" rx="14" fill="#0f172a" />
          <text x="84" y="73" fill="white" fontSize="18" fontWeight="900" className="font-mono">{currentPpm} PPM</text>
          <text x="84" y="90" fill="#94a3b8" fontSize="10" fontWeight="700" className="font-sans uppercase tracking-wider">Kadar Gas</text>
        </g>
      </svg>
    </div>
  );
}
