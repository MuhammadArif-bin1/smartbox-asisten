"use client";

import { useSmartbox } from "@/lib/smartbox-context";
import { Panel } from "@/components/ui/Panel";
import { ControlRow } from "@/components/ui/ControlRow";
import { Switch } from "@/components/ui/Switch";
import { TemperatureChart } from "@/components/charts/TemperatureChart";
import { GasChart } from "@/components/charts/GasChart";
import { DetailedSensorCard } from "./DetailedSensorCard";

export default function MonitoringPage() {
  const ctx = useSmartbox();
  const isOnline = ctx.deviceStatuses.esp32;
  const lastUpdate = isOnline ? (ctx.deviceStatuses.lastSeen && ctx.deviceStatuses.lastSeen !== "-" ? ctx.deviceStatuses.lastSeen : "Baru saja") : "-";

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="grid gap-6">
        <Panel title="Detail Kondisi Ruangan" subtitle={`Sumber data: ${ctx.telemetrySource}`}>
          <div className="grid gap-4 md:grid-cols-3">
            <DetailedSensorCard
              title="Suhu Ruangan"
              value={isOnline ? (ctx.visibleTempEstimate > 0 ? `${ctx.visibleTempEstimate.toFixed(1)}°C` : "Menunggu data...") : "Tidak Terhubung"}
              status={ctx.tempState}
              lastSeen={lastUpdate}
              online={isOnline}
              accent="blue"
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
              icon={
                <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.585A8 8 0 1120 12c0 2.13-.86 4.03-2.243 5.402z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <DetailedSensorCard
              title="Gerakan PIR"
              value={isOnline ? (ctx.pirDetected ? "Gerakan Terdeteksi" : "Tidak Ada Gerakan") : "Tidak Terhubung"}
              status={isOnline ? (ctx.pirDetected ? "Ada Gerakan" : "Aman") : "Offline"}
              lastSeen={lastUpdate}
              online={isOnline}
              accent="orange"
              icon={
                <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a1 1 0 100-2 1 1 0 000 2zM8 9h8a1.5 1.5 0 011.5 1.5v6M9 22V15m6 7v-7M12 9v6" />
                </svg>
              }
            />
          </div>
        </Panel>

        <Panel title="Grafik Sensor Real-time" subtitle="Monitoring grafik sensor suhu dan gas.">
          <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Grafik Suhu</p>
                {isOnline && ctx.visibleTempEstimate > 0 ? (
                   <TemperatureChart value={ctx.visibleTempEstimate} series={ctx.tempHistory} />
                ) : (
                  <div className="flex items-center justify-center h-[280px] rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-sm font-bold">
                    Menunggu data...
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Grafik Gas</p>
                {isOnline ? (
                  <GasChart value={ctx.visibleGasEstimate} series={ctx.gasHistory} />
                ) : (
                  <div className="flex items-center justify-center h-[280px] rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-sm font-bold">
                    Tidak terhubung.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Kontrol Sensor" subtitle="Atur konfigurasi sensitivitas dan status sensor ESP32-S3.">
        {!isOnline && (
          <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm font-bold text-red-600 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span>ESP32-S3 sedang offline. Kontrol dinonaktifkan.</span>
          </div>
        )}
        <div className="grid gap-3">
          {/* Sensor Gas */}
          <div className={`rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:border-slate-300 ${!isOnline ? "opacity-50 animate-pulse-slow" : ""}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-bold text-slate-900">Sensor Gas</p>
                <p className="mt-1 text-sm text-slate-500">Aktifkan atau nonaktifkan sensor gas MQ-2.</p>
              </div>
              <Switch checked={ctx.gasEnabled} onChange={ctx.toggleGas} disabled={!isOnline} />
            </div>
            {ctx.gasEnabled && isOnline && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex flex-col gap-2 mb-4">
                  <span className="text-lg font-bold text-slate-600">Ambang Batas Alarm Gas:</span>
                  <span className="text-blue-600 bg-blue-50 py-2 rounded-xl font-mono font-black text-4xl text-center border border-blue-100 shadow-sm">{ctx.gasThresholdPpm} PPM</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={ctx.gasThresholdPpm}
                  onChange={(e) => ctx.updateGasThreshold(Number(e.target.value))}
                  className="w-full h-4 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-base text-slate-500 font-bold mt-2 font-mono">
                  <span>5 PPM</span>
                  <span className="text-slate-400">21 PPM (Default)</span>
                  <span>50 PPM</span>
                </div>
              </div>
            )}
          </div>

          {/* Sensor Suhu */}
          <div className={`rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:border-slate-300 ${!isOnline ? "opacity-50 animate-pulse-slow" : ""}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-bold text-slate-900">Sensor Suhu</p>
                <p className="mt-1 text-sm text-slate-500">Kontrol pembacaan suhu dari sensor DS3231.</p>
              </div>
              <Switch checked={ctx.temperatureEnabled} onChange={ctx.toggleTemperature} disabled={!isOnline} />
            </div>
            {ctx.temperatureEnabled && isOnline && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex flex-col gap-2 mb-4">
                  <span className="text-lg font-bold text-slate-600">Suhu Pemicu Stop Kontak:</span>
                  <span className="text-rose-600 bg-rose-50 py-2 rounded-xl font-mono font-black text-4xl text-center border border-rose-100 shadow-sm">{ctx.tempThreshold}°C</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="50"
                  value={ctx.tempThreshold}
                  onChange={(e) => ctx.updateTempThreshold(Number(e.target.value))}
                  className="w-full h-4 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-600"
                />
                <div className="flex justify-between text-base text-slate-500 font-bold mt-2 font-mono">
                  <span>20°C</span>
                  <span className="text-slate-400">38°C (Default)</span>
                  <span>50°C</span>
                </div>
              </div>
            )}
          </div>

          <ControlRow label="Sensor PIR (Gerakan)" detail="Aktifkan atau nonaktifkan deteksi gerakan." enabled={ctx.pirEnabled} onToggle={ctx.togglePir} disabled={!isOnline} />
          <ControlRow label="Sleep Mode" detail="Matikan LCD & relay jika tidak ada gerakan 1 jam." enabled={ctx.sleepModeEnabled} onToggle={ctx.toggleSleepMode} disabled={!isOnline} />
          <ControlRow
            label="Alarm Buzzer"
            detail="Bunyi peringatan lokal jika bahaya terdeteksi."
            enabled={ctx.buzzerEnabled}
            disabled={!isOnline}
            onToggle={() => {
              const next = !ctx.buzzerEnabled;
              ctx.setBuzzerEnabled(next);
              ctx.sendDeviceCommand("buzzer.set", { state: next }, `Buzzer ${next ? "aktif" : "mati"}`);
            }}
          />
        </div>
      </Panel>
    </div>
  );
}
