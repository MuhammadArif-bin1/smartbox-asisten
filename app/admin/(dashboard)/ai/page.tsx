"use client";

import { useSmartbox } from "@/lib/smartbox-context";
import { Panel } from "@/components/ui/Panel";
import { ControlRow } from "@/components/ui/ControlRow";

export default function AiPage() {
  const ctx = useSmartbox();

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel title="AI Assistant" subtitle={ctx.mqttOnline ? "Online dan siap memberi ringkasan." : "Menunggu broker MQTT."}>
        <div className="grid gap-4">
          <div className="rounded-3xl bg-slate-100 p-6 text-base leading-8 text-slate-700">
            <p className="font-bold text-slate-950 text-lg">Halo! Saya SmartBox Assistant.</p>
            <p className="mt-3">Kondisi ruangan saat ini {ctx.tempState.toLowerCase()}, gas {ctx.gasState.toLowerCase()}, MQTT {ctx.mqttOnline ? "terhubung" : "offline"}, dan relay aktif {ctx.relayActiveCount} dari 3.</p>
          </div>
          {["Bagaimana kondisi ruangan saat ini?", "Apakah ada potensi bahaya?", "Tampilkan riwayat suhu hari ini"].map((question) => (
            <button key={question} className="rounded-2xl border border-blue-200 bg-white px-5 py-4 text-left text-base font-bold text-blue-600 transition hover:bg-blue-50 hover:border-blue-300" type="button">
              {question}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Voice Command" subtitle="Kontrol wake word lokal Edge Impulse.">
        <ControlRow
          label="Voice Command"
          detail="Wake word Halo_Aero lalu ucapkan perintah dalam 4 detik."
          enabled={ctx.voiceMode}
          onToggle={ctx.toggleVoiceMode}
        />
      </Panel>
    </div>
  );
}
