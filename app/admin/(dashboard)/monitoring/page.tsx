"use client";

import { useSmartbox } from "@/lib/smartbox-context";
import { Panel } from "@/components/ui/Panel";
import { ControlRow } from "@/components/ui/ControlRow";
import { TemperatureChart } from "@/components/charts/TemperatureChart";
import { GasChart } from "@/components/charts/GasChart";
import { DetailedSensorCard } from "../DetailedSensorCard";

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
              onClick={() => {
                if (!ctx.isDemoMode) {
                  ctx.setIsDemoMode(true);
                }
                const isHigh = ctx.visibleTempEstimate > 35;
                const nextTemp = isHigh ? 28.1 : 42.5;
                ctx.setTempEstimate(nextTemp);
                ctx.notify(`[Simulasi] Suhu diatur ke ${isHigh ? "Normal" : "Tinggi (Peringatan)"}: ${nextTemp}°C`, "success");
              }}
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
              onClick={() => {
                if (!ctx.isDemoMode) {
                  ctx.setIsDemoMode(true);
                }
                const isDangerous = ctx.gasState === "Bahaya" || ctx.visibleGasEstimate >= 1800;
                const nextGasRaw = isDangerous ? 120 : 3500;
                ctx.setGasEstimate(nextGasRaw);
                ctx.setGasLevel(isDangerous ? "normal" : "bahaya");
                ctx.notify(`[Simulasi] Sensor Gas diatur ke ${isDangerous ? "Aman (2 PPM)" : "Bahaya (58 PPM)"}`, "success");
              }}
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
              onClick={() => {
                if (!ctx.isDemoMode) {
                  ctx.setIsDemoMode(true);
                }
                const nextPir = !ctx.pirDetected;
                ctx.setPirDetected(nextPir);
                ctx.notify(`[Simulasi] PIR: ${nextPir ? "Ada Gerakan" : "Aman"}`, "success");
              }}
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
          <ControlRow label="Sensor Gas" detail="Aktifkan atau nonaktifkan sensor gas MQ-2." enabled={ctx.gasEnabled} onToggle={ctx.toggleGas} disabled={!isOnline} />
          <ControlRow label="Sensor Suhu" detail="Kontrol pembacaan suhu dari sensor DS3231." enabled={ctx.temperatureEnabled} onToggle={ctx.toggleTemperature} disabled={!isOnline} />
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
          <div className={`flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:border-slate-300 ${!isOnline ? "opacity-50" : ""}`}>
            <div>
              <p className="text-base font-bold text-slate-900">Kalibrasi Sensor Gas</p>
              <p className="mt-1 text-sm font-semibold text-slate-400">Mulai kalibrasi baseline sensor MQ-2.</p>
            </div>
            <button
              onClick={() => {
                ctx.sendDeviceCommand("sensor.calibrate", { samples: 100 }, "Kalibrasi MQ-2", "Kalibrasi dimulai", "Gagal mengirim kalibrasi");
              }}
              disabled={!isOnline}
              className="h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 shadow-md transition active:scale-95 disabled:bg-slate-400 disabled:cursor-not-allowed shrink-0"
              type="button"
            >
              Kalibrasi
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
