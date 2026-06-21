"use client";

import { TEMP_WARNING_C, temperatureSeries } from "@/lib/smartbox-constants";

const chartBox = {
  left: 70,
  right: 592,
  top: 62,
  bottom: 232,
};

const tempMin = 20;
const tempMax = 45;
const chartWidth = chartBox.right - chartBox.left;
const chartHeight = chartBox.bottom - chartBox.top;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function tempToY(temp: number) {
  const safeTemp = clamp(temp, tempMin, tempMax);
  return chartBox.bottom - ((safeTemp - tempMin) / (tempMax - tempMin)) * chartHeight;
}

function indexToX(index: number, total: number) {
  if (total <= 1) return chartBox.left;
  return chartBox.left + (index / (total - 1)) * chartWidth;
}

export function TemperatureChart({
  value,
  series = temperatureSeries,
  threshold = TEMP_WARNING_C,
}: {
  value: number;
  series?: number[];
  threshold?: number;
}) {
  const samples = series.length > 0 ? series : [value];
  const plottedPoints = samples.map((temp, index) => ({
    x: indexToX(index, samples.length),
    y: tempToY(temp),
    value: temp,
  }));

  const linePoints = plottedPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const firstPoint = plottedPoints[0];
  const lastPoint = plottedPoints[plottedPoints.length - 1];
  const areaPoints = firstPoint && lastPoint
    ? `${firstPoint.x},${chartBox.bottom} ${linePoints} ${lastPoint.x},${chartBox.bottom}`
    : "";

  const isHigh = value >= threshold;
  const strokeColor = isHigh ? "#e11d48" : "#2563eb";
  const statusLabel = isHigh ? "Suhu Tinggi" : "Normal";
  const thresholdY = tempToY(threshold);
  const latestY = tempToY(value);

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-blue-100/80 bg-white p-5 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.7)] ring-1 ring-white/80">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-blue-50/90 to-transparent" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-500">Grafik Suhu Ruangan</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="font-mono text-4xl font-black leading-none text-slate-950">
              {value.toFixed(1)}
            </span>
            <span className="pb-1.5 text-base font-black text-slate-500">{"\u00b0C"}</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">Live 3 menit terakhir</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-600 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Batas {threshold.toFixed(0)}{"\u00b0C"}
          </span>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black shadow-sm ${
            isHigh
              ? "border-rose-200 bg-rose-50 text-rose-600"
              : "border-blue-200 bg-blue-50 text-blue-700"
          }`}>
            <span className={`h-2 w-2 rounded-full ${isHigh ? "animate-pulse bg-rose-500" : "bg-blue-500"}`} />
            {statusLabel}
          </span>
        </div>
      </div>

      <svg className="relative mt-4 h-auto w-full aspect-[640/300]" viewBox="0 0 640 300" role="img" aria-label="Grafik suhu ruangan dalam Celcius">
        <defs>
          <linearGradient id="temperatureAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.24" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.03" />
          </linearGradient>
          <filter id="temperatureLineGlow" x="-20%" y="-40%" width="140%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor={strokeColor} floodOpacity="0.24" />
          </filter>
        </defs>

        <rect x="0" y="0" width="640" height="300" rx="26" fill="#f8fafc" />
        <rect x={chartBox.left} y={chartBox.top} width={chartWidth} height={thresholdY - chartBox.top} rx="16" fill="#fff1f2" opacity="0.55" />
        <rect x={chartBox.left} y={thresholdY} width={chartWidth} height={chartBox.bottom - thresholdY} rx="16" fill="#eff6ff" opacity="0.55" />

        {[20, 25, 30, 35, 40, 45].map((val) => {
          const y = tempToY(val);
          return (
            <g key={val}>
              <line x1={chartBox.left} x2={chartBox.right} y1={y} y2={y} stroke="#cbd5e1" strokeDasharray="4 8" strokeWidth="1" />
              <text x="24" y={y + 4} fill="#64748b" fontSize="11" fontWeight="800" className="font-sans">
                {val}{"\u00b0C"}
              </text>
            </g>
          );
        })}

        <line x1={chartBox.left} x2={chartBox.right} y1={thresholdY} y2={thresholdY} stroke="#e11d48" strokeDasharray="9 8" strokeWidth="2.5" />
        <circle cx={chartBox.right} cy={thresholdY} r="4" fill="#e11d48" stroke="#ffffff" strokeWidth="2" />

        {areaPoints && <polyline points={areaPoints} fill="url(#temperatureAreaGradient)" stroke="none" />}

        {linePoints && (
          <polyline
            points={linePoints}
            fill="none"
            filter="url(#temperatureLineGlow)"
            stroke={strokeColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4.5"
          />
        )}

        {plottedPoints.map((point, index) => (
          <circle
            key={`${point.value}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === plottedPoints.length - 1 ? "5.5" : "4"}
            fill={strokeColor}
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}

        <g>
          <line x1={chartBox.left} x2={chartBox.right} y1={chartBox.bottom + 5} y2={chartBox.bottom + 5} stroke="#cbd5e1" strokeWidth="1.5" />
          <text x={chartBox.left} y="265" fill="#64748b" fontSize="11" fontWeight="800" textAnchor="start">3 menit lalu</text>
          <text x={(chartBox.left + chartBox.right) / 2} y="265" fill="#64748b" fontSize="11" fontWeight="800" textAnchor="middle">1.5 menit lalu</text>
          <text x={chartBox.right} y="265" fill="#64748b" fontSize="11" fontWeight="800" textAnchor="end">Sekarang</text>
        </g>

        <g>
          <line x1={chartBox.right - 18} x2={chartBox.right - 18} y1={latestY - 18} y2={latestY + 18} stroke={strokeColor} strokeWidth="1.5" strokeOpacity="0.25" />
          <circle cx={chartBox.right - 18} cy={latestY} r="7" fill={strokeColor} stroke="#ffffff" strokeWidth="3" />
        </g>
      </svg>
    </div>
  );
}
