"use client";

export function GasChart({ value, series }: { value: number; series: number[] }) {
  const safeSeries = series.length > 0 ? series.slice(-24) : [value];
  const chartLeft = 30;
  const chartRight = 590;
  const chartTop = 45;
  const chartBottom = 230;
  const xStep = safeSeries.length > 1 ? (chartRight - chartLeft) / (safeSeries.length - 1) : 0;
  const yForGas = (item: number) => {
    const clamped = Math.max(0, Math.min(2500, item));
    return chartBottom - (clamped / 2500) * (chartBottom - chartTop);
  };
  const points = safeSeries.map((item, index) => `${chartLeft + index * xStep},${yForGas(item)}`).join(" ");
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-white to-orange-50/80 p-3">
      <svg className="h-[280px] w-full" viewBox="0 0 620 270" role="img" aria-label="Grafik kadar gas/asap">
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="30" x2="590" y1={50 + line * 40} y2={50 + line * 40} stroke="#ffedd5" strokeDasharray="5 5" />)}
        <polyline points={`${chartLeft},${chartBottom} ${points} ${chartRight},${chartBottom}`} fill="rgba(249,115,22,0.10)" stroke="none" />
        <polyline points={points} fill="none" stroke="#f97316" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        {safeSeries.map((item, index) => <circle key={`${item}-${index}`} cx={chartLeft + index * xStep} cy={yForGas(item)} r="5" fill="#f97316" />)}
        <g>
          <rect x="410" y="70" width="140" height="60" rx="12" fill="#0f172a" />
          <text x="430" y="97" fill="white" fontSize="19" fontWeight="800">{Math.round(value)} RAW</text>
          <text x="430" y="118" fill="#cbd5e1" fontSize="13" fontWeight="600">Saat ini</text>
        </g>
      </svg>
    </div>
  );
}
