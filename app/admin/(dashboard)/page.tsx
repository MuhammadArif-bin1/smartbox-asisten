"use client";

import { useSmartbox } from "@/lib/smartbox-context";
import { Panel } from "@/components/ui/Panel";
import { TemperatureChart } from "@/components/charts/TemperatureChart";
import { GasChart } from "@/components/charts/GasChart";
import { SummaryBadgeRow } from "./SummaryBadgeRow";

export default function DashboardPage() {
  const ctx = useSmartbox();
  const isOnline = ctx.deviceStatuses.esp32;
  const lastUpdate = isOnline ? (ctx.deviceStatuses.lastSeen && ctx.deviceStatuses.lastSeen !== "-" ? ctx.deviceStatuses.lastSeen : "Baru saja") : "-";

  // Filter PIR motion events for timeline
  const pirEvents = ctx.events.filter(e => e.type === "pir.motion");

  return (
    <div className="grid gap-6">
      {/* Title section matching requested focus */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-7 text-white shadow-xl shadow-blue-100/40">
        <h2 className="text-2xl font-black">SmartBox Assistant Dashboard</h2>
        <p className="mt-2 text-base text-blue-100 font-medium leading-relaxed max-w-2xl">
          Monitoring kondisi ruangan secara real-time dari ESP32-S3.
        </p>
      </div>

      {/* Main 3 Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Card 1: Suhu Ruangan */}
        <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md flex flex-col justify-between min-h-[170px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Suhu Ruangan</span>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50/75">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v10.5a4.5 4.5 0 11-4 0V4a2 2 0 114 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h3 className="text-2xl font-black text-slate-900 break-words">
                {isOnline ? (ctx.visibleTempEstimate > 0 ? `${ctx.visibleTempEstimate.toFixed(1)}°C` : "Menunggu data...") : "Menunggu data..."}
              </h3>
              {isOnline && ctx.tempState && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  ctx.tempState === "Peringatan"
                    ? "bg-red-50 text-red-600 border-red-200 animate-pulse"
                    : "bg-emerald-50 text-emerald-600 border-emerald-200"
                }`}>
                  {ctx.tempState}
                </span>
              )}
            </div>
            {!isOnline ? (
              <p className="text-xs text-slate-500 font-semibold mt-1">ESP32-S3 belum mengirim data suhu.</p>
            ) : (
              <div className="mt-3 flex justify-between items-center flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-500">Sumber: DS3231 / sensor suhu</span>
                <span className="text-xs text-slate-400 font-semibold font-mono">
                  {lastUpdate && lastUpdate !== "-" ? `Update: ${lastUpdate}` : "Baru saja"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Gas / Asap */}
        <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md flex flex-col justify-between min-h-[170px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status Gas / Asap</span>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50/75">
              <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.585A8 8 0 1120 12c0 2.13-.86 4.03-2.243 5.402z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h3 className="text-2xl font-black text-slate-900 break-words">
                {isOnline ? `${ctx.gasPpm} PPM` : "Tidak Terhubung"}
              </h3>
              {isOnline && ctx.gasState && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  ctx.gasState === "Bahaya" || ctx.gasState === "Waspada"
                    ? "bg-red-50 text-red-600 border-red-200 animate-pulse"
                    : "bg-emerald-50 text-emerald-600 border-emerald-200"
                }`}>
                  {ctx.gasState}
                </span>
              )}
            </div>
            {!isOnline ? (
              <p className="text-xs text-slate-500 font-semibold mt-1">Sensor gas belum mengirim data.</p>
            ) : (
              <div className="mt-3 flex justify-between items-center flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-500">Sensor MQ-2</span>
                <span className="text-xs text-slate-400 font-semibold font-mono">
                  {lastUpdate && lastUpdate !== "-" ? `Update: ${lastUpdate}` : "Baru saja"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Gerakan PIR */}
        <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md flex flex-col justify-between min-h-[170px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gerakan PIR</span>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50/75">
              <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a1 1 0 100-2 1 1 0 000 2zM8 9h8a1.5 1.5 0 011.5 1.5v6M9 22V15m6 7v-7M12 9v6" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h3 className="text-2xl font-black text-slate-900 break-words">
                {isOnline ? (ctx.pirDetected ? "Gerakan Terdeteksi" : "Tidak Ada Gerakan") : "Tidak Terhubung"}
              </h3>
              {isOnline && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  ctx.pirDetected
                    ? "bg-red-50 text-red-600 border-red-200 animate-pulse"
                    : "bg-emerald-50 text-emerald-600 border-emerald-200"
                }`}>
                  {ctx.pirDetected ? "Ada Gerakan" : "Aman"}
                </span>
              )}
            </div>
            <div className="mt-3 flex justify-between items-center flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-500">Status: {isOnline ? "Aktif" : "Offline"}</span>
              <span className="text-xs text-slate-400 font-semibold font-mono">
                {lastUpdate && lastUpdate !== "-" ? `Update: ${lastUpdate}` : "Baru saja"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Charts & Timeline & Ringkasan */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-6">
          <Panel title="Grafik Sensor Real-time" subtitle="Monitoring grafik sensor suhu dan gas.">
            {!isOnline ? (
              <div className="flex flex-col items-center justify-center h-[280px] rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 p-6 text-center">
                <svg className="h-10 w-10 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <h3 className="text-sm font-extrabold text-slate-700">Belum ada data sensor</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[280px]">Menunggu telemetry dari ESP32-S3.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Grafik Suhu</p>
                    {ctx.visibleTempEstimate > 0 ? (
                      <TemperatureChart value={ctx.visibleTempEstimate} series={ctx.tempHistory} />
                    ) : (
                      <div className="flex items-center justify-center h-[200px] rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-sm font-bold">
                        Menunggu data...
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Grafik Gas</p>
                    <GasChart value={ctx.visibleGasEstimate} series={ctx.gasHistory} />
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Timeline Gerakan PIR" subtitle="Riwayat gerakan terakhir yang dideteksi oleh sensor PIR.">
            {pirEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[180px] text-slate-400 text-sm font-bold text-center border border-dashed border-slate-200 bg-slate-50 rounded-2xl p-4">
                Belum ada riwayat gerakan terdeteksi.
              </div>
            ) : (
              <div className="space-y-4 max-h-[220px] overflow-y-auto pr-2">
                {pirEvents.map((evt) => (
                  <div key={evt.id} className="flex gap-3 items-start border-l-2 border-slate-200 pl-4 py-1 relative">
                    <div className="absolute -left-[6px] top-2.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-4 ring-white shadow-sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{evt.message}</p>
                      <p className="text-xs text-slate-400 font-bold font-mono mt-0.5">
                        {new Date(evt.createdAt).toLocaleTimeString("id-ID")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Ringkasan Kondisi Ruangan Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-4">Ringkasan Kondisi Ruangan</h3>
            <div className="grid gap-3">
              <SummaryBadgeRow label="Suhu" value={!isOnline ? "Tidak Terhubung" : (ctx.tempWarning ? "Peringatan" : "Normal")} active={isOnline && ctx.tempWarning} />
              <SummaryBadgeRow label="Gas" value={!isOnline ? "Tidak Terhubung" : (ctx.gasWarning ? "Bahaya" : "Aman")} active={isOnline && ctx.gasWarning} />
              <SummaryBadgeRow label="Gerakan" value={!isOnline ? "Tidak Terhubung" : (ctx.pirDetected ? "Ada" : "Tidak Ada")} active={isOnline && ctx.pirDetected} />
              <SummaryBadgeRow label="MQTT" value={ctx.mqttOnline ? "Terhubung" : "Terputus"} active={!ctx.mqttOnline} />
              <SummaryBadgeRow label="ESP32" value={isOnline ? "Online" : "Offline"} active={!isOnline} />
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold font-mono">
              <span>Sistem SmartBox</span>
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
