"use client";

import { useSmartbox } from "@/lib/smartbox-context";
import { BOARD_LED_DURATION_SECONDS, DEFAULT_MQTT_WS_URL, MQTT_BROKER_LABEL, TEMP_WARNING_C, boardPins, selectedBoardProfile } from "@/lib/smartbox-constants";
import { Panel } from "@/components/ui/Panel";
import { SettingRow } from "@/components/ui/SettingRow";
import { AudioMap } from "@/components/ui/AudioMap";

export default function SettingsPage() {
  const ctx = useSmartbox();

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Pengaturan MQTT" subtitle="Status broker dan topic utama.">
        <div className="grid gap-3">
          <SettingRow label="Broker TCP" value={MQTT_BROKER_LABEL} />
          <SettingRow label="Broker WebSocket" value={process.env.NEXT_PUBLIC_MQTT_WS_URL || DEFAULT_MQTT_WS_URL} />
          <SettingRow label="Device ID" value={process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001"} />
          <SettingRow label="Status" value={ctx.mqttOnline ? "Terhubung" : "Offline"} />
        </div>
      </Panel>

      <Panel title="Ambang Sensor" subtitle="Nilai acuan peringatan di dashboard.">
        <div className="grid gap-3">
          <SettingRow label="Gas MQ-2" value="1800 raw" />
          <SettingRow label="Suhu Peringatan" value={`${TEMP_WARNING_C} °C`} />
          <SettingRow label="Timer LED Alarm" value={`${ctx.boardLedScheduleEnabled ? "Aktif" : "Mati"} - ${BOARD_LED_DURATION_SECONDS} detik`} />
          <SettingRow label="Buzzer" value={ctx.buzzerEnabled ? "Aktif" : "Mati"} />
          <SettingRow label="Alarm Aktif" value={`${ctx.activeAlarms} jadwal`} />
        </div>
      </Panel>

      <Panel title="Konfigurasi Board" subtitle={`Board: ${selectedBoardProfile}`}>
        <div className="grid gap-3">
          {boardPins.groups.map(([label, pins]) => (
            <SettingRow key={label} label={label} value={pins} />
          ))}
        </div>
      </Panel>

      <Panel title="Audio Track Map" subtitle="Daftar track DFPlayer (SD Card).">
        <AudioMap />
      </Panel>
    </div>
  );
}
