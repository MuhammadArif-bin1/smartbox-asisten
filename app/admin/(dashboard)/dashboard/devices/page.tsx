"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSmartbox } from "@/lib/smartbox-context";
import { audioTracks } from "@/lib/smartbox-constants";
import { Switch } from "@/components/ui/Switch";
import { AutoOffCountdown } from "../../devices/AutoOffCountdown";
import { ControlRow } from "@/components/ui/ControlRow";
import { Panel } from "@/components/ui/Panel";

export default function DashboardDevicesPage() {
  const ctx = useSmartbox();
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [testTrack, setTestTrack] = useState(1);
  const isSending = ctx.status === "sending";
  const isOnline = ctx.deviceStatuses.esp32;

  const [isEditingLabel1, setIsEditingLabel1] = useState(false);
  const [isEditingLabel2, setIsEditingLabel2] = useState(false);
  const [tempLabel1, setTempLabel1] = useState("");
  const [tempLabel2, setTempLabel2] = useState("");

  useEffect(() => {
    setTempLabel1(ctx.relay1Label);
  }, [ctx.relay1Label]);

  useEffect(() => {
    setTempLabel2(ctx.relay2Label);
  }, [ctx.relay2Label]);

  return (
    <div className="grid gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/dashboard" className="text-blue-600 font-bold hover:underline">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500 font-semibold">Pusat Kontrol Manual</span>
      </div>

      <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-7 text-white shadow-xl shadow-blue-100/40">
        <h2 className="text-2xl font-black">Pusat Kontrol Manual</h2>
        <p className="mt-2 text-base text-blue-100 font-medium leading-relaxed max-w-2xl">
          Pusat kontrol terpadu untuk mengendalikan Stop Kontak 1 & 2 secara manual, mengaktifkan/menonaktifkan Relay Bluetooth (audio amplifier), menyalakan alarm buzzer, melakukan uji coba pemutaran trek suara pada modul DFPlayer Mini, serta mengatur ambang batas suhu dan kadar gas sensitivitas sensor secara real-time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Relay & Audio Controls */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Kontrol Relay */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50">
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-4">Kontrol Relay</h3>
            <div className="grid gap-4">
              <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    {isEditingLabel1 ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <input
                          type="text"
                          value={tempLabel1}
                          onChange={(e) => setTempLabel1(e.target.value)}
                          className="text-xs font-bold text-slate-900 border border-slate-300 rounded px-1.5 py-0.5 outline-none focus:border-blue-500 max-w-[120px]"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (tempLabel1.trim()) {
                              ctx.saveRelay1Label(tempLabel1.trim());
                            }
                            setIsEditingLabel1(false);
                          }}
                          className="text-[10px] bg-blue-600 text-white font-extrabold px-1.5 py-0.5 rounded transition active:scale-95"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTempLabel1(ctx.relay1Label);
                            setIsEditingLabel1(false);
                          }}
                          className="text-[10px] bg-slate-100 text-slate-500 font-extrabold px-1.5 py-0.5 rounded transition active:scale-95"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-slate-900">{ctx.relay1Label}</p>
                        <button
                          type="button"
                          onClick={() => setIsEditingLabel1(true)}
                          className="text-slate-400 hover:text-blue-600 transition text-[10px]"
                          title="Ubah Label"
                        >
                          ✏️
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-500">Auto mati setelah 1 menit</p>
                  </div>
                  <Switch checked={ctx.relayState.socket1} disabled={isSending} onChange={() => ctx.toggleRelay("socket1")} />
                </div>
                {ctx.relayState.socket1 && ctx.relayAutoOffAt.socket1 && (
                  <AutoOffCountdown deadline={ctx.relayAutoOffAt.socket1} />
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    {isEditingLabel2 ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <input
                          type="text"
                          value={tempLabel2}
                          onChange={(e) => setTempLabel2(e.target.value)}
                          className="text-xs font-bold text-slate-900 border border-slate-300 rounded px-1.5 py-0.5 outline-none focus:border-blue-500 max-w-[120px]"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (tempLabel2.trim()) {
                              ctx.saveRelay2Label(tempLabel2.trim());
                            }
                            setIsEditingLabel2(false);
                          }}
                          className="text-[10px] bg-blue-600 text-white font-extrabold px-1.5 py-0.5 rounded transition active:scale-95"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTempLabel2(ctx.relay2Label);
                            setIsEditingLabel2(false);
                          }}
                          className="text-[10px] bg-slate-100 text-slate-500 font-extrabold px-1.5 py-0.5 rounded transition active:scale-95"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-slate-900">{ctx.relay2Label}</p>
                        <button
                          type="button"
                          onClick={() => setIsEditingLabel2(true)}
                          className="text-slate-400 hover:text-blue-600 transition text-[10px]"
                          title="Ubah Label"
                        >
                          ✏️
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-500">Auto mati setelah 1 menit</p>
                  </div>
                  <Switch checked={ctx.relayState.socket2} disabled={isSending} onChange={() => ctx.toggleRelay("socket2")} />
                </div>
                {ctx.relayState.socket2 && ctx.relayAutoOffAt.socket2 && (
                  <AutoOffCountdown deadline={ctx.relayAutoOffAt.socket2} />
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Relay Bluetooth</p>
                    <p className="text-xs text-slate-500 font-mono">{ctx.relayState.ampli ? "Bluetooth Aktif" : "Bluetooth Mati"}</p>
                  </div>
                  <Switch checked={ctx.relayState.ampli} disabled={isSending} onChange={() => ctx.toggleRelay("ampli")} />
                </div>
              </div>
            </div>
          </div>

          {/* Buzzer & Test Suara */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50 flex flex-col">
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-4">Buzzer & Test Suara</h3>
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4 mb-4">
              <div>
                <p className="text-sm font-bold text-slate-900">Buzzer Alarm</p>
                <p className="text-xs text-slate-500">Bunyi Peringatan</p>
              </div>
              <Switch checked={ctx.buzzerEnabled} disabled={isSending} onChange={() => {
                const next = !ctx.buzzerEnabled;
                ctx.setBuzzerEnabled(next, true);
                ctx.sendDeviceCommand("buzzer.set", { state: next }, `Buzzer ${next ? "aktif" : "mati"}`);
              }} />
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-bold text-slate-900 mb-3">Test DFPlayer Suara</p>
              <div className="flex gap-2">
                <select
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none flex-1 focus:ring-2 focus:ring-blue-500/20"
                  value={testTrack}
                  onChange={(e) => setTestTrack(Number(e.target.value))}
                  disabled={isPlayingTest || isSending}
                >
                  {audioTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.id.toString().padStart(4, "0")} - {track.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    setIsPlayingTest(true);
                    await ctx.sendDeviceCommand("voice.play", { track: testTrack, reason: "manual_test" }, "Play Suara", "Perintah suara dikirim", "Gagal mengirim perintah");
                    setIsPlayingTest(false);
                  }}
                  disabled={isPlayingTest || isSending}
                  className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 active:scale-95 disabled:bg-slate-400"
                  type="button"
                >
                  {isPlayingTest || isSending ? "Mengirim..." : "Play"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sensor Controls */}
        <div className="lg:col-span-7">
          <Panel title="Kontrol Sensor" subtitle="Atur konfigurasi sensitivitas dan status sensor ESP32-S3.">
            {!isOnline && (
              <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm font-bold text-red-600 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span>ESP32-S3 sedang offline. Kontrol dinonaktifkan.</span>
              </div>
            )}
            <div className="grid gap-4">
              {/* Sensor Gas */}
              <div className={`rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:border-slate-300 ${!isOnline ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-black text-slate-900">Sensor Gas (MQ-2)</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 leading-normal">Aktifkan atau nonaktifkan pembacaan sensor gas MQ-2.</p>
                  </div>
                  <Switch checked={ctx.gasEnabled} onChange={ctx.toggleGas} disabled={!isOnline} />
                </div>
                {ctx.gasEnabled && isOnline && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-bold text-slate-500">Kadar Gas Terkini:</span>
                        <span className="text-blue-600 bg-blue-50 py-2.5 rounded-2xl font-mono font-black text-4xl text-center border border-blue-100 shadow-inner">
                          {ctx.gasPpm > 0 ? `${ctx.gasPpm} PPM` : "..."}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-bold text-slate-500">Ambang Batas Alarm Gas:</span>
                        <span className="text-rose-600 bg-rose-50 py-2.5 rounded-2xl font-mono font-black text-4xl text-center border border-rose-100 shadow-inner">{ctx.gasThresholdPpm} PPM</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={ctx.gasThresholdPpm}
                      onChange={(e) => ctx.updateGasThreshold(Number(e.target.value))}
                      className="w-full h-4 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-600"
                    />
                    <div className="flex justify-between text-xs text-slate-500 font-bold mt-2 font-mono">
                      <span>5 PPM</span>
                      <span className="text-slate-400 font-semibold">21 PPM (Default)</span>
                      <span>50 PPM</span>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Buzzer Peringatan Gas</p>
                        <p className="text-xs text-slate-500">Bunyi alarm lokal saat bahaya gas terdeteksi.</p>
                      </div>
                      <Switch checked={ctx.gasBuzzerWarningEnabled} onChange={ctx.toggleGasBuzzerWarning} disabled={!isOnline} />
                    </div>
                  </div>
                )}
              </div>

              {/* Sensor Suhu */}
              <div className={`rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:border-slate-300 ${!isOnline ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-black text-slate-900">Sensor Suhu (DS3231)</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 leading-normal">Kontrol pembacaan suhu dari modul RTC DS3231.</p>
                  </div>
                  <Switch checked={ctx.temperatureEnabled} onChange={ctx.toggleTemperature} disabled={!isOnline} />
                </div>
                {ctx.temperatureEnabled && isOnline && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-bold text-slate-500">Suhu Terkini:</span>
                        <span className="text-blue-600 bg-blue-50 py-2.5 rounded-2xl font-mono font-black text-4xl text-center border border-blue-100 shadow-inner">
                          {ctx.visibleTempEstimate > 0 ? `${ctx.visibleTempEstimate.toFixed(1)}°C` : "..."}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-bold text-slate-500">Suhu Pemicu Stop Kontak:</span>
                        <span className="text-rose-600 bg-rose-50 py-2.5 rounded-2xl font-mono font-black text-4xl text-center border border-rose-100 shadow-inner">{ctx.tempThreshold}°C</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="50"
                      value={ctx.tempThreshold}
                      onChange={(e) => ctx.updateTempThreshold(Number(e.target.value))}
                      className="w-full h-4 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-600"
                    />
                    <div className="flex justify-between text-xs text-slate-500 font-bold mt-2 font-mono">
                      <span>20°C</span>
                      <span className="text-slate-400 font-semibold">38°C (Default)</span>
                      <span>50°C</span>
                    </div>
                  </div>
                )}
              </div>

              <ControlRow label="Sensor PIR (Gerakan)" detail="Aktifkan atau nonaktifkan deteksi gerakan PIR." enabled={ctx.pirEnabled} onToggle={ctx.togglePir} disabled={!isOnline} />
              <ControlRow label="Sleep Mode" detail="Matikan LCD & relay jika tidak ada gerakan selama 1 jam." enabled={ctx.sleepModeEnabled} onToggle={ctx.toggleSleepMode} disabled={!isOnline} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
