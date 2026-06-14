"use client";

export function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-200/60 transition-shadow duration-300 hover:shadow-md">
      <div className="mb-5">
        <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
