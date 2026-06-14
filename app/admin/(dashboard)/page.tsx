"use client";

import { useSmartbox } from "@/lib/smartbox-context";
import { Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { Activity } from "@/components/ui/Activity";
import { TemperatureChart } from "@/components/charts/TemperatureChart";
import { GasChart } from "@/components/charts/GasChart";
import { SummaryBadgeRow } from "./SummaryBadgeRow";

export default function DashboardPage() {
  const ctx = useSmartbox();
  const isOnline = ctx.deviceStatuses.esp32;
  const hasData = isOnline && ctx.visibleTempEstimate > 0;
  const hasGas = isOnline;
  const lastUpdate = isOnline ? (ctx.deviceStatuses.lastSeen || "Baru saja") : "-";
  const pirEvents = ctx.events.filter(e => e.type === "pir.motion" || e.type === "pir.greeting.played").slice(0, 5);

  const gasAccent = !hasGas
    ? "cyan" as const
    : (ctx.gasState === "Bahaya"
      ? "red" as const
      : (ctx.gasState === "Waspada"
        ? "orange" as const
        : "emerald" as const));

  return (
    <div className="grid gap-6">
      {/* Stats Grid */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Suhu Ruangan"
          value={hasData ? `${ctx.visibleTempEstimate.toFixed(1)}°C` : "Menunggu data..."}
          detail={hasData ? "Update realtime" : "DS3231 Tidak Terhubung"}
          accent="blue"
        />
        <StatCard
          label="Status Gas/Asap"
          value={hasGas ? (ctx.gasState === "Aman" ? `Aman (${ctx.gasPpm} PPM)` : `${ctx.gasState} (${ctx.gasPpm} PPM)`) : "Tidak Terhubung"}
          detail={hasGas ? `Sensor RAW: ${ctx.visibleGasEstimate}` : "ESP32 Offline"}
          accent={gasAccent}
        />
        <StatCard
          label="Gerakan (PIR)"
          value={hasGas ? (ctx.pirDetected ? "Gerakan Terdeteksi" : "Tidak Ada Gerakan") : "Tidak Terhubung"}
          detail={hasGas ? (ctx.pirDetected ? "Terdeteksi gerakan" : "Kondisi aman") : "ESP32 Offline"}
          accent={ctx.pirDetected ? "red" : "emerald"}
        />
        <StatCard label="Koneksi Perangkat" value={ctx.deviceStatuses.esp32 ? "Terhubung" : "Tidak Terhubung"} detail={ctx.deviceStatuses.esp32 ? `Relay aktif: ${ctx.relayActiveCount} / 3` : "Perangkat offline"} accent="indigo" />
      </section>

      {/* 3 Main Sensor Cards */}
      <div className="grid gap-5 grid-cols-1 md:grid-cols-3">
        {/* Card 1: Suhu */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100 flex flex-col justify-between min-h-[170px] hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Suhu Ruangan</span>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 text-blue-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v10.5a4.5 4.5 0 11-4 0V4a2 2 0 114 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            {!hasData ? (
              <div className="text-slate-400 py-1">
                <p className="text-sm font-bold text-slate-600">Menunggu data...</p>
                <p className="text-xs text-slate-400">ESP32-S3 belum mengirim data suhu.</p>
              </div>
            ) : (
              <>
                <h3 className="text-4xl font-black text-slate-900">{ctx.visibleTempEstimate.toFixed(1)}°C</h3>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
                    ctx.tempWarning ? "bg-red-50 text-red-600 border-red-200 animate-pulse" : "bg-emerald-50 text-emerald-600 border-emerald-200"
                  }`}>
                    {ctx.tempState}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold font-mono">DS3231 • {lastUpdate}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Card 2: Gas */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100 flex flex-col justify-between min-h-[170px] hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Status Gas / Asap</span>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.585A8 8 0 1120 12c0 2.13-.86 4.03-2.243 5.402z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            {!isOnline ? (
              <div className="text-slate-400 py-1">
                <p className="text-sm font-bold text-slate-600">Tidak Terhubung</p>
                <p className="text-xs text-slate-400">Sensor MQ-2 tidak online.</p>
              </div>
            ) : (
              <>
                <h3 className="text-4xl font-black text-slate-900">{ctx.gasPpm} PPM</h3>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
                    ctx.gasWarning ? "bg-red-50 text-red-600 border-red-200 animate-pulse" : "bg-emerald-50 text-emerald-600 border-emerald-200"
                  }`}>
                    {ctx.gasState}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold font-mono">MQ-2 • RAW: {ctx.visibleGasEstimate} • {lastUpdate}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Card 3: PIR */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100 flex flex-col justify-between min-h-[170px] hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Gerakan PIR</span>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 border border-orange-100 text-orange-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a1 1 0 100-2 1 1 0 000 2zM8 9h8a1.5 1.5 0 011.5 1.5v6M9 22V15m6 7v-7M12 9v6" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            {!isOnline ? (
              <div className="text-slate-400 py-1">
                <p className="text-sm font-bold text-slate-600">Tidak Terhubung</p>
                <p className="text-xs text-slate-400">Sensor PIR tidak online.</p>
              </div>
            ) : (
              <>
                <h3 className="text-4xl font-black text-slate-900">
                  {ctx.pirDetected ? "Ada Gerakan" : "Tidak Ada Gerakan"}
                </h3>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
                    ctx.pirDetected ? "bg-red-50 text-red-600 border-red-200 animate-pulse" : "bg-emerald-50 text-emerald-600 border-emerald-200"
                  }`}>
                    {ctx.pirDetected ? "Gerakan Terdeteksi" : "Aman"}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold font-mono">PIR Sensor • {lastUpdate}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Charts + Right Rail */}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="grid gap-6">
          <Panel title="Grafik Suhu Ruangan" subtitle="Visualisasi perubahan suhu real-time.">
            {!hasData ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                <p className="text-sm font-bold">Belum ada data sensor</p>
                <p className="text-xs mt-1">Menunggu telemetry dari ESP32-S3.</p>
              </div>
            ) : (
              <TemperatureChart value={ctx.visibleTempEstimate} series={ctx.tempHistory} />
            )}
          </Panel>

          <Panel title="Grafik Gas / Asap" subtitle="Visualisasi kadar gas/asap MQ-2 (RAW value).">
            {!isOnline ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                <p className="text-sm font-bold">Belum ada data sensor</p>
                <p className="text-xs mt-1">Menunggu telemetry dari ESP32-S3.</p>
              </div>
            ) : (
              <GasChart value={ctx.visibleGasEstimate} series={ctx.gasHistory} />
            )}
          </Panel>
        </div>

        <div className="grid gap-6 content-start">
          <Panel title="Timeline Gerakan PIR" subtitle="Riwayat gerakan terdeteksi terbaru.">
            <div className="grid gap-3">
              {pirEvents.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <p className="text-xs font-bold text-slate-400">Tidak ada riwayat gerakan terdeteksi baru-baru ini.</p>
                </div>
              ) : (
                pirEvents.map((evt) => (
                  <div key={evt.id} className="flex gap-3 items-start border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500 mt-1.5 shrink-0 animate-pulse" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">{evt.message || "Gerakan Terdeteksi"}</p>
                      <p className="text-xs text-slate-400 mt-0.5 font-semibold font-mono">
                        {new Date(evt.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Kondisi Ruangan" subtitle="Ringkasan status seluruh komponen ruangan.">
            <div className="grid gap-3">
              <SummaryBadgeRow label="Suhu" value={ctx.tempState} active={ctx.tempWarning} />
              <SummaryBadgeRow label="Gas" value={ctx.gasState} active={ctx.gasWarning} />
              <SummaryBadgeRow label="Gerakan" value={ctx.pirDetected ? "Ada" : "Tidak Ada"} active={ctx.pirDetected} />
              <SummaryBadgeRow label="MQTT" value={ctx.mqttOnline ? "Terhubung" : "Terputus"} active={!ctx.mqttOnline} />
              <SummaryBadgeRow label="ESP32" value={isOnline ? "Online" : "Offline"} active={!isOnline} />
            </div>
          </Panel>

          <Panel title="AI Assistant" subtitle={ctx.mqttOnline ? "Online" : "Menunggu broker"}>
            <div className="rounded-2xl bg-slate-100 p-5 text-sm leading-7 text-slate-700">
              <p className="font-bold text-slate-900">Halo! Saya SmartBox Assistant.</p>
              <p className="mt-1">Kondisi ruangan saat ini {ctx.tempState.toLowerCase()}, gas {ctx.gasState.toLowerCase()}, dan MQTT {ctx.mqttOnline ? "terhubung" : "offline"}.</p>
            </div>
          </Panel>

          <Panel title="Aktivitas Terbaru (MQTT/DB)" subtitle="Log event realtime.">
            <div className="grid gap-3">
              {ctx.events.length === 0 ? (
                <p className="text-xs font-semibold text-slate-400 py-2 text-center">Belum ada aktivitas.</p>
              ) : (
                ctx.events.slice(0, 5).map((evt) => (
                  <Activity
                    key={evt.id}
                    label={`[${evt.level}] ${evt.message || evt.type}`}
                    time={new Date(evt.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  />
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
