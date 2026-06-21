"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SmartboxProvider, useSmartbox } from "@/lib/smartbox-context";
import { views } from "@/lib/smartbox-constants";
import { ToastMessage } from "@/components/ui/Toast";

/* ─── View title resolver ─── */
const titleMap: Record<string, string> = {
  "/admin": "Monitoring",
  "/admin/dashboard": "Dashboard",
  "/admin/dashboard/greeting-voice": "Jadwal Greeting Voice",
  "/admin/dashboard/alarm-dfplayer": "Jadwal Alarm DFPlayer",
  "/admin/dashboard/relay-schedules": "Jadwal Stop Kontak",
  "/admin/dashboard/devices": "Pusat Kontrol Manual",
  "/admin/devices": "Pusat Kontrol Manual",
  "/admin/ai": "AI Assistant",
  "/admin/alarms": "Alarm Jadwal",
  "/admin/history": "Riwayat",
  "/admin/settings": "Pengaturan",
};

/* ─── Sidebar ─── */
function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white/95 px-4 py-6 shadow-sm lg:flex lg:flex-col">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-200">SB</div>
        <div>
          <p className="text-xl font-bold leading-6 text-slate-950">SmartBox</p>
          <p className="text-sm font-medium text-slate-500">Assistant</p>
        </div>
      </div>
      <nav className="mt-8 grid gap-2">
        {views.map((view) => {
          const isActive = pathname === view.href || (view.href !== "/admin" && pathname.startsWith(view.href));
          const isDashboardActive = view.href === "/admin" && pathname === "/admin";
          const active = isActive || isDashboardActive;
          return (
            <Link
              key={view.id}
              href={view.href}
              className={`flex h-12 items-center gap-3 rounded-xl px-4 text-left text-sm font-semibold transition-all duration-200 ${
                active ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full transition-colors ${active ? "bg-white" : "bg-slate-300"}`} />
              {view.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-3">
        <SidebarStatusCards />
      </div>
    </aside>
  );
}

function SidebarStatusCards() {
  const ctx = useSmartbox();
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${ctx.mqttOnline ? "bg-emerald-500 animate-pulse" : "bg-red-400"}`} />
          <div>
            <p className="text-sm font-bold text-slate-800">{ctx.mqttOnline ? "Sistem Online" : "Sistem Offline"}</p>
            <p className="text-xs text-slate-500">{ctx.mqttOnline ? "Broker MQTT aktif" : "Broker tidak terhubung"}</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
          <div>
            <p className="text-sm font-bold text-blue-900">Neon Database</p>
            <p className="text-xs text-blue-600">Prisma ORM Sinkron</p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Header Clock ─── */
function HeaderClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!currentTime) return null;

  const timeFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const timeString = timeFormatter.format(currentTime).replace(/:/g, ".");
  const dateString = dateFormatter.format(currentTime);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl border-2 border-slate-200 bg-white px-6 py-3 shadow-md font-mono transition-all hover:border-slate-300">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500"></span>
        </span>
        <span className="text-3xl font-black text-slate-900 tracking-widest drop-shadow-[0_0_1px_rgba(0,0,0,0.05)]">
          {timeString}
        </span>
      </div>
      <div className="hidden sm:block h-6 w-px bg-slate-200" />
      <span className="text-sm font-sans font-bold text-slate-500 tracking-wide">
        {dateString} <span className="text-blue-500/60 font-semibold">•</span> Asia/Jakarta (WIB)
      </span>
    </div>
  );
}

/* ─── Header ─── */
function Header() {
  const pathname = usePathname();
  const title = titleMap[pathname] || "Monitoring";

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600 lg:hidden">SmartBox Assistant</p>
          <h1 className="text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">
            {title === "Monitoring" ? "SmartBox Assistant Monitoring" : title}
          </h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <HeaderClock />

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-sm">A</div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-slate-900">Admin</p>
              <p className="text-xs text-slate-500">Administrator</p>
            </div>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem("smartbox_auth");
              localStorage.removeItem("smartbox_auth");
              window.location.href = "/login";
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 px-5 font-bold text-sm shadow-sm transition-all duration-200 active:scale-[0.98]"
            type="button"
          >
            <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Keluar
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─── Mobile Nav ─── */
function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-200 transition hover:bg-blue-700 active:scale-95"
        type="button"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          )}
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <nav
            className="absolute bottom-24 right-6 w-56 rounded-2xl bg-white p-3 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {views.map((view) => {
              const active = pathname === view.href;
              return (
                <Link
                  key={view.id}
                  href={view.href}
                  onClick={() => setOpen(false)}
                  className={`flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold transition ${
                    active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${active ? "bg-white" : "bg-slate-300"}`} />
                  {view.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}

/* ─── Toast Layer ─── */
function ToastLayer() {
  const ctx = useSmartbox();
  if (!ctx.toast) return null;
  return <ToastMessage toast={ctx.toast} onClose={() => ctx.setToast(null)} />;
}

/* ─── Auth Gate ─── */
function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("smartbox_auth");
    if (stored !== "1") {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm font-bold text-slate-500">Memuat...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/* ─── Layout ─── */
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <SmartboxProvider>
        <main className="min-h-screen bg-slate-50 text-slate-950">
          <div className="flex min-h-screen">
            <Sidebar />
            <section className="min-w-0 flex-1">
              <Header />
              <ToastLayer />
              <div className="px-4 py-6 sm:px-6">
                {children}
              </div>
            </section>
          </div>
          <MobileNav />
        </main>
      </SmartboxProvider>
    </AuthGate>
  );
}
