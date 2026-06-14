"use client";

import { createContext, type FormEvent, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Alarm, AlarmSchedule, CommandStatus, DeviceStatuses, EventLogEntry, RelayId, RelaySchedule, SmartboxContextValue, Toast } from "./smartbox-types";
import { DASHBOARD_PASSWORD, DEFAULT_MQTT_WS_URL, defaultGasSeries, GAS_WARNING_RAW, initialAlarms, relayControls, temperatureSeries, TEMP_WARNING_C } from "./smartbox-constants";
import { isRecord, parseTelemetry, readBoolean, readNumber, roundTemperature, sendDeviceCommandApi } from "./smartbox-utils";

/* ─── Context ─── */
const SmartboxContext = createContext<SmartboxContextValue | null>(null);

export function useSmartbox(): SmartboxContextValue {
  const ctx = useContext(SmartboxContext);
  if (!ctx) throw new Error("useSmartbox must be used within <SmartboxProvider>");
  return ctx;
}

/* ─── Provider ─── */
export function SmartboxProvider({ children }: { children: ReactNode }) {
  /* ── Auth ── */
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  /* ── Sensor state ── */
  const [gasEnabled, setGasEnabled] = useState(true);
  const [temperatureEnabled, setTemperatureEnabled] = useState(true);
  const [gasEstimate, setGasEstimate] = useState(0);
  const [tempEstimate, setTempEstimate] = useState(0);
  const [gasLevel, setGasLevel] = useState<string>("normal");
  const [flameDetected, setFlameDetected] = useState(false);
  const [pirDetected, setPirDetected] = useState<boolean | null>(null);
  const [obstacleNear, setObstacleNear] = useState(false);
  const [pirEnabled, setPirEnabled] = useState(true);
  const [sleepModeEnabled, setSleepModeEnabled] = useState(false);

  /* ── PIR greeting ── */
  const [pirGreetingEnabled, setPirGreetingEnabled] = useState(false);
  const [pirGreetingTrack, setPirGreetingTrack] = useState(10);
  const [pirGreetingStart, setPirGreetingStart] = useState("07:00");
  const [pirGreetingEnd, setPirGreetingEnd] = useState("22:00");
  const [pirGreetingCooldown, setPirGreetingCooldown] = useState(10);
  const [pirGreetingDays, setPirGreetingDays] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  const [pirGreetingPlayMode, setPirGreetingPlayMode] = useState("cooldown");

  /* ── Device ── */
  const [dfTrackCount, setDfTrackCount] = useState(13);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatuses>({
    esp32: false, rtc: false, lcd: false, dfPlayer: false, ip: "-", rssi: 0, lastSeen: "-",
  });
  const [telemetrySource, setTelemetrySource] = useState("Offline");
  const [lastTelemetryTime, setLastTelemetryTime] = useState<number>(0);
  const [tempHistory, setTempHistory] = useState(temperatureSeries);
  const [gasHistory, setGasHistory] = useState<number[]>(defaultGasSeries);

  /* ── MQTT / command ── */
  const [mqttRealtime, setMqttRealtime] = useState<"connecting" | "online" | "offline">("connecting");
  const [mqttApiOnline, setMqttApiOnline] = useState(false);
  const [status, setStatus] = useState<CommandStatus>("idle");
  const [lastCommand, setLastCommand] = useState("Belum ada command dikirim");
  const [voiceMode, setVoiceMode] = useState(true);
  const [buzzerEnabled, setBuzzerEnabled] = useState(false);
  const [boardLedScheduleEnabled, setBoardLedScheduleEnabled] = useState(true);

  /* ── Relay ── */
  const [relayState, setRelayState] = useState<Record<RelayId, boolean>>({ socket1: false, socket2: false, ampli: false });
  const [relayAutoOffAt, setRelayAutoOffAt] = useState<{ socket1: number | null; socket2: number | null }>({ socket1: null, socket2: null });
  const relayPendingRef = useRef<Record<RelayId, number>>({ socket1: 0, socket2: 0, ampli: 0 });
  const [relaySchedules, setRelaySchedules] = useState<RelaySchedule[]>([]);

  /* ── Alarms ── */
  const [alarms, setAlarms] = useState(initialAlarms);
  const [alarmSchedules, setAlarmSchedules] = useState<AlarmSchedule[]>([]);

  /* ── Events ── */
  const [events, setEvents] = useState<EventLogEntry[]>([]);

  /* ── Toast ── */
  const [toast, setToast] = useState<Toast | null>(null);

  /* ─── Computed values ─── */
  const hasTempSensor = deviceStatus.esp32 && deviceStatus.rtc;
  const hasGasSensor = deviceStatus.esp32;

  const visibleGasEstimate = (hasGasSensor && gasEnabled) ? gasEstimate : 0;
  const visibleTempEstimate = (hasTempSensor && temperatureEnabled) ? tempEstimate : 0;
  const gasPpm = Math.round(visibleGasEstimate / 60);
  const gasPercent = Math.round((visibleGasEstimate / 4095) * 100);
  const tempPercent = Math.round((visibleTempEstimate / 50) * 100);
  const gasWarning = hasGasSensor && gasEnabled && (gasLevel === "bahaya" || gasLevel === "waspada" || visibleGasEstimate >= GAS_WARNING_RAW);
  const tempWarning = hasTempSensor && temperatureEnabled && visibleTempEstimate > TEMP_WARNING_C;
  const gasState = !hasGasSensor ? "Tidak Terhubung" : (gasEnabled ? (gasLevel === "bahaya" ? "Bahaya" : (gasLevel === "waspada" ? "Waspada" : "Aman")) : "Nonaktif");
  const tempState = !hasTempSensor ? "Tidak Terhubung" : (temperatureEnabled ? (tempWarning ? "Peringatan" : "Aman") : "Nonaktif");
  const mqttOnline = mqttRealtime === "online" || mqttApiOnline;
  const relayActiveCount = relayControls.filter((relay) => relayState[relay.id]).length;
  const activeAlarms = useMemo(() => alarmSchedules.filter((s) => s.active).length, [alarmSchedules]);

  /* ─── Helpers ─── */
  function notify(message: string, tone: Toast["tone"] = "info") {
    setToast({ id: Date.now(), message, tone });
  }

  async function sendDeviceCommand(type: string, payload: Record<string, unknown>, label: string, successMsg?: string, errorMsg?: string) {
    setStatus("sending");
    setLastCommand(label);
    try {
      const devId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
      await sendDeviceCommandApi(devId, type, payload);
      setStatus("sent");
      notify(successMsg || `${label} berhasil dikirim`, "success");
      return true;
    } catch {
      setStatus("error");
      notify(errorMsg || `${label} gagal dikirim. Periksa koneksi API/MQTT.`, "error");
      return false;
    }
  }

  async function publish(topic: string, payload: Record<string, unknown>, label: string) {
    let type = "unknown";
    if (topic.includes("alarm")) {
      type = "alarm.set";
    } else if (topic.includes("relay/set")) {
      const isAmpli = payload.relay === "bluetooth_ampli";
      if (isAmpli) {
        return sendDeviceCommand("bluetooth.set", { state: payload.enabled }, label);
      } else {
        const relayNum = payload.relay === "socket_2" ? 2 : 1;
        return sendDeviceCommand("relay.set", { relay: relayNum, state: payload.enabled }, label);
      }
    } else if (topic.includes("buzzer")) {
      type = "buzzer.set";
      return sendDeviceCommand(type, { state: payload.enabled }, label);
    } else if (topic.includes("voice")) {
      type = "voice.mode";
      return sendDeviceCommand(type, { enabled: payload.enabled }, label);
    } else if (topic.includes("sensor/gas")) {
      type = "gasSensor.set";
      return sendDeviceCommand(type, { enabled: payload.enabled }, label);
    } else if (topic.includes("sensor/temperature")) {
      type = "tempSensor.set";
      return sendDeviceCommand(type, { enabled: payload.enabled }, label);
    }
    return sendDeviceCommand(type, payload, label);
  }

  function updateAlarm(id: string, field: keyof Alarm, value: string | number | boolean) {
    setAlarms((current) => current.map((alarm) => alarm.id === id ? { ...alarm, [field]: value } : alarm));
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordInput === DASHBOARD_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError("");
      setPasswordInput("");
      sessionStorage.setItem("smartbox_auth", "1");
      return;
    }
    setLoginError("Password salah");
  }

  /* ─── Alarm schedule CRUD ─── */
  async function saveAlarmSchedule(sch: { id?: string; name: string; time: string; track: number; active: boolean }) {
    try {
      const isEdit = !!sch.id;
      const url = isEdit ? `/api/alarm-schedules/${sch.id}` : "/api/alarm-schedules";
      const method = isEdit ? "PATCH" : "POST";
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(sch) });
      if (response.ok) {
        const saved = await response.json();
        setAlarmSchedules((current) => {
          if (isEdit) return current.map((item) => (item.id === sch.id ? saved : item));
          return [...current, saved].sort((a, b) => a.time.localeCompare(b.time));
        });
        notify(isEdit ? "Jadwal alarm berhasil diperbarui" : "Jadwal alarm berhasil disimpan", "success");
      } else {
        const result = await response.json().catch(() => null);
        notify(result?.error || "Gagal menyimpan jadwal alarm", "error");
      }
    } catch (err) {
      console.error("Error saving alarm schedule:", err);
      notify("Gagal menyimpan jadwal alarm", "error");
    }
  }

  async function deleteAlarmSchedule(id: string) {
    try {
      const response = await fetch(`/api/alarm-schedules/${id}`, { method: "DELETE" });
      if (response.ok) {
        setAlarmSchedules((current) => current.filter((s) => s.id !== id));
        notify("Jadwal alarm berhasil dihapus", "success");
      } else {
        notify("Gagal menghapus jadwal alarm", "error");
      }
    } catch (err) {
      console.error("Error deleting alarm schedule:", err);
      notify("Gagal menghapus jadwal alarm", "error");
    }
  }

  async function toggleAlarmScheduleActive(id: string, currentActive: boolean) {
    const nextActive = !currentActive;
    setAlarmSchedules((current) => current.map((s) => s.id === id ? { ...s, active: nextActive } : s));
    try {
      const response = await fetch(`/api/alarm-schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      if (!response.ok) throw new Error("Gagal update status");
      notify(`Alarm ${nextActive ? "diaktifkan" : "dinonaktifkan"}`, "info");
    } catch (err) {
      console.error("Error toggling alarm active:", err);
      setAlarmSchedules((current) => current.map((s) => s.id === id ? { ...s, active: currentActive } : s));
      notify("Gagal memperbarui status alarm", "error");
    }
  }

  async function testPlayVoice(track: number) {
    try {
      const response = await fetch("/api/voice/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track, reason: "manual_test" }),
      });
      if (response.ok) {
        notify("Perintah suara (test play) dikirim ke ESP32", "success");
      } else {
        notify("Gagal mengirim perintah suara", "error");
      }
    } catch (err) {
      console.error("Error playing voice test:", err);
      notify("Gagal mengirim perintah suara", "error");
    }
  }

  /* ─── Sensor toggles ─── */
  function toggleGas() {
    const next = !gasEnabled;
    setGasEnabled(next);
    if (next && gasEstimate === 0) setGasEstimate(720);
    sendDeviceCommand("gasSensor.set", { enabled: next }, `Sensor gas ${next ? "aktif" : "mati"}`);
  }

  function toggleTemperature() {
    const next = !temperatureEnabled;
    setTemperatureEnabled(next);
    if (next && tempEstimate === 0) setTempEstimate(35);
    sendDeviceCommand("tempSensor.set", { enabled: next }, `Sensor suhu ${next ? "aktif" : "mati"}`);
  }

  function togglePir() {
    const next = !pirEnabled;
    setPirEnabled(next);
    sendDeviceCommand("pirSensor.set", { enabled: next }, `Sensor PIR ${next ? "aktif" : "mati"}`);
  }

  function toggleSleepMode() {
    const next = !sleepModeEnabled;
    setSleepModeEnabled(next);
    sendDeviceCommand("sleepMode.set", { enabled: next }, `Sleep Mode ${next ? "aktif" : "mati"}`);
  }

  async function toggleRelay(relayId: RelayId) {
    const next = !relayState[relayId];
    const previousAutoOffAt = relayId === "ampli" ? null : relayAutoOffAt[relayId];
    setRelayState((current) => ({ ...current, [relayId]: next }));
    relayPendingRef.current[relayId] = Date.now();
    if (relayId !== "ampli") {
      setRelayAutoOffAt((current) => ({ ...current, [relayId]: next ? Date.now() + 60_000 : null }));
    }

    let ok: boolean;
    if (relayId === "ampli") {
      ok = await sendDeviceCommand("bluetooth.set", { state: next }, `Relay Bluetooth ${next ? "aktif" : "mati"}`);
    } else {
      const relayNum = relayId === "socket2" ? 2 : 1;
      const label = relayNum === 1 ? "Stop Kontak 1 (Kipas)" : "Stop Kontak 2 (Charger)";
      if (next) {
        ok = await sendDeviceCommand("relay.set", { relay: relayNum, state: true, autoOffSeconds: 60, label }, `Stop Kontak ${relayNum} aktif`);
      } else {
        ok = await sendDeviceCommand("relay.set", { relay: relayNum, state: false, label }, `Stop Kontak ${relayNum} mati`);
      }
    }

    if (!ok) {
      relayPendingRef.current[relayId] = 0;
      setRelayState((current) => ({ ...current, [relayId]: !next }));
      if (relayId !== "ampli") {
        setRelayAutoOffAt((current) => ({ ...current, [relayId]: previousAutoOffAt }));
      }
    }
  }

  /* ─── PIR greeting config ─── */
  async function updatePirGreetingConfig(
    enabled: boolean, track: number, start: string, end: string, cooldown: number, playMode: string, days: string[]
  ) {
    if (track < 10 || track > 12 || cooldown < 10 || days.length === 0) {
      notify("Track greeting harus 0010-0012, cooldown minimal 10 detik, dan hari aktif wajib dipilih.", "error");
      return;
    }
    setPirGreetingEnabled(enabled);
    setPirGreetingTrack(track);
    setPirGreetingStart(start);
    setPirGreetingEnd(end);
    setPirGreetingCooldown(cooldown);
    setPirGreetingPlayMode(playMode);
    setPirGreetingDays(days);

    try {
      const response = await fetch("/api/pir-greeting-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, track, startTime: start, endTime: end, cooldownSeconds: cooldown, playMode, days: JSON.stringify(days) }),
      });
      if (!response.ok) throw new Error("Setting PIR ditolak API");
    } catch (err) {
      console.error("Gagal menyimpan setting PIR ke database:", err);
      notify("Gagal menyimpan pengaturan PIR greeting.", "error");
      return;
    }

    await sendDeviceCommand("pirGreeting.set", { enabled, track, startTime: start, endTime: end, cooldownSeconds: cooldown, playMode, days }, "Update PIR Greeting");
  }

  /* ─── Relay schedule CRUD ─── */
  async function saveRelaySchedule(sch: { id?: string; name: string; relayNumber: number; startTime: string; endTime: string; days: string; enabled: boolean }) {
    try {
      const isEdit = !!sch.id;
      const url = isEdit ? `/api/devices/relay-schedules/${sch.id}` : "/api/devices/relay-schedules";
      const method = isEdit ? "PUT" : "POST";
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(sch) });
      if (response.ok) {
        const saved = await response.json();
        setRelaySchedules((current) => {
          if (isEdit) return current.map((item) => (item.id === sch.id ? saved : item));
          return [...current, saved];
        });
        notify(isEdit ? "Jadwal berhasil diperbarui" : "Jadwal berhasil ditambahkan", "success");
      } else {
        const result = await response.json().catch(() => null);
        notify(result?.error || "Gagal menyimpan jadwal", "error");
      }
    } catch (err) {
      console.error("Error saving schedule:", err);
      notify("Gagal menyimpan jadwal", "error");
    }
  }

  async function deleteRelaySchedule(id: string) {
    try {
      const response = await fetch(`/api/devices/relay-schedules/${id}`, { method: "DELETE" });
      if (response.ok) {
        setRelaySchedules((current) => current.filter((s) => s.id !== id));
        notify("Jadwal berhasil dihapus", "success");
      } else {
        notify("Gagal menghapus jadwal", "error");
      }
    } catch (err) {
      console.error("Error deleting schedule:", err);
      notify("Gagal menghapus jadwal", "error");
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — Auth check
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const stored = sessionStorage.getItem("smartbox_auth");
    if (stored === "1") {
      setIsAuthenticated(true);
    }
    setAuthChecked(true);
  }, []);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — MQTT WebSocket connection
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;

    let client: import("mqtt").MqttClient | undefined;
    let cancelled = false;
    const wsUrl = process.env.NEXT_PUBLIC_MQTT_WS_URL || DEFAULT_MQTT_WS_URL;
    const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";

    import("mqtt")
      .then(({ connect }) => {
        if (cancelled) return;

        client = connect(wsUrl, {
          clientId: `smartbox-dashboard-${Date.now()}`,
          clean: true,
          connectTimeout: 4000,
          reconnectPeriod: 3000,
          username: process.env.NEXT_PUBLIC_MQTT_USERNAME || "",
          password: process.env.NEXT_PUBLIC_MQTT_PASSWORD || "",
        });

        client.on("connect", () => {
          setMqttRealtime("online");
          client?.subscribe(`smartbox/${deviceId}/telemetry`);
          client?.subscribe(`smartbox/${deviceId}/status`);
          client?.subscribe(`smartbox/${deviceId}/event`);
          client?.subscribe(`smartbox/${deviceId}/ack`);
        });

        client.on("message", (topic, payload) => {
          const topicStr = topic.toString();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let data: any;
          try {
            data = JSON.parse(payload.toString());
          } catch (e) {
            console.error("Failed to parse MQTT message JSON:", e);
            return;
          }

          if (topicStr.endsWith("/status")) {
            const isOnline = data.online === true;
            setDeviceStatus((current) => ({
              ...current,
              esp32: isOnline,
              rtc: isOnline ? current.rtc : false,
              lcd: isOnline ? current.lcd : false,
              dfPlayer: isOnline ? current.dfPlayer : false,
              ip: data.ip || current.ip,
              rssi: typeof data.rssi === "number" ? data.rssi : current.rssi,
              lastSeen: new Date().toLocaleTimeString("id-ID"),
            }));
            if (isOnline) {
              setLastTelemetryTime(Date.now());
              setTelemetrySource("ESP32 telemetry");
            } else {
              setTelemetrySource("Offline");
            }
          }

          else if (topicStr.endsWith("/telemetry")) {
            const telemetry = parseTelemetry(payload.toString());
            setLastTelemetryTime(Date.now());
            setTelemetrySource("ESP32 telemetry");

            setDeviceStatus((current) => ({
              ...current,
              esp32: true,
              rtc: typeof telemetry.rtcReady === "boolean" ? telemetry.rtcReady : current.rtc,
              lcd: typeof telemetry.lcdReady === "boolean" ? telemetry.lcdReady : current.lcd,
              dfPlayer: typeof telemetry.dfPlayerReady === "boolean" ? telemetry.dfPlayerReady : current.dfPlayer,
              ip: telemetry.ip || current.ip,
              rssi: typeof telemetry.rssi === "number" ? telemetry.rssi : current.rssi,
              lastSeen: new Date().toLocaleTimeString("id-ID"),
            }));

            if (typeof telemetry.gasEnabled === "boolean") setGasEnabled(telemetry.gasEnabled);
            if (typeof telemetry.tempEnabled === "boolean") setTemperatureEnabled(telemetry.tempEnabled);
            if (typeof telemetry.gasRaw === "number") setGasEstimate(Math.max(0, Math.min(4095, Math.round(telemetry.gasRaw))));
            if (typeof telemetry.gasLevel === "string") setGasLevel(telemetry.gasLevel);
            if (typeof telemetry.temperatureC === "number") setTempEstimate(roundTemperature(telemetry.temperatureC));
            if (typeof telemetry.flameDetected === "boolean") setFlameDetected(telemetry.flameDetected);
            if (typeof telemetry.pirDetected === "boolean") setPirDetected(telemetry.pirDetected);
            if (typeof telemetry.obstacleNear === "boolean") setObstacleNear(telemetry.obstacleNear);
            if (typeof telemetry.pirEnabled === "boolean") setPirEnabled(telemetry.pirEnabled);
            if (typeof telemetry.sleepModeEnabled === "boolean") setSleepModeEnabled(telemetry.sleepModeEnabled);
            if (typeof telemetry.pirGreetingEnabled === "boolean") setPirGreetingEnabled(telemetry.pirGreetingEnabled);
            if (typeof telemetry.pirGreetingTrack === "number") setPirGreetingTrack(telemetry.pirGreetingTrack);
            if (telemetry.pirGreetingStart) setPirGreetingStart(telemetry.pirGreetingStart);
            if (telemetry.pirGreetingEnd) setPirGreetingEnd(telemetry.pirGreetingEnd);
            if (typeof telemetry.dfTrackCount === "number") setDfTrackCount(telemetry.dfTrackCount);
            if (Array.isArray(telemetry.relaySchedules)) {
              const mapped = telemetry.relaySchedules.map((s) => {
                const [start, end] = s.timeRange.split("-");
                return {
                  id: s.id,
                  name: `Jadwal Hardware ${s.id}`,
                  relayNumber: s.relay,
                  startTime: start || "08:00",
                  endTime: end || "10:00",
                  days: JSON.stringify(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
                  enabled: s.enabled,
                };
              });
              setRelaySchedules(mapped);
            }

            // Update relay states and buzzer from telemetry
            setRelayState((current) => {
              const now = Date.now();
              const updated = { ...current };
              if (now - relayPendingRef.current.socket1 > 5000) {
                updated.socket1 = telemetry.relay1 === true;
              }
              if (now - relayPendingRef.current.socket2 > 5000) {
                updated.socket2 = telemetry.relay2 === true;
              }
              if (now - relayPendingRef.current.ampli > 5000) {
                updated.ampli = telemetry.bluetoothRelay === true;
              }
              return updated;
            });
            if (telemetry.relay1 === false) {
              setRelayAutoOffAt((current) => ({ ...current, socket1: null }));
            } else if (telemetry.relay1 === true && typeof telemetry.relay1AutoOffRemaining === "number" && telemetry.relay1AutoOffRemaining > 0) {
              setRelayAutoOffAt((current) => ({ ...current, socket1: Date.now() + telemetry.relay1AutoOffRemaining! * 1000 }));
            }
            if (telemetry.relay2 === false) {
              setRelayAutoOffAt((current) => ({ ...current, socket2: null }));
            } else if (telemetry.relay2 === true && typeof telemetry.relay2AutoOffRemaining === "number" && telemetry.relay2AutoOffRemaining > 0) {
              setRelayAutoOffAt((current) => ({ ...current, socket2: Date.now() + telemetry.relay2AutoOffRemaining! * 1000 }));
            }
            setBuzzerEnabled(telemetry.buzzer === true);
          }

          else if (topicStr.endsWith("/event")) {
            const newEvent = {
              id: data.id || Math.random().toString(),
              type: data.type || "event",
              message: data.message || "",
              createdAt: data.createdAt || new Date().toISOString(),
              level: data.level || "INFO",
            };
            setEvents((prev) => [newEvent, ...prev.slice(0, 19)]);

            const eventPayload = isRecord(data.payload) ? data.payload : {};
            if (data.type === "relay.updated") {
              const relayNumber = readNumber(eventPayload.relay);
              const relayEnabled = readBoolean(eventPayload.state);
              const autoOffSeconds = readNumber(eventPayload.autoOffSeconds) ?? 0;
              const rid = relayNumber === 1 ? "socket1" : relayNumber === 2 ? "socket2" : null;
              if (rid && typeof relayEnabled === "boolean") {
                relayPendingRef.current[rid] = 0;
                setRelayState((current) => ({ ...current, [rid]: relayEnabled }));
                setRelayAutoOffAt((current) => ({
                  ...current,
                  [rid]: relayEnabled && autoOffSeconds > 0 ? Date.now() + autoOffSeconds * 1000 : null,
                }));
              }
            } else if (data.type === "relay1.auto_off" || data.type === "relay2.auto_off") {
              const rid = data.type === "relay1.auto_off" ? "socket1" : "socket2";
              relayPendingRef.current[rid] = 0;
              setRelayState((current) => ({ ...current, [rid]: false }));
              setRelayAutoOffAt((current) => ({ ...current, [rid]: null }));
            } else if (data.type === "bluetooth.on" || data.type === "bluetooth.off") {
              relayPendingRef.current.ampli = 0;
              setRelayState((current) => ({ ...current, ampli: data.type === "bluetooth.on" }));
            } else if (data.type === "buzzer.updated") {
              const buzzerState = readBoolean(eventPayload.state);
              if (typeof buzzerState === "boolean") setBuzzerEnabled(buzzerState);
            }

            // Autoplay AI voice response
            if (data.type === "ai.chat" && data.payload?.audioUrl) {
              const audio = new Audio(data.payload.audioUrl);
              audio.play().catch(e => console.warn("Failed to auto-play audio:", e));
            }
          }

          else if (topicStr.endsWith("/ack")) {
            console.log("[MQTT Client] ACK received:", data);
            notify(`ACK: ${data.message || "Command diproses"}`, data.ok ? "success" : "error");
          }
        });

        client.on("offline", () => setMqttRealtime("offline"));
        client.on("error", () => setMqttRealtime("offline"));
        client.on("close", () => setMqttRealtime("offline"));
      })
      .catch(() => setMqttRealtime("offline"));

    return () => {
      cancelled = true;
      client?.end(true);
    };
  }, [isAuthenticated]);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — MQTT API health check
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    async function checkMqttStatus() {
      try {
        const response = await fetch("/api/mqtt", { cache: "no-store" });
        const data = (await response.json()) as { online?: boolean };
        if (active) setMqttApiOnline(Boolean(data.online));
      } catch {
        if (active) setMqttApiOnline(false);
      }
    }
    checkMqttStatus();
    const interval = window.setInterval(checkMqttStatus, 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, [isAuthenticated]);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — Device timeout checker
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;
    const checkTimeout = setInterval(() => {
      const now = Date.now();
      const timeoutLimit = (telemetrySource === "ESP32 telemetry") ? 10000 : 25000;
      const isConnected = lastTelemetryTime > 0 && (now - lastTelemetryTime <= timeoutLimit);
      setDeviceStatus((current) => {
        if (current.esp32 !== isConnected) {
          return { ...current, esp32: isConnected, rtc: isConnected ? current.rtc : false, lcd: isConnected ? current.lcd : false, dfPlayer: isConnected ? current.dfPlayer : false };
        }
        return current;
      });
      if (!isConnected) setTelemetrySource("Offline");
    }, 1000);
    return () => clearInterval(checkTimeout);
  }, [isAuthenticated, lastTelemetryTime, telemetrySource]);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — Load schedules & settings from DB
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadSchedules() {
      try {
        const response = await fetch("/api/devices/relay-schedules");
        if (response.ok) { const data = await response.json(); setRelaySchedules(data); }
      } catch (err) { console.error("Gagal memuat jadwal dari database:", err); }
    }
    loadSchedules();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadAlarmSchedules() {
      try {
        const response = await fetch("/api/alarm-schedules");
        if (response.ok) { const data = await response.json(); setAlarmSchedules(data); }
      } catch (err) { console.error("Gagal memuat jadwal alarm dari database:", err); }
    }
    loadAlarmSchedules();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadPirGreeting() {
      try {
        const response = await fetch("/api/pir-greeting-settings");
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setPirGreetingEnabled(data.enabled);
            setPirGreetingTrack(data.track);
            setPirGreetingStart(data.startTime);
            setPirGreetingEnd(data.endTime);
            setPirGreetingCooldown(data.cooldownSeconds);
            setPirGreetingPlayMode(data.playMode);
            try { if (data.days) setPirGreetingDays(JSON.parse(data.days)); }
            catch (e) { console.error("Error parsing PIR greeting days:", e); }
          }
        }
      } catch (err) { console.error("Gagal memuat setting PIR dari database:", err); }
    }
    loadPirGreeting();
  }, [isAuthenticated]);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — Telemetry history polling from Neon DB
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";

    interface ReadingData {
      temperature?: number;
      gasRaw?: number;
      gasSensorEnabled?: boolean;
      pirDetected?: boolean;
      relay1?: boolean;
      relay2?: boolean;
      bluetoothRelay?: boolean;
      buzzer?: boolean;
      createdAt: string;
    }

    async function loadTelemetryHistory() {
      try {
        const response = await fetch(`/api/readings?deviceId=${deviceId}&limit=24`);
        if (response.ok && active) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const history = data.map((item: ReadingData) => item.temperature || 28);
            setTempHistory(history);
            const gasHistoryList = data.map((item: ReadingData) => item.gasRaw ?? 120);
            setGasHistory(gasHistoryList);

            const latest = data[data.length - 1] as ReadingData | undefined;
            if (latest) {
              if (typeof latest.temperature === "number") setTempEstimate(latest.temperature);
              if (typeof latest.gasRaw === "number") setGasEstimate(latest.gasRaw);
              if (typeof latest.gasSensorEnabled === "boolean") setGasEnabled(latest.gasSensorEnabled);
              setTemperatureEnabled(true);
              if (typeof latest.pirDetected === "boolean") setPirDetected(latest.pirDetected);

              setRelayState((current) => {
                const now = Date.now();
                const updated = { ...current };
                if (now - relayPendingRef.current.socket1 > 5000) updated.socket1 = latest.relay1 === true;
                if (now - relayPendingRef.current.socket2 > 5000) updated.socket2 = latest.relay2 === true;
                if (now - relayPendingRef.current.ampli > 5000) updated.ampli = latest.bluetoothRelay === true;
                return updated;
              });
              if (latest.relay1 === false) setRelayAutoOffAt((current) => ({ ...current, socket1: null }));
              if (latest.relay2 === false) setRelayAutoOffAt((current) => ({ ...current, socket2: null }));
              setBuzzerEnabled(latest.buzzer === true);

              const lastTime = new Date(latest.createdAt).getTime();
              const now = Date.now();
              const isRecent = (now - lastTime) < 25000;

              if (isRecent) {
                if (telemetrySource !== "ESP32 telemetry") {
                  setTelemetrySource("Neon DB Sync");
                  setLastTelemetryTime(lastTime);
                }
                setDeviceStatus((current) => {
                  if (!current.esp32) return { ...current, esp32: true, rtc: true, lcd: true, dfPlayer: true };
                  return current;
                });
              } else {
                if (telemetrySource === "Neon DB Sync") {
                  setTelemetrySource("Offline");
                  setDeviceStatus((current) => {
                    if (current.esp32) return { ...current, esp32: false };
                    return current;
                  });
                }
              }
            }
          }
        }
      } catch (err) { console.error("Gagal memuat riwayat readings:", err); }
    }

    loadTelemetryHistory();
    const interval = setInterval(loadTelemetryHistory, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [isAuthenticated, telemetrySource]);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — Event logs polling from Neon DB
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
    async function loadEventsHistory() {
      try {
        const response = await fetch(`/api/events?deviceId=${deviceId}&limit=15`);
        if (response.ok && active) {
          const data = await response.json();
          if (Array.isArray(data)) setEvents(data);
        }
      } catch (err) { console.error("Gagal memuat log event:", err); }
    }
    loadEventsHistory();
    const interval = setInterval(loadEventsHistory, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [isAuthenticated]);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — Browser audio alarm
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;
    const isWarning = gasWarning || tempWarning;
    if (!isWarning) return;

    let audioCtx: AudioContext | null = null;
    let intervalId: number | null = null;

    function playBeep() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioContextClass();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } catch (e) { console.error("Gagal memainkan alarm suara browser:", e); }
    }

    playBeep();
    intervalId = window.setInterval(playBeep, 1200);
    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (audioCtx) audioCtx.close().catch(() => {});
    };
  }, [isAuthenticated, gasWarning, tempWarning]);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — History series update
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isAuthenticated) return;
    if (telemetrySource === "Offline" || !temperatureEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTempHistory((current) => [...current.slice(1), visibleTempEstimate]);
  }, [isAuthenticated, telemetrySource, temperatureEnabled, visibleTempEstimate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (telemetrySource === "Offline" || !gasEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGasHistory((current) => [...current.slice(1), visibleGasEstimate]);
  }, [isAuthenticated, telemetrySource, gasEnabled, visibleGasEstimate]);

  /* ═══════════════════════════════════════════════════════════════
     EFFECTS — Relay auto-off timers
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const timers: number[] = [];
    (["socket1", "socket2"] as const).forEach((relayId) => {
      const deadline = relayAutoOffAt[relayId];
      if (!deadline) return;
      const delay = Math.max(0, deadline - Date.now());
      timers.push(window.setTimeout(() => {
        relayPendingRef.current[relayId] = 0;
        setRelayState((current) => ({ ...current, [relayId]: false }));
        setRelayAutoOffAt((current) => ({ ...current, [relayId]: null }));
      }, delay));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [relayAutoOffAt]);

  /* ─── Context value ─── */
  const value: SmartboxContextValue = {
    isAuthenticated, authChecked, passwordInput, loginError, setPasswordInput, submitLogin,
    gasEnabled, temperatureEnabled, visibleGasEstimate, visibleTempEstimate, gasPpm, gasPercent, tempPercent, gasWarning, tempWarning, gasState, tempState, flameDetected, pirDetected, obstacleNear, pirEnabled, sleepModeEnabled,
    pirGreetingEnabled, pirGreetingTrack, pirGreetingStart, pirGreetingEnd, pirGreetingCooldown, pirGreetingDays, pirGreetingPlayMode,
    deviceStatuses: deviceStatus, dfTrackCount, telemetrySource, tempHistory, gasHistory,
    relayState, relayAutoOffAt, relayActiveCount, relaySchedules,
    alarms, alarmSchedules, activeAlarms,
    mqttOnline, status, lastCommand, voiceMode, buzzerEnabled, boardLedScheduleEnabled,
    events, toast, notify, setToast,
    publish, sendDeviceCommand, toggleGas, toggleTemperature, toggleRelay, togglePir, toggleSleepMode,
    updateAlarm, setBuzzerEnabled, setBoardLedScheduleEnabled, setVoiceMode, updatePirGreetingConfig,
    saveRelaySchedule, deleteRelaySchedule,
    onSaveSchedule: saveAlarmSchedule, onDeleteSchedule: deleteAlarmSchedule, onToggleScheduleActive: toggleAlarmScheduleActive, onTestPlayVoice: testPlayVoice,
  };

  return <SmartboxContext.Provider value={value}>{children}</SmartboxContext.Provider>;
}
