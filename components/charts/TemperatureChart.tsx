"use client";

import { temperatureSeries } from "@/lib/smartbox-constants";

export function TemperatureChart({ value, series = temperatureSeries }: { value: number; series?: number[] }) {
  const points = series.map((item, index) => `${30 + index * 32},${210 - (item - 24) * 18}`).join(" ");
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-white to-blue-50/80 p-3">
      <svg className="h-[280px] w-full" viewBox="0 0 620 270" role="img" aria-label="Grafik suhu ruangan">
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="30" x2="590" y1={50 + line * 40} y2={50 + line * 40} stroke="#dbeafe" strokeDasharray="5 5" />)}
        <polyline points={`30,230 ${points} 574,230`} fill="rgba(37,99,235,0.10)" stroke="none" />
        <polyline points={points} fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        {series.map((item, index) => <circle key={`${item}-${index}`} cx={30 + index * 32} cy={210 - (item - 24) * 18} r="5" fill="#2563eb" />)}
        <g>
          <rect x="410" y="70" width="140" height="60" rx="12" fill="#0f172a" />
          <text x="430" y="97" fill="white" fontSize="19" fontWeight="800">{value.toFixed(1)} °C</text>
          <text x="430" y="118" fill="#cbd5e1" fontSize="13" fontWeight="600">Saat ini</text>
        </g>
      </svg>
    </div>
  );
}
