"use client";

import { temperatureSeries } from "@/lib/smartbox-constants";

export function TemperatureChart({ value, series = temperatureSeries }: { value: number; series?: number[] }) {
  // Map series to SVG coordinates. Range: 20°C to 45°C (height = 160)
  // X range: 60 to 580. Y range: 60 to 220
  const points = series
    .map((temp, index) => {
      const x = 60 + index * 30;
      const y = 220 - ((Math.max(20, Math.min(45, temp)) - 20) / 25) * 160;
      return `${x},${y}`;
    })
    .join(" ");

  const isHigh = value >= 35;
  const strokeColor = isHigh ? "#ef4444" : "#2563eb"; // Red if hot, Blue if normal
  const fillColor = isHigh ? "rgba(239,68,68,0.08)" : "rgba(37,99,235,0.08)";
  const statusLabel = isHigh ? "Suhu Tinggi" : "Normal";

  const yWarning = 220 - ((35 - 20) / 25) * 160; // 35 °C warning threshold Y coordinate

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/50 p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-slate-400">Grafik Suhu Ruangan</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
          isHigh ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            isHigh ? "bg-red-500 animate-pulse" : "bg-blue-500"
          }`} />
          {statusLabel}
        </span>
      </div>

      <svg className="h-[260px] w-full" viewBox="0 0 620 270" role="img" aria-label="Grafik suhu ruangan dalam Celcius">
        {/* Y Axis Grid lines & Labels */}
        {[20, 25, 30, 35, 40, 45].map((val) => {
          const y = 220 - ((val - 20) / 25) * 160;
          return (
            <g key={val} className="opacity-40">
              <line x1="60" x2="580" y1={y} y2={y} stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth="1" />
              <text x="20" y={y + 4} fill="#64748b" fontSize="11" fontWeight="700" className="font-sans">{val} °C</text>
            </g>
          );
        })}

        {/* Warning Threshold Line (35°C) */}
        <g>
          <line x1="60" x2="580" y1={yWarning} y2={yWarning} stroke="#ef4444" strokeDasharray="6 4" strokeWidth="1.5" className="opacity-60" />
          <text x="440" y={yWarning - 6} fill="#ef4444" fontSize="9" fontWeight="800" className="opacity-80 font-sans uppercase tracking-wider">Batas Panas (35°C)</text>
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
        {series.map((temp, index) => {
          const x = 60 + index * 30;
          const y = 220 - ((Math.max(20, Math.min(45, temp)) - 20) / 25) * 160;
          return (
            <circle
              key={`${temp}-${index}`}
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
          <text x="84" y="73" fill="white" fontSize="18" fontWeight="900" className="font-mono">{value.toFixed(1)} °C</text>
          <text x="84" y="90" fill="#94a3b8" fontSize="10" fontWeight="700" className="font-sans uppercase tracking-wider">Suhu Ruang</text>
        </g>
      </svg>
    </div>
  );
}
