"use client";

import Link from "next/link";
import { useSmartbox } from "@/lib/smartbox-context";

export default function DashboardPage() {
  const ctx = useSmartbox();

  const greetingActiveCount = ctx.greetingVoiceSchedules.filter((s) => s.active).length;
  const greetingTotal = ctx.greetingVoiceSchedules.length;

  const alarmActiveCount = ctx.alarmSchedules.filter((s) => s.active).length;
  const alarmTotal = ctx.alarmSchedules.length;

  const relayActiveCount = ctx.relaySchedules.filter((s) => s.enabled).length;
  const relayTotal = ctx.relaySchedules.length;

  // Active Relays Status
  const activeRelaysCount = [
    ctx.relayState.socket1,
    ctx.relayState.socket2,
    ctx.relayState.ampli
  ].filter(Boolean).length;

  const cards = [
    {
      title: "Jadwal Greeting Voice",
      subtitle: "Daftar jadwal sapaan suara (Greeting Voice) berbasis PIR.",
      href: "/admin/dashboard/greeting-voice",
      activeCount: greetingActiveCount,
      totalCount: greetingTotal,
      labelSuffix: "jadwal",
      color: "blue",
      icon: (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
        </svg>
      ),
    },
    {
      title: "Jadwal Alarm DFPlayer",
      subtitle: "Jadwal alarm otomatis untuk suara/sapaan otomatis melalui DFPlayer.",
      href: "/admin/dashboard/alarm-dfplayer",
      activeCount: alarmActiveCount,
      totalCount: alarmTotal,
      labelSuffix: "jadwal",
      color: "amber",
      icon: (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
    },
    {
      title: "Jadwal Otomatis Stop Kontak",
      subtitle: "Jadwal otomatis menyalakan/mematikan Stop Kontak secara terjadwal.",
      href: "/admin/dashboard/relay-schedules",
      activeCount: relayActiveCount,
      totalCount: relayTotal,
      labelSuffix: "jadwal",
      color: "emerald",
      icon: (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
    },
    {
      title: "Device Control",
      subtitle: "Kelola stop kontak, relay Bluetooth, alarm buzzer, dan uji track suara secara real-time.",
      href: "/admin/dashboard/devices",
      activeCount: activeRelaysCount,
      totalCount: 3,
      labelSuffix: "relay aktif",
      color: "indigo",
      icon: (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      ),
    },
  ];

  const colorMap: Record<string, { bg: string; border: string; ring: string; text: string; badge: string; badgeBorder: string; iconBg: string }> = {
    blue: {
      bg: "bg-white hover:bg-blue-50/30",
      border: "border-slate-200 hover:border-blue-200",
      ring: "hover:ring-4 hover:ring-blue-500/5",
      text: "text-blue-600",
      badge: "bg-blue-50 text-blue-700",
      badgeBorder: "border-blue-100",
      iconBg: "bg-blue-50",
    },
    amber: {
      bg: "bg-white hover:bg-amber-50/30",
      border: "border-slate-200 hover:border-amber-200",
      ring: "hover:ring-4 hover:ring-amber-500/5",
      text: "text-amber-600",
      badge: "bg-amber-50 text-amber-700",
      badgeBorder: "border-amber-100",
      iconBg: "bg-amber-50",
    },
    emerald: {
      bg: "bg-white hover:bg-emerald-50/30",
      border: "border-slate-200 hover:border-emerald-200",
      ring: "hover:ring-4 hover:ring-emerald-500/5",
      text: "text-emerald-600",
      badge: "bg-emerald-50 text-emerald-700",
      badgeBorder: "border-emerald-100",
      iconBg: "bg-emerald-50",
    },
    indigo: {
      bg: "bg-white hover:bg-indigo-50/30",
      border: "border-slate-200 hover:border-indigo-200",
      ring: "hover:ring-4 hover:ring-indigo-500/5",
      text: "text-indigo-600",
      badge: "bg-indigo-50 text-indigo-700",
      badgeBorder: "border-indigo-100",
      iconBg: "bg-indigo-50",
    },
  };

  return (
    <div className="grid gap-6">
      {/* Header Info */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Dashboard Jadwal & Perangkat</h2>
        <p className="text-sm text-slate-500 mt-1">
          Kelola semua jadwal otomatis dan kontrol perangkat dari satu tempat. Klik card di bawah untuk membuka detail.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const c = colorMap[card.color];
          return (
            <Link
              key={card.href}
              href={card.href}
              prefetch={true}
              className={`group relative flex flex-col gap-4 rounded-3xl border p-6 shadow-sm transition-all duration-300 ${c.bg} ${c.border} ${c.ring}`}
            >
              {/* Icon */}
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${c.iconBg} ${c.text} transition-transform group-hover:scale-110`}>
                {card.icon}
              </div>

              {/* Title */}
              <div>
                <h3 className="text-base font-extrabold text-slate-900 group-hover:text-slate-950 transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {card.subtitle}
                </p>
              </div>

              {/* Stats Badge */}
              <div className="flex items-center gap-2 mt-auto pt-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${c.badge} ${c.badgeBorder}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${card.activeCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                  {card.activeCount} Aktif
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  dari {card.totalCount} {card.labelSuffix}
                </span>
              </div>

              {/* Arrow indicator */}
              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className={`h-5 w-5 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
