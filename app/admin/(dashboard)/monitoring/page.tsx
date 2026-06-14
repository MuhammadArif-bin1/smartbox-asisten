"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MonitoringRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="text-sm font-bold text-slate-500">Mengalihkan ke Monitoring...</span>
      </div>
    </div>
  );
}
