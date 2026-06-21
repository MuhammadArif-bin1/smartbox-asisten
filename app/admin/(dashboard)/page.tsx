"use client";

import { useSmartbox } from "@/lib/smartbox-context";
import { Panel } from "@/components/ui/Panel";
import { TemperatureChart } from "@/components/charts/TemperatureChart";
import { GasChart } from "@/components/charts/GasChart";
import { DetailedSensorCard } from "./DetailedSensorCard";

export default function MonitoringPage() {
  const ctx = useSmartbox();
  const isOnline = ctx.deviceStatuses.esp32;
  const tempUnit = "\u00b0C";
  const lastUpdate = isOnline
    ? (ctx.deviceStatuses.lastSeen && ctx.deviceStatuses.lastSeen !== "-" ? ctx.deviceStatuses.lastSeen : "Baru saja")
    : "-";

  return (
    <div className="grid gap-6">
      <Panel title="Detail Kondisi Ruangan" subtitle={`Sumber data: ${ctx.telemetrySource}`}>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <DetailedSensorCard
            title="Suhu Ruangan"
            value={isOnline ? (ctx.visibleTempEstimate > 0 ? `${ctx.visibleTempEstimate.toFixed(1)}${tempUnit}` : "Menunggu data...") : "Tidak Terhubung"}
            status={ctx.tempState}
            lastSeen={lastUpdate}
            online={isOnline}
            accent="blue"
            threshold={isOnline ? `Pemicu Stop Kontak: ${ctx.tempThreshold}${tempUnit}` : undefined}
            icon={
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v10.5a4.5 4.5 0 11-4 0V4a2 2 0 114 0z" />
              </svg>
            }
          />
          <DetailedSensorCard
            title="Sensor Gas / Asap"
            value={isOnline ? `${ctx.gasPpm} PPM` : "Tidak Terhubung"}
            status={ctx.gasState}
            lastSeen={lastUpdate}
            online={isOnline}
            accent="emerald"
            threshold={isOnline ? `Pemicu Alarm: ${ctx.gasThresholdPpm} PPM` : undefined}
            icon={
              <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.585A8 8 0 1120 12c0 2.13-.86 4.03-2.243 5.402z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <DetailedSensorCard
            title="Gerakan PIR"
            value={`${ctx.pirCount} Gerakan`}
            status={isOnline ? (ctx.pirDetected ? "Ada Gerakan" : "Aman") : "Offline"}
            lastSeen={lastUpdate}
            online={isOnline}
            accent="orange"
            onReset={ctx.resetPirCount}
            icon={
              <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a1 1 0 100-2 1 1 0 000 2zM8 9h8a1.5 1.5 0 011.5 1.5v6M9 22V15m6 7v-7M12 9v6" />
              </svg>
            }
          />
        </div>
      </Panel>

      <Panel title="Grafik Sensor Real-time" subtitle="Monitoring tren sensor dengan zona aman, waspada, dan batas alarm.">
        <div className="grid gap-5 xl:grid-cols-2">
          {isOnline && ctx.visibleTempEstimate > 0 ? (
            <TemperatureChart value={ctx.visibleTempEstimate} series={ctx.tempHistory} threshold={ctx.tempThreshold} />
          ) : (
            <div className="flex min-h-[390px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white p-6 text-sm font-bold text-slate-400 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.45)]">
              Menunggu data suhu...
            </div>
          )}
          {isOnline ? (
            <GasChart
              value={ctx.visibleGasEstimate}
              series={ctx.gasHistory}
              warningPpm={ctx.gasThresholdPpm}
              dangerPpm={ctx.gasThresholdPpm + 2}
            />
          ) : (
            <div className="flex min-h-[390px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white p-6 text-sm font-bold text-slate-400 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.45)]">
              Tidak terhubung.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
