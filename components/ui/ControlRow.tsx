"use client";

import { Switch } from "./Switch";

export function ControlRow({ label, detail, enabled, onToggle, disabled }: { label: string; detail: string; enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:border-slate-300 ${disabled ? "opacity-50" : ""}`}>
      <div>
        <p className="text-base font-bold text-slate-900">{label}</p>
        <p className="mt-1 text-sm text-slate-500">{detail}</p>
      </div>
      <Switch checked={enabled} onChange={onToggle} disabled={disabled} />
    </div>
  );
}
