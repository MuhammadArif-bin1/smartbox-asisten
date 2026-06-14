"use client";

import { useEffect, useState } from "react";
import { useSmartbox } from "@/lib/smartbox-context";
import { audioTracks, daysOfWeek } from "@/lib/smartbox-constants";
import { Panel } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/Switch";
import { LiveClockCard } from "./LiveClockCard";

export default function AlarmsPage() {
  const ctx = useSmartbox();
  const [editingSchedule, setEditingSchedule] = useState<{ id?: string; name: string; time: string; track: number; active: boolean } | null>(null);
  const [formName, setFormName] = useState("");
  const [formTime, setFormTime] = useState("08:00");
  const [formTrack, setFormTrack] = useState(4);
  const [formActive, setFormActive] = useState(true);

  const [savingPirGreeting, setSavingPirGreeting] = useState(false);
  const [localPirGreetingTrack, setLocalPirGreetingTrack] = useState(ctx.pirGreetingTrack || 10);
  const [localPirGreetingStart, setLocalPirGreetingStart] = useState(ctx.pirGreetingStart || "07:00");
  const [localPirGreetingEnd, setLocalPirGreetingEnd] = useState(ctx.pirGreetingEnd || "22:00");
  const [localPirGreetingCooldown, setLocalPirGreetingCooldown] = useState(ctx.pirGreetingCooldown || 10);
  const [localPirGreetingPlayMode, setLocalPirGreetingPlayMode] = useState(ctx.pirGreetingPlayMode || "cooldown");
  const [localPirGreetingDays, setLocalPirGreetingDays] = useState<string[]>(ctx.pirGreetingDays || []);

  useEffect(() => {
    setLocalPirGreetingTrack(ctx.pirGreetingTrack || 10);
    setLocalPirGreetingStart(ctx.pirGreetingStart || "07:00");
    setLocalPirGreetingEnd(ctx.pirGreetingEnd || "22:00");
    setLocalPirGreetingCooldown(ctx.pirGreetingCooldown || 10);
    setLocalPirGreetingPlayMode(ctx.pirGreetingPlayMode || "cooldown");
    setLocalPirGreetingDays(ctx.pirGreetingDays || []);
  }, [ctx.pirGreetingCooldown, ctx.pirGreetingDays, ctx.pirGreetingEnd, ctx.pirGreetingPlayMode, ctx.pirGreetingStart, ctx.pirGreetingTrack]);

  useEffect(() => {
    if (editingSchedule) {
      setFormName(editingSchedule.name);
      setFormTime(editingSchedule.time);
      setFormTrack(editingSchedule.track);
      setFormActive(editingSchedule.active);
    } else {
      setFormName("");
      setFormTime("08:00");
      setFormTrack(4);
      setFormActive(true);
    }
  }, [editingSchedule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      ctx.notify("Nama pengingat wajib diisi", "error");
      return;
    }
    await ctx.onSaveSchedule({
      id: editingSchedule?.id,
      name: formName.trim(),
      time: formTime,
      track: formTrack,
      active: formActive
    });
    setEditingSchedule(null);
  };

  async function savePirGreeting(enabled = ctx.pirGreetingEnabled) {
    setSavingPirGreeting(true);
    await ctx.updatePirGreetingConfig(
      enabled,
      localPirGreetingTrack,
      localPirGreetingStart,
      localPirGreetingEnd,
      localPirGreetingCooldown,
      localPirGreetingPlayMode,
      localPirGreetingDays
    );
    setSavingPirGreeting(false);
  }

  return (
    <div className="grid gap-6">
      {/* Blue Themed Live Clock Card */}
      <LiveClockCard online={ctx.deviceStatuses.esp32} rtcReady={ctx.deviceStatuses.rtc} />

      {/* Main Content Layout */}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        
        {/* Left Column: DFPlayer Schedules List */}
        <Panel 
          title="Jadwal Alarm DFPlayer" 
          subtitle="Jadwal alarm otomatis untuk suara/sapaan otomatis melalui DFPlayer."
        >
          <div className="grid gap-4">
            {ctx.alarmSchedules.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-slate-200/80 rounded-3xl bg-slate-50/50 flex flex-col items-center justify-center p-6">
                <div className="p-4 bg-slate-100 rounded-full text-slate-400 mb-4">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <h3 className="text-base font-extrabold text-slate-800">Belum Ada Jadwal Alarm</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-[280px] leading-relaxed">
                  Jadwalkan pemutaran audio otomatis dari DFPlayer melalui panel pembuatan di samping.
                </p>
              </div>
            ) : (
              ctx.alarmSchedules.map((sch) => {
                const trackInfo = audioTracks.find((t) => t.id === sch.track);
                const isCurrentlyEditing = editingSchedule?.id === sch.id;
                
                return (
                  <div 
                    key={sch.id} 
                    className={`flex flex-col sm:flex-row justify-between sm:items-center gap-4 rounded-3xl border p-5 shadow-sm transition-all duration-300 ${
                      isCurrentlyEditing 
                        ? "border-blue-500 bg-blue-50/20 ring-4 ring-blue-500/10" 
                        : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Digital Clock Box */}
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 font-mono text-xl font-black border border-blue-100 shadow-inner">
                        {sch.time}
                      </div>
                      
                      {/* Details */}
                      <div className="min-w-0">
                        <p className="text-base font-extrabold text-slate-900 truncate tracking-tight">{sch.name}</p>
                        <div className="text-sm font-semibold text-slate-500 truncate mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-xs font-bold text-slate-600">
                            Track {String(sch.track).padStart(4, "0")}
                          </span>
                          <span className="text-slate-300 hidden sm:inline">•</span>
                          <span className="truncate">{trackInfo?.label || "Unknown Track"}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Status and Action Buttons */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 pt-4 sm:pt-0">
                      {/* Active Status Tag */}
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border transition-colors ${
                        sch.active 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-slate-50 text-slate-400 border-slate-200"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sch.active ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                        {sch.active ? "Aktif" : "Nonaktif"}
                      </span>
                      
                      {/* Action Button Group */}
                      <div className="flex items-center gap-2">
                        {/* Toggle Active Button */}
                        <button 
                          onClick={() => ctx.onToggleScheduleActive(sch.id, sch.active)} 
                          className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all border shadow-sm active:scale-95 ${
                            sch.active 
                              ? "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200" 
                              : "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                          }`}
                          title={sch.active ? "Nonaktifkan" : "Aktifkan"} 
                          type="button"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 3v9" />
                          </svg>
                        </button>
                        
                        {/* Edit Button */}
                        <button 
                          onClick={() => setEditingSchedule(sch)} 
                          className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-all active:scale-95 ${
                            isCurrentlyEditing 
                              ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/15" 
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                          title="Edit" 
                          type="button"
                        >
                          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        
                        {/* Test Play Button */}
                        <button 
                          onClick={() => ctx.onTestPlayVoice(sch.track)} 
                          className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 hover:text-emerald-700 transition-all active:scale-95"
                          title="Uji Putar Suara" 
                          type="button"
                        >
                          <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                        
                        {/* Delete Button */}
                        <button 
                          onClick={() => ctx.onDeleteSchedule(sch.id)} 
                          className="h-10 w-10 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center hover:bg-red-100 hover:text-red-700 transition-all active:scale-95"
                          title="Hapus" 
                          type="button"
                        >
                          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        {/* Right Column: Edit/Create Alarm & PIR Settings */}
        <div className="grid gap-6">
          
          {/* Panel Form Alarm */}
          <Panel 
            title={editingSchedule ? "Edit Alarm Jadwal" : "Tambah Alarm Jadwal"} 
            subtitle={editingSchedule ? "Perbarui detail alarm yang sudah ada." : "Buat pengingat suara otomatis baru."}
          >
            <form onSubmit={handleSubmit} className="grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-500">Nama Pengingat</span>
                <input 
                  type="text" 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)} 
                  placeholder="Misal: Pengingat Pagi" 
                  className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                />
              </label>
              
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-slate-500">Jam Alarm (24 Jam)</span>
                  <input 
                    type="time" 
                    value={formTime} 
                    onChange={(e) => setFormTime(e.target.value)} 
                    className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                  />
                </label>
                
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-slate-500">Track DFPlayer</span>
                  <select 
                    value={formTrack} 
                    onChange={(e) => setFormTrack(Number(e.target.value))} 
                    className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                  >
                    {audioTracks.map((track) => (
                      <option key={track.id} value={track.id}>
                        {String(track.id).padStart(4, "0")} - {track.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              
              <div className="flex justify-between items-center bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-colors hover:bg-slate-100/30">
                <div>
                  <p className="text-sm font-extrabold text-slate-800">Status Awal</p>
                  <p className="text-xs text-slate-400 mt-0.5">Jadwal langsung berjalan jika aktif.</p>
                </div>
                <Switch checked={formActive} onChange={() => setFormActive(!formActive)} />
              </div>
              
              <div className="flex gap-3 justify-end mt-2">
                {editingSchedule && (
                  <button 
                    type="button" 
                    onClick={() => setEditingSchedule(null)} 
                    className="h-11 px-5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    Batal
                  </button>
                )}
                <button 
                  type="submit" 
                  className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-extrabold hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                >
                  {editingSchedule ? "Simpan Perubahan" : "Simpan Jadwal"}
                </button>
              </div>
            </form>
          </Panel>

          {/* Panel Setting PIR Wakeup */}
          <Panel 
            title="Greeting Wakeup PIR" 
            subtitle="Atur greeting suara ketika PIR mendeteksi gerakan."
          >
            <div className="grid gap-5">
              {/* Enabled switch card */}
              <div className="flex justify-between items-center bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:shadow-md">
                <div>
                  <p className="text-base font-extrabold text-slate-800">Status Greeting PIR</p>
                  <p className="text-sm text-slate-500 mt-0.5">Mainkan suara sapaan secara otomatis saat mendeteksi gerakan.</p>
                </div>
                <Switch 
                  checked={ctx.pirGreetingEnabled} 
                  disabled={savingPirGreeting} 
                  onChange={() => savePirGreeting(!ctx.pirGreetingEnabled)} 
                />
              </div>

              {/* Form Config Block */}
              <div className={`grid gap-5 p-5 rounded-2xl border border-slate-200/80 transition-all duration-300 ${
                ctx.pirGreetingEnabled ? "bg-slate-50/50 opacity-100" : "bg-slate-100/50 opacity-60 pointer-events-none select-none"
              }`}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-slate-500">Track DFPlayer</span>
                    <select 
                      className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer" 
                      value={localPirGreetingTrack} 
                      disabled={!ctx.pirGreetingEnabled}
                      onChange={(e) => setLocalPirGreetingTrack(Number(e.target.value))}
                    >
                      {audioTracks.filter((track) => track.id >= 10 && track.id <= 12).map((track) => (
                        <option key={track.id} value={track.id}>{track.name} - {track.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-slate-500">Mode Putar</span>
                    <select 
                      className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer" 
                      disabled={!ctx.pirGreetingEnabled}
                      onChange={(e) => setLocalPirGreetingPlayMode(e.target.value)} 
                      value={localPirGreetingPlayMode}
                    >
                      <option value="cooldown">Cooldown</option>
                      <option value="once_schedule">Sekali per jadwal</option>
                      <option value="once_motion">Sekali per gerakan</option>
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-slate-500">Jam Mulai Sapa</span>
                    <input 
                      className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                      type="time" 
                      disabled={!ctx.pirGreetingEnabled}
                      value={localPirGreetingStart} 
                      onChange={(e) => setLocalPirGreetingStart(e.target.value)} 
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-slate-500">Jam Selesai Sapa</span>
                    <input 
                      className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                      type="time" 
                      disabled={!ctx.pirGreetingEnabled}
                      value={localPirGreetingEnd} 
                      onChange={(e) => setLocalPirGreetingEnd(e.target.value)} 
                    />
                  </label>

                  <label className="grid gap-2 sm:col-span-2">
                    <span className="text-sm font-bold text-slate-500">Cooldown (detik)</span>
                    <input 
                      className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold" 
                      min={10} 
                      disabled={!ctx.pirGreetingEnabled}
                      onChange={(e) => setLocalPirGreetingCooldown(Math.max(10, Number(e.target.value)))} 
                      type="number" 
                      value={localPirGreetingCooldown} 
                    />
                  </label>
                </div>

                {/* Days Selection */}
                <div className="grid gap-2 border-t border-slate-200/80 pt-4 mt-2">
                  <span className="text-sm font-bold text-slate-500">Hari Aktif</span>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {daysOfWeek.map((day) => {
                      const active = localPirGreetingDays.includes(day.id);
                      return (
                        <button 
                          className={`h-11 rounded-xl text-xs sm:text-sm font-extrabold transition-all duration-200 active:scale-95 ${
                            active 
                              ? "bg-blue-600 text-white shadow-md shadow-blue-500/15 border border-blue-600" 
                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                          }`} 
                          key={day.id} 
                          disabled={!ctx.pirGreetingEnabled}
                          onClick={() => setLocalPirGreetingDays((current) => 
                            current.includes(day.id) 
                              ? current.filter((item) => item !== day.id) 
                              : [...current, day.id]
                          )} 
                          type="button"
                        >
                          {day.label.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Save PIR Button */}
                <div className="flex justify-end pt-4 border-t border-slate-200/80 mt-2">
                  <button 
                    className="h-12 w-full sm:w-auto rounded-xl bg-blue-600 px-6 text-sm font-extrabold text-white transition-all hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none hover:shadow-lg hover:shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2" 
                    disabled={savingPirGreeting || localPirGreetingDays.length === 0 || !ctx.pirGreetingEnabled} 
                    onClick={() => savePirGreeting()} 
                    type="button"
                  >
                    {savingPirGreeting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Menyimpan...
                      </>
                    ) : (
                      "Simpan Pengaturan PIR"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
