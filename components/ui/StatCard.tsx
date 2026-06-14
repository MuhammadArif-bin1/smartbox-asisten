"use client";

export function StatCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "blue" | "cyan" | "orange" | "indigo" | "violet" | "red" | "emerald";
}) {
  const accentClass = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    cyan: "text-cyan-600 bg-cyan-50 border-cyan-100",
    orange: "text-orange-600 bg-orange-50 border-orange-100",
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    violet: "text-violet-600 bg-violet-50 border-violet-100",
    red: "text-red-600 bg-red-50 border-red-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
  };

  const cardBorderClass: Record<string, string> = {
    blue: "border-slate-200 hover:border-blue-200 bg-white",
    cyan: "border-slate-200 hover:border-cyan-200 bg-white",
    orange: "border-slate-200 hover:border-orange-200 bg-white",
    indigo: "border-slate-200 hover:border-indigo-200 bg-white",
    violet: "border-slate-200 hover:border-violet-200 bg-white",
    emerald: "border-emerald-200 bg-emerald-50/20 hover:border-emerald-300",
    red: "border-red-200 bg-red-50/40 hover:border-red-300 animate-pulse",
  };

  const resolvedCardStyle = cardBorderClass[accent] || "border-slate-200 hover:border-slate-300 bg-white";

  const dotColor = {
    blue: "bg-blue-500",
    cyan: "bg-cyan-500",
    orange: "bg-orange-500",
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    red: "bg-red-500",
    emerald: "bg-emerald-500",
  };

  const icons = {
    blue: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v10.5a4.5 4.5 0 11-4 0V4a2 2 0 114 0z" />
      </svg>
    ),
    cyan: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 8h12M3 16h15" />
      </svg>
    ),
    orange: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.585A8 8 0 1120 12c0 2.13-.86 4.03-2.243 5.402z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    violet: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a1 1 0 100-2 1 1 0 000 2zM8 9h8a1.5 1.5 0 011.5 1.5v6M9 22V15m6 7v-7M12 9v6" />
      </svg>
    ),
    indigo: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    red: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    emerald: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <article className={`relative overflow-hidden rounded-3xl border p-6 shadow-sm shadow-slate-100/50 transition-all duration-300 hover:shadow-md flex flex-col justify-between h-full min-h-[170px] ${resolvedCardStyle}`}>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">{label}</span>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${accentClass[accent]}`}>
          {icons[accent]}
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-3xl font-black tracking-tight text-slate-900 break-all">{value}</h3>
        <p className="mt-2.5 text-sm font-semibold text-slate-500 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotColor[accent] || "bg-emerald-500"} animate-pulse`}></span>
          {detail}
        </p>
      </div>
    </article>
  );
}
