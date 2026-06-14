"use client";

import { useEffect } from "react";
import type { Toast } from "@/lib/smartbox-types";

export function ToastMessage({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const toneClass = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-red-200 bg-red-50 text-red-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
  };

  useEffect(() => {
    const timeout = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timeout);
  }, [onClose, toast.id]);

  return (
    <div className="fixed right-4 top-24 z-50 max-w-sm animate-[slideIn_0.3s_ease-out]">
      <div className={`rounded-2xl border px-5 py-4 text-sm font-bold shadow-lg ${toneClass[toast.tone]}`}>
        <div className="flex items-start gap-3">
          <p className="leading-6">{toast.message}</p>
          <button className="ml-auto text-current/70 hover:text-current transition-colors" onClick={onClose} type="button">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
