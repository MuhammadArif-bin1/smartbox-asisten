"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSmartbox } from "@/lib/smartbox-context";
import { daysOfWeek } from "@/lib/smartbox-constants";
import { Panel } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/Switch";

export default function GreetingVoicePage() {
  const ctx = useSmartbox();

  // Greeting Voice state hooks
  const [editingGreeting, setEditingGreeting] = useState<any | null>(null);
  const [greetingName, setGreetingName] = useState("");
  const [greetingStart, setGreetingStart] = useState("07:00");
  const [greetingEnd, setGreetingEnd] = useState("22:00");
  const [greetingCooldownMode, setGreetingCooldownMode] = useState<"default" | "custom">("default");
  const [greetingCooldown, setGreetingCooldown] = useState(20);
  const [greetingMode, setGreetingMode] = useState<"random" | "custom">("random");
  const [greetingTracks, setGreetingTracks] = useState<number[]>([]);
  const [greetingDays, setGreetingDays] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  const [greetingActive, setGreetingActive] = useState(true);

  useEffect(() => {
    if (editingGreeting) {
      setGreetingName(editingGreeting.name);
      setGreetingStart(editingGreeting.startTime);
      setGreetingEnd(editingGreeting.endTime);
      setGreetingCooldownMode(editingGreeting.cooldown === 0 ? "default" : "custom");
      setGreetingCooldown(editingGreeting.cooldown || 20);
      setGreetingMode(editingGreeting.mode);
      setGreetingActive(editingGreeting.active);
      let parsedTracks: number[] = [];
      try {
        parsedTracks = JSON.parse(editingGreeting.tracks);
      } catch {
        parsedTracks = [];
      }
      setGreetingTracks(parsedTracks);
      let parsedDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      try {
        if (editingGreeting.days) {
          parsedDays = JSON.parse(editingGreeting.days);
        }
      } catch {
        parsedDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      }
      setGreetingDays(parsedDays);
    } else {
      setGreetingName("");
      setGreetingStart("07:00");
      setGreetingEnd("22:00");
      setGreetingCooldownMode("default");
      setGreetingCooldown(20);
      setGreetingMode("random");
      setGreetingTracks([]);
      setGreetingDays(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
      setGreetingActive(true);
    }
  }, [editingGreeting]);

  const handleGreetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!greetingName.trim()) {
      ctx.notify("Nama jadwal greeting wajib diisi", "error");
      return;
    }
    const finalCooldown = greetingCooldownMode === "default" ? 0 : greetingCooldown;

    const startMinutes = greetingStart;
    const duplicate = ctx.greetingVoiceSchedules.some(
      (s) => s.startTime === startMinutes && s.id !== editingGreeting?.id
    );
    if (duplicate) {
      ctx.notify(`Jam mulai ${startMinutes} sudah digunakan di jadwal lain!`, "error");
      return;
    }

    await ctx.saveGreetingVoiceSchedule({
      id: editingGreeting?.id,
      name: greetingName.trim(),
      active: greetingActive,
      startTime: greetingStart,
      endTime: greetingEnd,
      cooldown: finalCooldown,
      mode: greetingMode,
      tracks: JSON.stringify(greetingTracks),
      days: JSON.stringify(greetingDays),
    });
    setEditingGreeting(null);
  };

  const getDaysDisplay = (daysJson?: string | null) => {
    if (!daysJson) return "Setiap Hari";
    let parsed: string[] = [];
    try {
      parsed = JSON.parse(daysJson);
    } catch {
      return "Setiap Hari";
    }
    if (parsed.length === 7) return "Setiap Hari";
    if (parsed.length === 0) return "Tidak Ada Hari";
    
    const dayMap: Record<string, string> = {
      monday: "Sen", tuesday: "Sel", wednesday: "Rab", thursday: "Kam",
      friday: "Jum", saturday: "Sab", sunday: "Min"
    };
    return parsed.map(d => dayMap[d] || d).join(", ");
  };

  return (
    <div className="grid gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/dashboard" className="text-blue-600 font-bold hover:underline">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500 font-semibold">Jadwal Greeting Voice</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Left: List */}
        <Panel 
          title="Jadwal Greeting Voice" 
          subtitle="Daftar jadwal sapaan suara (Greeting Voice) berbasis PIR."
        >
          <div className="grid gap-4">
            {ctx.greetingVoiceSchedules.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-slate-200/80 rounded-3xl bg-slate-50/50 flex flex-col items-center justify-center p-6">
                <div className="p-4 bg-slate-100 rounded-full text-slate-400 mb-4">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                  </svg>
                </div>
                <h3 className="text-base font-extrabold text-slate-800">Belum Ada Jadwal Greeting</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-[280px] leading-relaxed">
                  Jadwalkan sapaan suara otomatis saat ada pergerakan melalui panel di samping.
                </p>
              </div>
            ) : (
              ctx.greetingVoiceSchedules.map((sch) => {
                const isCurrentlyEditing = editingGreeting?.id === sch.id;
                let schTracks: number[] = [];
                try { schTracks = JSON.parse(sch.tracks); } catch { schTracks = []; }

                return (
                  <div 
                    key={sch.id} 
                    className={`flex flex-col sm:flex-row justify-between sm:items-center gap-4 rounded-3xl border p-5 shadow-sm transition-all duration-300 ${
                      isCurrentlyEditing 
                        ? "border-blue-500 bg-blue-50/20 ring-4 ring-blue-500/10" 
                        : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                      <div className="flex flex-col h-16 w-20 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 font-mono text-xs font-black border border-blue-100 shadow-inner p-1 text-center leading-tight">
                        <div className="font-extrabold text-slate-500 text-[10px]">AKTIF</div>
                        <div className="text-sm font-black">{sch.startTime}</div>
                        <div className="text-[10px] text-slate-400">s/d {sch.endTime}</div>
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-extrabold text-slate-900 truncate tracking-tight">{sch.name}</p>
                        <div className="text-xs font-semibold text-slate-500 mt-1 flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                              Mode: {sch.mode === "random" ? "Acak (Random)" : "Kustom (Urutan)"}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                              Cooldown: {sch.cooldown === 0 ? "Default PIR (10s)" : `${sch.cooldown}s`}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            Tracks: {schTracks.length > 0 ? schTracks.map(t => String(t).padStart(4, "0")).join(", ") : "Semua (0025-0040)"}
                          </div>
                        </div>

                        <div className="text-xs font-semibold mt-2">
                          <span className="inline-flex items-center gap-1.5 text-blue-600 font-bold bg-blue-50/50 px-2 py-1 rounded-lg text-[10px] border border-blue-100/50">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                            </svg>
                            {getDaysDisplay(sch.days)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-2 border-t sm:border-0 pt-4 sm:pt-0">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border transition-colors ${
                        sch.active 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-slate-50 text-slate-400 border-slate-200"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sch.active ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                        {sch.active ? "Aktif" : "Nonaktif"}
                      </span>
                      
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => ctx.toggleGreetingVoiceScheduleActive(sch.id, sch.active)} 
                          className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all border shadow-sm active:scale-95 ${
                            sch.active 
                              ? "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200" 
                              : "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                          }`}
                          title={sch.active ? "Nonaktifkan" : "Aktifkan"} 
                          type="button"
                        >
                          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 3v9" />
                          </svg>
                        </button>
                        
                        <button 
                          onClick={() => setEditingGreeting(sch)} 
                          className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-all active:scale-95 ${
                            isCurrentlyEditing 
                              ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/15" 
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                          title="Edit" 
                          type="button"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        
                        <button 
                          onClick={() => ctx.deleteGreetingVoiceSchedule(sch.id)} 
                          className="h-9 w-9 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center hover:bg-red-100 hover:text-red-700 transition-all active:scale-95"
                          title="Hapus" 
                          type="button"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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

        {/* Right: Form */}
        <Panel 
          title={editingGreeting ? "Edit Greeting Voice" : "Tambah Greeting Voice"} 
          subtitle={editingGreeting ? "Perbarui detail jadwal greeting voice." : "Buat jadwal greeting voice baru berbasis PIR."}
        >
          <form onSubmit={handleGreetingSubmit} className="grid gap-5">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-500">Nama Jadwal Greeting</span>
              <input 
                type="text" 
                value={greetingName} 
                onChange={(e) => setGreetingName(e.target.value)} 
                placeholder="Misal: Sapaan Tamu Siang" 
                className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-500">Jam Mulai Sapa</span>
                <input 
                  type="time" 
                  value={greetingStart} 
                  onChange={(e) => setGreetingStart(e.target.value)} 
                  className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-500">Jam Selesai Sapa</span>
                <input 
                  type="time" 
                  value={greetingEnd} 
                  onChange={(e) => setGreetingEnd(e.target.value)} 
                  className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-500">Mode Cooldown</span>
                <select 
                  value={greetingCooldownMode} 
                  onChange={(e) => setGreetingCooldownMode(e.target.value as "default" | "custom")}
                  className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                >
                  <option value="default">Default PIR (10s)</option>
                  <option value="custom">Kustom (Detik)</option>
                </select>
              </label>

              {greetingCooldownMode === "custom" ? (
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-slate-500">Cooldown (min. 20s)</span>
                  <input 
                    type="number" 
                    min={20}
                    value={greetingCooldown} 
                    onChange={(e) => setGreetingCooldown(Math.max(20, Number(e.target.value)))} 
                    className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                  />
                </label>
              ) : (
                <div className="flex items-center text-xs font-semibold text-slate-400 px-1 pt-6 italic">
                  Menggunakan cooldown 10 detik.
                </div>
              )}
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-500">Mode Pemutaran Suara</span>
              <select 
                value={greetingMode} 
                onChange={(e) => setGreetingMode(e.target.value as "random" | "custom")}
                className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
              >
                <option value="random">Acak Suara (Random 25-40)</option>
                <option value="custom">Urutkan / Pilih Kustom (Ordered)</option>
              </select>
            </label>

            <div className="grid gap-2 border-t border-slate-100 pt-4">
              <span className="text-sm font-bold text-slate-500">
                {greetingMode === "custom" ? "Pilih & Urutkan Track (Ketuk Berurutan)" : "Batasi Track (Opsional)"}
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {Array.from({ length: 16 }, (_, i) => 25 + i).map((trackNum) => {
                  const isSelected = greetingTracks.includes(trackNum);
                  const position = greetingTracks.indexOf(trackNum);
                  return (
                    <button
                      key={trackNum}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setGreetingTracks(current => current.filter(t => t !== trackNum));
                        } else {
                          setGreetingTracks(current => [...current, trackNum]);
                        }
                      }}
                      className={`relative h-10 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 ${
                        isSelected 
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/15 border border-blue-600" 
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {String(trackNum).padStart(2, "0")}
                      {isSelected && position !== -1 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-white ring-2 ring-white">
                          {position + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {greetingTracks.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 items-center p-3 bg-blue-50/30 rounded-2xl border border-blue-100/30 mt-1">
                  <span className="text-[10px] font-bold text-blue-500 mr-1 uppercase">Urutan Play:</span>
                  {greetingTracks.map((tr, idx) => (
                    <span key={tr} className="inline-flex items-center gap-1 bg-blue-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-lg">
                      {String(tr).padStart(4, "0")}
                      <button
                        type="button"
                        onClick={() => setGreetingTracks(current => current.filter(t => t !== tr))}
                        className="hover:text-red-300 ml-1 text-xs font-bold"
                      >
                        ×
                      </button>
                      {idx !== greetingTracks.length - 1 && <span className="text-blue-200 ml-1">→</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-slate-400 italic">
                  Default: Menggunakan semua track 25 s/d 40.
                </p>
              )}
            </div>

            <div className="grid gap-2 border-t border-slate-100 pt-4">
              <span className="text-sm font-bold text-slate-500">Hari Aktif</span>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {daysOfWeek.map((day) => {
                  const active = greetingDays.includes(day.id);
                  return (
                    <button 
                      key={day.id}
                      type="button"
                      onClick={() => setGreetingDays((current) => 
                        current.includes(day.id) 
                          ? current.filter((item) => item !== day.id) 
                          : [...current, day.id]
                      )}
                      className={`h-10 rounded-xl text-xs font-extrabold transition-all duration-200 active:scale-95 ${
                        active 
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/15 border border-blue-600" 
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                      }`} 
                    >
                      {day.label.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between items-center bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-colors hover:bg-slate-100/30 border-t">
              <div>
                <p className="text-sm font-extrabold text-slate-800">Status Awal</p>
                <p className="text-xs text-slate-400 mt-0.5">Jadwal langsung berjalan jika aktif.</p>
              </div>
              <Switch checked={greetingActive} onChange={() => setGreetingActive(!greetingActive)} />
            </div>

            <div className="flex gap-3 justify-end mt-2">
              {editingGreeting && (
                <button 
                  type="button" 
                  onClick={() => setEditingGreeting(null)} 
                  className="h-11 px-5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 active:scale-95 transition-all"
                >
                  Batal
                </button>
              )}
              <button 
                type="submit" 
                className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-extrabold hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                {editingGreeting ? "Simpan Perubahan" : "Simpan Jadwal"}
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
