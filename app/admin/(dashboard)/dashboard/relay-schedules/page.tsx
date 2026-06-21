"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSmartbox } from "@/lib/smartbox-context";
import { daysOfWeek } from "@/lib/smartbox-constants";
import { Panel } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/Switch";

export default function RelaySchedulesPage() {
  const ctx = useSmartbox();

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
      try {
        setSchDays(JSON.parse(editingSchedule.days));
      } catch {
        setSchDays(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
      }
      setSchEnabled(editingSchedule.enabled);
    } else {
      setSchName("");
      setSchRelay(1);
      setSchStart("08:00");
      setSchEnd("18:00");
      setSchDays(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
      setSchEnabled(true);
    }
  }, [editingSchedule]);

  const formatTimeInput = (val: string): string => {
    const clean = val.replace(/\D/g, "").slice(0, 4);
    if (clean.length === 0) return "";
    
    let hh = clean.slice(0, 2);
    let mm = clean.slice(2);
    
    if (hh.length > 0) {
      let hNum = parseInt(hh, 10);
      if (hNum > 24) hNum = 24;
      hh = hNum.toString().padStart(hh.length, "0");
    }
    
    if (mm.length > 0) {
      let mNum = parseInt(mm, 10);
      if (parseInt(hh, 10) === 24) {
        mNum = 0;
      } else if (mNum > 59) {
        mNum = 59;
      }
      mm = mNum.toString().padStart(mm.length, "0");
    }
    
    if (clean.length <= 2) {
      return hh;
    }
    return `${hh}:${mm}`;
  };

  const isValidTime = (time: string) => {
    if (!/^\d{2}:\d{2}$/.test(time)) return false;
    const [h, m] = time.split(":").map(Number);
    if (h === 24 && m === 0) return true;
    return h >= 0 && h < 24 && m >= 0 && m < 60;
  };

  const handleSchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schName.trim()) {
      ctx.notify("Nama jadwal wajib diisi", "error");
      return;
    }
    if (!isValidTime(schStart) || !isValidTime(schEnd)) {
      ctx.notify("Format waktu mulai/selesai harus HH:MM (maks 24:00)", "error");
      return;
    }
    await ctx.saveRelaySchedule({
      id: editingSchedule?.id,
      name: schName.trim(),
      relayNumber: schRelay,
      startTime: schStart,
      endTime: schEnd,
      days: JSON.stringify(schDays),
      enabled: schEnabled,
    });
    setEditingSchedule(null);
  };

  return (
    <div className="grid gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/dashboard" className="text-blue-600 font-bold hover:underline">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500 font-semibold">Jadwal Otomatis Stop Kontak</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Left: List */}
        <Panel title="Jadwal Otomatis Stop Kontak" subtitle="Daftar jadwal aktif untuk menyalakan/mematikan Stop Kontak secara otomatis.">
          <div className="grid gap-3">
            {ctx.relaySchedules.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-slate-200/80 rounded-3xl bg-slate-50/50 flex flex-col items-center justify-center p-6">
                <div className="p-4 bg-slate-100 rounded-full text-slate-400 mb-4">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
                <h3 className="text-base font-extrabold text-slate-800">Belum Ada Jadwal</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-[280px] leading-relaxed">
                  Belum ada jadwal otomatis dikonfigurasi. Buat jadwal baru melalui panel di samping.
                </p>
              </div>
            ) : (
              ctx.relaySchedules.map((sch) => {
                let activeDays: string[] = [];
                try { activeDays = JSON.parse(sch.days); } catch { activeDays = []; }
                const isCurrentlyEditing = editingSchedule?.id === sch.id;
                return (
                  <div
                    key={sch.id}
                    className={`flex flex-col sm:flex-row justify-between sm:items-center gap-3 rounded-3xl border p-5 shadow-sm transition-all duration-300 ${
                      isCurrentlyEditing
                        ? "border-blue-500 bg-blue-50/20 ring-4 ring-blue-500/10"
                        : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-md"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{sch.name}</p>
                      <p className="text-xs text-slate-500 font-semibold mt-1">
                        {sch.relayNumber === 1 ? ctx.relay1Label : ctx.relay2Label} • {sch.startTime} - {sch.endTime}
                      </p>
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
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                        sch.enabled ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sch.enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                        {sch.enabled ? "Aktif" : "Nonaktif"}
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={() => { ctx.saveRelaySchedule({ ...sch, enabled: !sch.enabled }); }} className="h-9 w-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition" title={sch.enabled ? "Nonaktifkan" : "Aktifkan"} type="button">⚡</button>
                        <button onClick={() => setEditingSchedule(sch)} className={`h-9 w-9 rounded-lg border flex items-center justify-center transition ${isCurrentlyEditing ? "bg-blue-600 text-white border-blue-600" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`} title="Edit" type="button">✏️</button>
                        <button onClick={() => ctx.deleteRelaySchedule(sch.id)} className="h-9 w-9 rounded-lg bg-red-50 text-red-600 border-red-200 flex items-center justify-center hover:bg-red-100 transition" title="Hapus" type="button">🗑️</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        {/* Right: Form */}
        <Panel title={editingSchedule ? "Edit Jadwal Otomatis" : "Tambah Jadwal Otomatis"} subtitle="Atur jam operasional Stop Kontak.">
          <form onSubmit={handleSchSubmit} className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-500">Nama Jadwal</span>
              <input type="text" value={schName} onChange={(e) => setSchName(e.target.value)} placeholder="Misal: Charger Laptop Malam" className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 font-bold" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-500">Stop Kontak</span>
              <select value={schRelay} onChange={(e) => setSchRelay(Number(e.target.value))} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500">
                <option value={1}>{ctx.relay1Label}</option>
                <option value={2}>{ctx.relay2Label}</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-12 max-w-[60%] mx-auto w-full">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-500">Mulai</span>
                <input
                  type="text"
                  maxLength={5}
                  value={schStart}
                  onChange={(e) => setSchStart(formatTimeInput(e.target.value))}
                  placeholder="08:00"
                  className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-500 font-bold font-mono text-center shadow-inner"
                  style={{ fontSize: "1.35rem", letterSpacing: "0.22em" }}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-500">Selesai</span>
                <input
                  type="text"
                  maxLength={5}
                  value={schEnd}
                  onChange={(e) => setSchEnd(formatTimeInput(e.target.value))}
                  placeholder="18:00"
                  className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-500 font-bold font-mono text-center shadow-inner"
                  style={{ fontSize: "1.35rem", letterSpacing: "0.22em" }}
                />
              </label>
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
