"use client";

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      aria-pressed={checked}
      className={`relative h-9 w-[72px] rounded-full p-1 transition-all duration-300 ${checked ? "bg-blue-600 shadow-lg shadow-blue-200" : "bg-slate-300"} ${disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"}`}
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      type="button"
    >
      <span className={`block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-300 ${checked ? "translate-x-[34px]" : "translate-x-0"}`} />
      <span className={`absolute top-1/2 -translate-y-1/2 text-[11px] font-black text-white select-none ${checked ? "left-3" : "right-2.5"}`}>{checked ? "ON" : "OFF"}</span>
    </button>
  );
}
