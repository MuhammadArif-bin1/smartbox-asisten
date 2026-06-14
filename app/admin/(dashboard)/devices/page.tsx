"use client";

import { useEffect, useState } from "react";
import { useSmartbox } from "@/lib/smartbox-context";
import { audioTracks, daysOfWeek } from "@/lib/smartbox-constants";
import { Panel } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/Switch";
import { AutoOffCountdown } from "./AutoOffCountdown";

export default function DevicesPage() {
  const ctx = useSmartbox();
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [testTrack, setTestTrack] = useState(1);
  const isSending = ctx.status === "sending";

  const [editingSchedule, setEditingSchedule] = useState<{ id?: string; name: string; relayNumber: number; startTime: string; endTime: string; days: string; enabled: boolean } | null>(null);
  const [schName, setSchName] = useState("");
  const [schRelay, setSchRelay] = useState(1);
  const [schStart, setSchStart] = useState("08:00");
  const [schEnd, setSchEnd] = useState("18:00");
  const [schDays, setSchDays] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  const [schEnabled, setSchEnabled] = useState(true);

  useEffect(() => {
    if (editingSchedule) {
      setSchName(editingSchedule.name);
      setSchRelay(editingSchedule.relayNumber);
      setSchStart(editingSchedule.startTime);
      setSchEnd(editingSchedule.endTime);
      try { setSchDays(JSON.parse(editingSchedule.days)); } catch { setSchDays(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]); }
      setSchEnabled(editingSchedule.enabled);
    } else {
      setSchName(""); setSchRelay(1); setSchStart("08:00"); setSchEnd("18:00");
      setSchDays(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]); setSchEnabled(true);
    }
  }, [editingSchedule]);

  const handleSchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schName.trim()) { ctx.notify("Nama jadwal wajib diisi", "error"); return; }
    await ctx.saveRelaySchedule({
      id: editingSchedule?.id, name: schName.trim(), relayNumber: schRelay,
      startTime: schStart, endTime: schEnd, days: JSON.stringify(schDays), enabled: schEnabled,
    });
    setEditingSchedule(null);
  };

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-7 text-white shadow-xl shadow-blue-100/40">
        <h2 className="text-2xl font-black">Devices Control</h2>
        <p className="mt-2 text-base text-blue-100 font-medium leading-relaxed max-w-2xl">
          Kelola stop kontak, relay Bluetooth, alarm buzzer, dan uji track suara DFPlayer secara real-time.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        {/* Status Perangkat */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50 flex flex-col justify-between h-full min-h-[220px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Status Perangkat</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black border ${
                ctx.deviceStatuses.esp32 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-red-50 text-red-500 border-red-200"
              }`}>
                <span className={`h-2 w-2 rounded-full ${ctx.deviceStatuses.esp32 ? "bg-emerald-500 animate-pulse" : "bg-red-400"}`} />
                {ctx.deviceStatuses.esp32 ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <div className="mt-5 grid gap-2.5">
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2.5">
                <span className="font-semibold text-slate-500 font-mono">IP ESP32</span>
                <span className="font-mono font-bold text-slate-800">{ctx.deviceStatuses.ip || "-"}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2.5 font-mono">
                <span className="font-semibold text-slate-500">RSSI</span>
                <span className="font-bold text-slate-800">{ctx.deviceStatuses.rssi ? `${ctx.deviceStatuses.rssi} dBm` : "-"}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-mono">
                <span className="font-semibold text-slate-500">Last Seen</span>
                <span className="font-bold text-slate-800">{ctx.deviceStatuses.lastSeen || "-"}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${ctx.deviceStatuses.rtc ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>RTC DS3231</span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${ctx.deviceStatuses.lcd ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>LCD I2C</span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${ctx.deviceStatuses.dfPlayer ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>DFPlayer</span>
          </div>
        </div>

        {/* Kontrol Relay */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50">
          <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-4">Kontrol Relay</h3>
          <div className="grid gap-4">
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Stop Kontak 1 (Kipas)</p>
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
                  <p className="text-sm font-bold text-slate-900">Stop Kontak 2 (Charger)</p>
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
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-4">Buzzer & Test Suara</h3>
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4 mb-4">
              <div>
                <p className="text-sm font-bold text-slate-900">Buzzer Alarm</p>
                <p className="text-xs text-slate-500">Bunyi Peringatan</p>
              </div>
              <Switch checked={ctx.buzzerEnabled} disabled={isSending} onChange={() => {
                const next = !ctx.buzzerEnabled;
                ctx.setBuzzerEnabled(next);
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
      </div>

      {/* Relay Schedules */}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Panel title="Jadwal Otomatis Stop Kontak" subtitle="Daftar jadwal aktif untuk menyalakan/mematikan Stop Kontak 1 dan 2 secara otomatis.">
          <div className="grid gap-3">
            {ctx.relaySchedules.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-3xl bg-slate-50">
                <p className="text-sm font-bold text-slate-400">Belum ada jadwal otomatis dikonfigurasi.</p>
              </div>
            ) : (
              ctx.relaySchedules.map((sch) => {
                let activeDays: string[] = [];
                try { activeDays = JSON.parse(sch.days); } catch { activeDays = []; }
                return (
                  <div key={sch.id} className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{sch.name}</p>
                      <p className="text-xs text-slate-500 font-semibold mt-1">Stop Kontak {sch.relayNumber} • {sch.startTime} - {sch.endTime}</p>
                      <div className="flex gap-1 mt-2">
                        {daysOfWeek.map((day) => {
                          const active = activeDays.includes(day.id);
                          return (
                            <span key={day.id} className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              active ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-slate-50 text-slate-300 border border-slate-100"
                            } border`}>
                              {day.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-0 pt-3 sm:pt-0">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
                        sch.enabled ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"
                      }`}>
                        {sch.enabled ? "Aktif" : "Nonaktif"}
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={() => { ctx.saveRelaySchedule({ ...sch, enabled: !sch.enabled }); }} className="h-9 w-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition" title={sch.enabled ? "Nonaktifkan" : "Aktifkan"} type="button">⚡</button>
                        <button onClick={() => setEditingSchedule(sch)} className="h-9 w-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition" title="Edit" type="button">✏️</button>
                        <button onClick={() => ctx.deleteRelaySchedule(sch.id)} className="h-9 w-9 rounded-lg bg-red-50 text-red-600 border-red-200 flex items-center justify-center hover:bg-red-100 transition" title="Hapus" type="button">🗑️</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel title={editingSchedule ? "Edit Jadwal Otomatis" : "Tambah Jadwal Otomatis"} subtitle="Atur jam operasional Stop Kontak 1/2.">
          <form onSubmit={handleSchSubmit} className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-500">Nama Jadwal</span>
              <input type="text" value={schName} onChange={(e) => setSchName(e.target.value)} placeholder="Misal: Charger Laptop Malam" className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 font-medium" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-500">Stop Kontak</span>
                <select value={schRelay} onChange={(e) => setSchRelay(Number(e.target.value))} className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500">
                  <option value={1}>Stop Kontak 1 (Kipas)</option>
                  <option value={2}>Stop Kontak 2 (Charger)</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-slate-500">Mulai</span>
                  <input type="time" value={schStart} onChange={(e) => setSchStart(e.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-500 font-bold text-center" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-slate-500">Selesai</span>
                  <input type="time" value={schEnd} onChange={(e) => setSchEnd(e.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-500 font-bold text-center" />
                </label>
              </div>
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-bold text-slate-500">Hari Operasional</span>
              <div className="flex flex-wrap gap-1.5">
                {daysOfWeek.map((day) => {
                  const active = schDays.includes(day.id);
                  return (
                    <button type="button" key={day.id} onClick={() => setSchDays((current) => current.includes(day.id) ? current.filter((item) => item !== day.id) : [...current, day.id])} className={`h-9 rounded-lg px-3 text-xs font-bold transition ${active ? "bg-blue-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-bold text-slate-800">Aktifkan Jadwal</p>
              <Switch checked={schEnabled} onChange={() => setSchEnabled(!schEnabled)} />
            </div>
            <div className="flex gap-2 justify-end mt-2">
              {editingSchedule && (
                <button type="button" onClick={() => setEditingSchedule(null)} className="h-11 px-5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition">Batal</button>
              )}
              <button type="submit" className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-100 transition">
                {editingSchedule ? "Simpan Perubahan" : "Simpan Jadwal"}
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
