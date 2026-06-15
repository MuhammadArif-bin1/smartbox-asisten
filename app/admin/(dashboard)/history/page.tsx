"use client";

import { useSmartbox } from "@/lib/smartbox-context";
import { Panel } from "@/components/ui/Panel";

export default function HistoryPage() {
  const ctx = useSmartbox();

  return (
    <Panel title="Riwayat Aktivitas (Neon DB)" subtitle="Semua event log tersinkronisasi dari database PostgreSQL Neon.">
      <div className="grid gap-3">
        {ctx.events.length === 0 ? (
          <div className="text-center py-14 border border-dashed border-slate-200 rounded-3xl bg-slate-50">
            <p className="text-sm font-bold text-slate-500">Belum ada riwayat tercatat.</p>
            <p className="text-xs text-slate-400 mt-1">Event akan muncul saat ESP32 mengirim data.</p>
          </div>
        ) : (
          ctx.events.map((evt) => (
            <div key={evt.id} className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 rounded-2xl bg-white border border-slate-200 p-5 text-sm shadow-sm hover:shadow-md transition">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                    evt.level === "WARNING" || evt.level === "CRITICAL" ? "bg-red-50 text-red-600 border border-red-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                  }`}>
                    {evt.level}
                  </span>
                  <span className="font-bold text-slate-900 text-base">{evt.type}</span>
                </div>
                <p className="mt-2 text-slate-600 leading-relaxed break-words">{evt.message}</p>
              </div>
              <span className="text-xs font-bold text-slate-400 whitespace-nowrap self-end sm:self-auto shrink-0">
                {new Date(evt.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
