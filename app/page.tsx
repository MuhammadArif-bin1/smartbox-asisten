"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ViewId = "dashboard" | "monitoring" | "devices" | "ai" | "alarms" | "history" | "settings";
type CommandStatus = "idle" | "sending" | "sent" | "error";
type RelayId = "socket1" | "socket2" | "ampli";
type Toast = {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
};

type Alarm = {
  id: string;
  label: string;
  time: string;
  greeting: string;
  track: number;
  enabled: boolean;
};

type TelemetryPayload = {
  gasEnabled?: boolean;
  gasRaw?: number;
  tempEnabled?: boolean;
  temperatureC?: number;
  flameDetected?: boolean;
  pirDetected?: boolean;
  obstacleNear?: boolean;
  rtcReady?: boolean;
  lcdReady?: boolean;
  dfPlayerReady?: boolean;
  pirEnabled?: boolean;
  sleepModeEnabled?: boolean;
  pirGreetingEnabled?: boolean;
  pirGreetingTrack?: number;
  pirGreetingStart?: string;
  pirGreetingEnd?: string;
  dfTrackCount?: number;
  relaySchedules?: Array<{ id: string; relay: number; enabled: boolean; timeRange: string }>;
  relay1?: boolean;
  relay2?: boolean;
  relay1AutoOffRemaining?: number;
  relay2AutoOffRemaining?: number;
  bluetoothRelay?: boolean;
  ampRelay?: boolean;
  buzzer?: boolean;
  online?: boolean;
  gasLevel?: string;
  gasDetected?: boolean;
  ip?: string;
  rssi?: number;
};

const views: Array<{ id: ViewId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "monitoring", label: "Monitoring" },
  { id: "devices", label: "Devices Control" },
  { id: "ai", label: "AI Assistant" },
  { id: "alarms", label: "Alarm Jadwal" },
  { id: "history", label: "Riwayat" },
  { id: "settings", label: "Pengaturan" },
];

const initialAlarms: Alarm[] = [
  { id: "morning", label: "Pagi", time: "07:00", greeting: "Pengingat aktivitas pagi", track: 4, enabled: true },
  { id: "noon", label: "Siang", time: "12:30", greeting: "Pengingat istirahat siang", track: 5, enabled: true },
  { id: "evening", label: "Malam", time: "19:30", greeting: "Pengingat istirahat malam", track: 6, enabled: true },
];

const audioTracks = [
  { id: 1, name: "0001.mp3", label: "Smartbox siap digunakan", use: "Sistem utama" },
  { id: 2, name: "0002.mp3", label: "Jam dan suhu", use: "Sistem utama" },
  { id: 3, name: "0003.mp3", label: "Bluetooth diaktifkan", use: "Bluetooth/audio" },
  { id: 4, name: "0004.mp3", label: "Selamat pagi", use: "Alarm" },
  { id: 5, name: "0005.mp3", label: "Selamat siang", use: "Alarm" },
  { id: 6, name: "0006.mp3", label: "Selamat sore", use: "Alarm" },
  { id: 7, name: "0007.mp3", label: "Asap terdeteksi", use: "Sensor MQ-2" },
  { id: 8, name: "0008.mp3", label: "Gas terdeteksi", use: "Sensor MQ-2" },
  { id: 9, name: "0009.mp3", label: "Suhu terdeteksi", use: "Sensor DS3231" },
  { id: 10, name: "0010.mp3", label: "Gerakan berjalan", use: "Sensor PIR" },
  { id: 11, name: "0011.mp3", label: "Gerakan melompat", use: "Sensor PIR" },
  { id: 12, name: "0012.mp3", label: "Gerakan melambaikan tangan", use: "Sensor PIR" },
  { id: 13, name: "0013.mp3", label: "Bluetooth Smartbox Assistant dimatikan", use: "Bluetooth/audio" },
];

type BoardProfile = "ESP32_S3" | "ESP32_WROOM";

const selectedBoardProfile: BoardProfile = process.env.NEXT_PUBLIC_BOARD_PROFILE === "ESP32_WROOM" ? "ESP32_WROOM" : "ESP32_S3";
const boardPinProfiles = {
  ESP32_S3: {
    label: "ESP32-S3",
    boardLed: "GPIO 48",
    gas: "GPIO 3",
    buzzer: "GPIO 10",
    relaySocket1: "GPIO 21",
    relaySocket2: "GPIO 47",
    relayAmpli: "GPIO 14",
    groups: [
      ["DFPlayer RX/TX", "GPIO 8 / 18"],
      ["Mic INMP441 SCK/WS/SD", "GPIO 4 / 5 / 6"],
      ["RTC + LCD I2C SDA/SCL", "GPIO 1 / 2"],
      ["Push button", "GPIO 7 / 19 / 20"],
      ["PIR + IR", "GPIO 9 / 42"],
      ["Buzzer + MQ-2", "GPIO 10 / 3"],
      ["Relay 1 / Relay 2 / Bluetooth", "GPIO 21 / 47 / 14"],
      ["LED 12V", "GPIO 12"],
    ],
  },
  ESP32_WROOM: {
    label: "ESP32-WROOM",
    boardLed: "GPIO 2",
    gas: "GPIO 25",
    buzzer: "GPIO 13",
    relaySocket1: "GPIO 19",
    relaySocket2: "GPIO 18",
    relayAmpli: "GPIO 5",
    groups: [
      ["DFPlayer TX/RX", "GPIO 16 / 17"],
      ["PT8211 BCK/DIN/WS", "GPIO 15 / 4 / 2"],
      ["Mic INMP441", "GPIO 15 / 2 / 23"],
      ["RTC + LCD I2C", "GPIO 21 / 22"],
      ["Push button", "GPIO 27 / 14 / 12"],
      ["PIR + IR", "GPIO 33 / 26"],
      ["Buzzer + MQ-2", "GPIO 13 / 25"],
      ["Relay", "GPIO 19 / 18 / 5"],
      ["LED 12V PWM", "GPIO 32"],
    ],
  },
} as const;

const boardPins = boardPinProfiles[selectedBoardProfile];

const relayControls: Array<{ id: RelayId; label: string; detail: string; pin: string; mqttKey: string }> = [
  { id: "socket1", label: "Stop Kontak 1", detail: "Relay beban utama", pin: boardPins.relaySocket1, mqttKey: "socket_1" },
  { id: "socket2", label: "Stop Kontak 2", detail: "Relay beban cadangan", pin: boardPins.relaySocket2, mqttKey: "socket_2" },
  { id: "ampli", label: "Bluetooth Ampli", detail: "Power amplifier audio", pin: boardPins.relayAmpli, mqttKey: "bluetooth_ampli" },
];

const temperatureSeries = [28, 28.6, 29.1, 30, 30.5, 30.2, 29.4, 28.8, 28.2, 27.6, 26.8, 25.8, 25.4, 25.6, 26.4, 27.2, 27.8, 27.2];
const TEMP_WARNING_C = 35;
const GAS_WARNING_RAW = 1800;
const BOARD_LED_DURATION_SECONDS = 10;
const DEFAULT_MQTT_WS_URL = "ws://192.168.1.12:9001";
const MQTT_BROKER_LABEL = "mqtt://192.168.1.12:1883";
const DASHBOARD_PASSWORD = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || "smartbox123";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function sendMqttCommand(topic: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/mqtt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, payload }),
  });

  if (!response.ok) {
    throw new Error("Gagal mengirim command MQTT");
  }

  return response.json();
}

async function sendDeviceCommandApi(deviceId: string, type: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/device/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, type, payload }),
  });

  if (!response.ok) {
    throw new Error("Gagal mengirim command ke API");
  }

  return response.json();
}


export default function Home() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [alarms, setAlarms] = useState(initialAlarms);
  const [gasEnabled, setGasEnabled] = useState(true);
  const [temperatureEnabled, setTemperatureEnabled] = useState(true);
  const [gasEstimate, setGasEstimate] = useState(0);
  const [tempEstimate, setTempEstimate] = useState(0);
  const [gasLevel, setGasLevel] = useState<string>("normal");
  const [telemetrySource, setTelemetrySource] = useState("Offline");
  const [mqttRealtime, setMqttRealtime] = useState<"connecting" | "online" | "offline">("connecting");
  const [mqttApiOnline, setMqttApiOnline] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [buzzerEnabled, setBuzzerEnabled] = useState(false);
  const [boardLedScheduleEnabled, setBoardLedScheduleEnabled] = useState(true);
  const [relayState, setRelayState] = useState<Record<RelayId, boolean>>({ socket1: false, socket2: false, ampli: false });
  const [relayAutoOffAt, setRelayAutoOffAt] = useState<{ socket1: number | null; socket2: number | null }>({
    socket1: null,
    socket2: null,
  });
  const relayPendingRef = useRef<Record<RelayId, number>>({ socket1: 0, socket2: 0, ampli: 0 });
  const [status, setStatus] = useState<CommandStatus>("idle");
  const [lastCommand, setLastCommand] = useState("Belum ada command dikirim");
  const [toast, setToast] = useState<Toast | null>(null);
  const [pirEnabled, setPirEnabled] = useState(true);
  const [sleepModeEnabled, setSleepModeEnabled] = useState(false);
  const [pirGreetingEnabled, setPirGreetingEnabled] = useState(false);
  const [pirGreetingTrack, setPirGreetingTrack] = useState(10);
  const [pirGreetingStart, setPirGreetingStart] = useState("07:00");
  const [pirGreetingEnd, setPirGreetingEnd] = useState("22:00");
  const [pirGreetingCooldown, setPirGreetingCooldown] = useState(10);
  const [pirGreetingDays, setPirGreetingDays] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  const [pirGreetingPlayMode, setPirGreetingPlayMode] = useState("cooldown");
  const [dfTrackCount, setDfTrackCount] = useState(13);
  const [relaySchedules, setRelaySchedules] = useState<Array<{
    id: string;
    name: string;
    relayNumber: number;
    startTime: string;
    endTime: string;
    days: string;
    enabled: boolean;
  }>>([]);
  const [deviceStatus, setDeviceStatus] = useState({
    esp32: false,
    rtc: false,
    lcd: false,
    dfPlayer: false,
    ip: "-",
    rssi: 0,
    lastSeen: "-",
  });
  const [lastTelemetryTime, setLastTelemetryTime] = useState<number>(0);
  const [tempHistory, setTempHistory] = useState(temperatureSeries);
  const [flameDetected, setFlameDetected] = useState(false);
  const [pirDetected, setPirDetected] = useState<boolean | null>(null);
  const [obstacleNear, setObstacleNear] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [events, setEvents] = useState<Array<{ id: string; type: string; message: string; createdAt: string; level: string }>>([]);

  const activeAlarms = useMemo(() => alarms.filter((alarm) => alarm.enabled).length, [alarms]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAuthenticated(false);
      setAuthChecked(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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
              const relayId = relayNumber === 1 ? "socket1" : relayNumber === 2 ? "socket2" : null;

              if (relayId && typeof relayEnabled === "boolean") {
                relayPendingRef.current[relayId] = 0;
                setRelayState((current) => ({ ...current, [relayId]: relayEnabled }));
                setRelayAutoOffAt((current) => ({
                  ...current,
                  [relayId]: relayEnabled && autoOffSeconds > 0 ? Date.now() + autoOffSeconds * 1000 : null,
                }));
              }
            } else if (data.type === "relay1.auto_off" || data.type === "relay2.auto_off") {
              const relayId = data.type === "relay1.auto_off" ? "socket1" : "socket2";
              relayPendingRef.current[relayId] = 0;
              setRelayState((current) => ({ ...current, [relayId]: false }));
              setRelayAutoOffAt((current) => ({ ...current, [relayId]: null }));
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
    const interval = window.setInterval(checkMqttStatus, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const checkTimeout = setInterval(() => {
      const now = Date.now();
      const timeoutLimit = (telemetrySource === "ESP32 telemetry") ? 10000 : 25000;
      const isConnected = lastTelemetryTime > 0 && (now - lastTelemetryTime <= timeoutLimit);

      setDeviceStatus((current) => {
        if (current.esp32 !== isConnected) {
          return {
            ...current,
            esp32: isConnected,
            rtc: isConnected ? current.rtc : false,
            lcd: isConnected ? current.lcd : false,
            dfPlayer: isConnected ? current.dfPlayer : false,
          };
        }
        return current;
      });

      if (!isConnected) {
        setTelemetrySource("Offline");
      }
    }, 1000);

    return () => clearInterval(checkTimeout);
  }, [isAuthenticated, lastTelemetryTime, telemetrySource]);

  // Hapus interval simulasi acak lokal agar angka tidak terdeteksi saat sensor/perangkat dicabut
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

  // Load relay schedules from database on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadSchedules() {
      try {
        const response = await fetch("/api/devices/relay-schedules");
        if (response.ok) {
          const data = await response.json();
          setRelaySchedules(data);
        }
      } catch (err) {
        console.error("Gagal memuat jadwal dari database:", err);
      }
    }
    loadSchedules();
  }, [isAuthenticated]);

  // Fetch alarms from Neon DB via Prisma on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadAlarms() {
      try {
        const response = await fetch("/api/alarms");
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const mapped = data.map((item: { id: string; label: string; time: string; greeting: string; dfTrack: number; enabled: boolean }) => ({
              id: item.id,
              label: item.label,
              time: item.time,
              greeting: item.greeting,
              track: item.dfTrack,
              enabled: item.enabled,
            }));
            setAlarms(mapped);
          }
        }
      } catch (err) {
        console.error("Gagal memuat alarm dari database:", err);
      }
    }
    loadAlarms();
  }, [isAuthenticated]);

  // Fetch PIR greeting settings from DB on mount
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
            try {
              if (data.days) {
                setPirGreetingDays(JSON.parse(data.days));
              }
            } catch (e) {
              console.error("Error parsing PIR greeting days:", e);
            }
          }
        }
      } catch (err) {
        console.error("Gagal memuat setting PIR dari database:", err);
      }
    }
    loadPirGreeting();
  }, [isAuthenticated]);

  // Fetch telemetry history from Neon DB (SensorReading table) on mount and poll every 8 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;
    const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";

    async function loadTelemetryHistory() {
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
      try {
        const response = await fetch(`/api/readings?deviceId=${deviceId}&limit=24`);
        if (response.ok && active) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const history = data.map((item: ReadingData) => item.temperature || 28);
            setTempHistory(history);
            
            const latest = data[data.length - 1] as ReadingData | undefined;
            if (latest) {
              if (typeof latest.temperature === "number") setTempEstimate(latest.temperature);
              if (typeof latest.gasRaw === "number") setGasEstimate(latest.gasRaw);
              if (typeof latest.gasSensorEnabled === "boolean") setGasEnabled(latest.gasSensorEnabled);
              // In our new schema, DS3231 temperature enabled matches whether rtcReady was true
              setTemperatureEnabled(true);
              if (typeof latest.pirDetected === "boolean") setPirDetected(latest.pirDetected);
              
              setRelayState((current) => {
                const now = Date.now();
                const updated = { ...current };
                if (now - relayPendingRef.current.socket1 > 5000) {
                  updated.socket1 = latest.relay1 === true;
                }
                if (now - relayPendingRef.current.socket2 > 5000) {
                  updated.socket2 = latest.relay2 === true;
                }
                if (now - relayPendingRef.current.ampli > 5000) {
                  updated.ampli = latest.bluetoothRelay === true;
                }
                return updated;
              });
              if (latest.relay1 === false) {
                setRelayAutoOffAt((current) => ({ ...current, socket1: null }));
              }
              if (latest.relay2 === false) {
                setRelayAutoOffAt((current) => ({ ...current, socket2: null }));
              }
              setBuzzerEnabled(latest.buzzer === true);

              const lastTime = new Date(latest.createdAt).getTime();
              const now = Date.now();
              // Database polling is every 8 seconds. We consider it recent if the record is within 25 seconds.
              const isRecent = (now - lastTime) < 25000;
              
              if (isRecent) {
                if (telemetrySource !== "ESP32 telemetry") {
                  setTelemetrySource("Neon DB Sync");
                  setLastTelemetryTime(lastTime);
                }
                setDeviceStatus((current) => {
                  if (!current.esp32) {
                    return {
                      ...current,
                      esp32: true,
                      rtc: true,
                      lcd: true,
                      dfPlayer: true,
                    };
                  }
                  return current;
                });
              } else {
                if (telemetrySource === "Neon DB Sync") {
                  setTelemetrySource("Offline");
                  setDeviceStatus((current) => {
                    if (current.esp32) {
                      return {
                        ...current,
                        esp32: false,
                      };
                    }
                    return current;
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Gagal memuat riwayat readings:", err);
      }
    }

    loadTelemetryHistory();
    const interval = setInterval(loadTelemetryHistory, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, telemetrySource]);

  // Fetch EventLogs from Neon DB on mount and poll every 1.5 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;
    const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";

    async function loadEventsHistory() {
      try {
        const response = await fetch(`/api/events?deviceId=${deviceId}&limit=15`);
        if (response.ok && active) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setEvents(data);
          }
        }
      } catch (err) {
        console.error("Gagal memuat log event:", err);
      }
    }

    loadEventsHistory();
    const interval = setInterval(loadEventsHistory, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Web Audio API browser warning sound
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
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } catch (e) {
        console.error("Gagal memainkan alarm suara browser:", e);
      }
    }

    playBeep();
    intervalId = window.setInterval(playBeep, 1200);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [isAuthenticated, gasWarning, tempWarning]);


  useEffect(() => {
    if (!isAuthenticated) return;
    if (telemetrySource === "Offline" || !temperatureEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTempHistory((current) => [...current.slice(1), visibleTempEstimate]);
  }, [isAuthenticated, telemetrySource, temperatureEnabled, visibleTempEstimate]);

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
    // Backwards compatible wrapper: maps legacy publish calls to new API command endpoint
    let type = "unknown";
    if (topic.includes("alarm")) {
      type = "alarm.set";
    } else if (topic.includes("relay/set")) {
      // Map to correct relay.set format
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

  async function toggleRelay(relayId: RelayId) {
    const next = !relayState[relayId];
    const previousAutoOffAt = relayId === "ampli" ? null : relayAutoOffAt[relayId];
    setRelayState((current) => ({ ...current, [relayId]: next }));
    relayPendingRef.current[relayId] = Date.now();
    if (relayId !== "ampli") {
      setRelayAutoOffAt((current) => ({
        ...current,
        [relayId]: next ? Date.now() + 60_000 : null,
      }));
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

  async function updatePirGreetingConfig(
    enabled: boolean,
    track: number,
    start: string,
    end: string,
    cooldown: number,
    playMode: string,
    days: string[]
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
        body: JSON.stringify({
          enabled,
          track,
          startTime: start,
          endTime: end,
          cooldownSeconds: cooldown,
          playMode,
          days: JSON.stringify(days),
        }),
      });
      if (!response.ok) throw new Error("Setting PIR ditolak API");
    } catch (err) {
      console.error("Gagal menyimpan setting PIR ke database:", err);
      notify("Gagal menyimpan pengaturan PIR greeting.", "error");
      return;
    }

    await sendDeviceCommand(
      "pirGreeting.set",
      {
        enabled,
        track,
        startTime: start,
        endTime: end,
        cooldownSeconds: cooldown,
        playMode,
        days,
      },
      "Update PIR Greeting"
    );
  }

  async function saveRelaySchedule(sch: { id?: string; name: string; relayNumber: number; startTime: string; endTime: string; days: string; enabled: boolean }) {
    try {
      const isEdit = !!sch.id;
      const url = isEdit ? `/api/devices/relay-schedules/${sch.id}` : "/api/devices/relay-schedules";
      const method = isEdit ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sch),
      });

      if (response.ok) {
        const saved = await response.json();
        setRelaySchedules((current) => {
          if (isEdit) {
            return current.map((item) => (item.id === sch.id ? saved : item));
          } else {
            return [...current, saved];
          }
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
      const response = await fetch(`/api/devices/relay-schedules/${id}`, {
        method: "DELETE",
      });

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

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (passwordInput === DASHBOARD_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError("");
      setPasswordInput("");
      return;
    }

    setLoginError("Password salah");
  }

  const common = {
    activeAlarms,
    alarms,
    buzzerEnabled,
    boardLedScheduleEnabled,
    gasEnabled,
    gasPercent,
    gasPpm,
    gasState,
    gasWarning,
    lastCommand,
    mqttOnline,
    relayActiveCount,
    relayAutoOffAt,
    relayState,
    status,
    telemetrySource,
    tempHistory,
    tempPercent,
    tempState,
    tempWarning,
    temperatureEnabled,
    updateAlarm,
    visibleGasEstimate,
    visibleTempEstimate,
    voiceMode,
    publish,
    notify,
    setBuzzerEnabled,
    setBoardLedScheduleEnabled,
    setVoiceMode,
    toggleGas,
    toggleRelay,
    toggleTemperature,
    deviceStatuses: deviceStatus,
    pirEnabled,
    sleepModeEnabled,
    pirGreetingEnabled,
    pirGreetingTrack,
    pirGreetingStart,
    pirGreetingEnd,
    pirGreetingCooldown,
    pirGreetingDays,
    pirGreetingPlayMode,
    dfTrackCount,
    relaySchedules,
    togglePir,
    toggleSleepMode,
    updatePirGreetingConfig,
    saveRelaySchedule,
    deleteRelaySchedule,
    flameDetected,
    pirDetected,
    obstacleNear,
    sendDeviceCommand,
    events,
  };

  if (!authChecked) {
    return <LoginScreen password={passwordInput} error="" isChecking onPasswordChange={setPasswordInput} onSubmit={submitLogin} />;
  }

  if (!isAuthenticated) {
    return <LoginScreen password={passwordInput} error={loginError} onPasswordChange={setPasswordInput} onSubmit={submitLogin} />;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="flex min-h-screen">
        <Sidebar activeView={activeView} onChange={setActiveView} />
        <section className="min-w-0 flex-1">
          <Header title={views.find((view) => view.id === activeView)?.label ?? "Dashboard"} />
          {toast && <ToastMessage key={toast.id} toast={toast} onClose={() => setToast(null)} />}
          <div className="px-4 py-5 sm:px-6">
            {activeView === "dashboard" && <DashboardPage {...common} />}
            {activeView === "monitoring" && <MonitoringPage {...common} />}
            {activeView === "devices" && <DevicesPage {...common} />}
            {activeView === "ai" && <AiPage {...common} />}
            {activeView === "alarms" && <AlarmsPage {...common} />}
            {activeView === "history" && <HistoryPage {...common} />}
            {activeView === "settings" && <SettingsPage {...common} />}
          </div>
        </section>
      </div>
    </main>
  );
}

type PageProps = {
  activeAlarms: number;
  alarms: Alarm[];
  boardLedScheduleEnabled: boolean;
  buzzerEnabled: boolean;
  gasEnabled: boolean;
  gasPercent: number;
  gasPpm: number;
  gasState: string;
  gasWarning: boolean;
  lastCommand: string;
  mqttOnline: boolean;
  relayActiveCount: number;
  relayAutoOffAt: { socket1: number | null; socket2: number | null };
  relayState: Record<RelayId, boolean>;
  status: CommandStatus;
  telemetrySource: string;
  tempHistory: number[];
  tempPercent: number;
  tempState: string;
  tempWarning: boolean;
  temperatureEnabled: boolean;
  updateAlarm: (id: string, field: keyof Alarm, value: string | number | boolean) => void;
  visibleGasEstimate: number;
  visibleTempEstimate: number;
  voiceMode: boolean;
  publish: (topic: string, payload: Record<string, unknown>, label: string) => Promise<boolean>;
  notify: (message: string, tone?: Toast["tone"]) => void;
  setBuzzerEnabled: (enabled: boolean) => void;
  setBoardLedScheduleEnabled: (enabled: boolean) => void;
  setVoiceMode: (enabled: boolean) => void;
  toggleGas: () => void;
  toggleRelay: (relayId: RelayId) => Promise<void>;
  toggleTemperature: () => void;
  deviceStatuses: { esp32: boolean; rtc: boolean; lcd: boolean; dfPlayer: boolean; ip?: string; rssi?: number; lastSeen?: string };
  pirEnabled: boolean;
  sleepModeEnabled: boolean;
  pirGreetingEnabled: boolean;
  pirGreetingTrack: number;
  pirGreetingStart: string;
  pirGreetingEnd: string;
  pirGreetingCooldown: number;
  pirGreetingDays: string[];
  pirGreetingPlayMode: string;
  dfTrackCount: number;
  relaySchedules: Array<{ id: string; name: string; relayNumber: number; startTime: string; endTime: string; days: string; enabled: boolean }>;
  togglePir: () => void;
  toggleSleepMode: () => void;
  updatePirGreetingConfig: (
    enabled: boolean,
    track: number,
    start: string,
    end: string,
    cooldown: number,
    playMode: string,
    days: string[]
  ) => Promise<void>;
  saveRelaySchedule: (sch: { id?: string; name: string; relayNumber: number; startTime: string; endTime: string; days: string; enabled: boolean }) => Promise<void>;
  deleteRelaySchedule: (id: string) => Promise<void>;
  flameDetected: boolean;
  pirDetected: boolean | null;
  obstacleNear: boolean;
  sendDeviceCommand: (type: string, payload: Record<string, unknown>, label: string, successMsg?: string, errorMsg?: string) => Promise<boolean>;
  events: Array<{ id: string; type: string; message: string; createdAt: string; level: string }>;
};

function Sidebar({ activeView, onChange }: { activeView: ViewId; onChange: (view: ViewId) => void }) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white/95 px-4 py-5 shadow-sm lg:flex lg:flex-col">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-200">SB</div>
        <div>
          <p className="text-xl font-bold leading-6 text-slate-950">SmartBox</p>
          <p className="text-sm font-medium text-slate-500">Assistant</p>
        </div>
      </div>
      <nav className="mt-8 grid gap-2">
        {views.map((view) => (
          <button
            key={view.id}
            className={`flex h-12 items-center gap-3 rounded-xl px-4 text-left text-sm font-semibold transition ${
              activeView === view.id ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
            onClick={() => onChange(view.id)}
            type="button"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${activeView === view.id ? "bg-white" : "bg-slate-300"}`} />
            {view.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto grid gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <p className="text-sm font-bold text-slate-800">Sistem Online</p>
              <p className="text-xs text-slate-500">Broker MQTT aktif</p>
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
      </div>
    </aside>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600 lg:hidden">SmartBox Assistant</p>
          <h1 className="text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">
            {title === "Dashboard" ? "SmartBox Assistant Dashboard" : title}
          </h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white">A</div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-slate-900">Admin</p>
              <p className="text-xs text-slate-500">Administrator</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function LoginScreen({
  password,
  error,
  isChecking = false,
  onPasswordChange,
  onSubmit,
}: {
  password: string;
  error: string;
  isChecking?: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-950">
      <section className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-200">SB</div>
          <div>
            <h1 className="text-xl font-black leading-6 text-slate-950">SmartBox</h1>
            <p className="text-sm font-semibold text-slate-500">Dashboard Login</p>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-slate-700">Password</span>
            <input
              autoComplete="current-password"
              autoFocus
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              disabled={isChecking}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Masukkan password"
              type="password"
              value={password}
            />
          </label>

          {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

          <button
            className="h-12 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:bg-slate-400"
            disabled={isChecking}
            type="submit"
          >
            {isChecking ? "Memeriksa" : "Masuk"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ToastMessage({ toast, onClose }: { toast: Toast; onClose: () => void }) {
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
    <div className="fixed right-4 top-24 z-50 max-w-sm">
      <div className={`rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg ${toneClass[toast.tone]}`}>
        <div className="flex items-start gap-3">
          <p className="leading-6">{toast.message}</p>
          <button className="ml-auto text-current/70 hover:text-current" onClick={onClose} type="button">
            x
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardPage(props: PageProps) {
  const isSending = props.status === "sending";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-5">
        <StatsGrid {...props} />
        
        {/* Quick Control Panel */}
        <Panel title="Kontrol Cepat Real-time" subtitle="Kirim perintah langsung ke perangkat ESP32-S3 via database-tracked API.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <QuickControlRow
              label="Stop Kontak 1 (Kipas)"
              detail={props.relayState.socket1 ? "Kipas Menyala" : "Kipas Mati"}
              enabled={props.relayState.socket1}
              onToggle={() => props.toggleRelay("socket1")}
              disabled={isSending}
            />
            <QuickControlRow
              label="Stop Kontak 2 (Charger)"
              detail={props.relayState.socket2 ? "Charger ON" : "Charger OFF"}
              enabled={props.relayState.socket2}
              onToggle={() => props.toggleRelay("socket2")}
              disabled={isSending}
            />
            <QuickControlRow
              label="Relay Bluetooth"
              detail={props.relayState.ampli ? "Bluetooth Aktif (1 m)" : "Bluetooth Mati"}
              enabled={props.relayState.ampli}
              onToggle={() => props.toggleRelay("ampli")}
              disabled={isSending}
            />
            <QuickControlRow
              label="Alarm Buzzer"
              detail={props.buzzerEnabled ? "Buzzer ON" : "Buzzer OFF"}
              enabled={props.buzzerEnabled}
              onToggle={() => {
                const next = !props.buzzerEnabled;
                props.setBuzzerEnabled(next);
                props.sendDeviceCommand("buzzer.set", { state: next }, `Buzzer ${next ? "aktif" : "mati"}`);
              }} 
              disabled={isSending}
            />
            
            <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col justify-between min-h-[110px] relative">
              <div>
                <p className="text-sm font-bold text-slate-900">Test Suara DFPlayer</p>
                <p className="text-xs text-slate-500">Pilih track audio 1-13.</p>
              </div>
              <div className="mt-3 flex gap-2">
                <select 
                  id="dashboard-dfplayer-track"
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold outline-none flex-1 focus:ring-2 focus:ring-blue-500/20"
                  defaultValue={1}
                  disabled={isSending}
                >
                  {audioTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.id.toString().padStart(4, "0")} - {track.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    const select = document.getElementById("dashboard-dfplayer-track") as HTMLSelectElement;
                    const track = Number(select?.value || 1);
                    await props.sendDeviceCommand("voice.play", { track }, "Perintah suara", "Perintah suara dikirim", "Gagal mengirim perintah");
                  }}
                  disabled={isSending}
                  className="h-9 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-95 shadow-sm disabled:opacity-50"
                  type="button"
                >
                  Play
                </button>
                <button
                  onClick={() => props.sendDeviceCommand("dfplayer.stop", {}, "DFPlayer Stop")}
                  disabled={isSending}
                  className="h-9 rounded-xl bg-red-100 text-red-600 px-3 text-xs font-bold transition hover:bg-red-200 active:scale-95 disabled:opacity-50"
                  type="button"
                >
                  Stop
                </button>
              </div>
              {isSending && (
                <div className="absolute inset-0 bg-white/40 backdrop-blur-[0.5px] rounded-2xl flex items-center justify-center">
                  <span className="text-[10px] font-black text-blue-600 animate-pulse bg-blue-50/90 px-2.5 py-1 rounded-full border border-blue-100 shadow-sm">Mengirim...</span>
                </div>
              )}
            </div>
          </div>
        </Panel>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <Panel title="Grafik Suhu Ruangan" subtitle="Ringkasan suhu 24 jam terakhir.">
            <TemperatureChart value={props.visibleTempEstimate} series={props.tempHistory} />
          </Panel>
          <Panel title="Ringkasan Sistem" subtitle="Status cepat tanpa kontrol detail.">
            <div className="grid gap-3">
              <ReadingRow label="Suhu" value={props.telemetrySource === "Offline" ? "-" : `${props.visibleTempEstimate.toFixed(1)} C`} status={props.tempState} percent={props.telemetrySource === "Offline" ? 0 : props.tempPercent} tone="blue" />
              <ReadingRow label="Gas / Asap" value={props.telemetrySource === "Offline" ? "-" : `${props.gasPpm} PPM`} status={props.gasState} percent={props.telemetrySource === "Offline" ? 0 : props.gasPercent} tone="emerald" />
              <ReadingRow label="Relay Aktif" value={props.telemetrySource === "Offline" ? "-" : `${props.relayActiveCount} / 3`} status="Perangkat" percent={props.telemetrySource === "Offline" ? 0 : Math.round((props.relayActiveCount / 3) * 100)} tone="orange" />
            </div>
          </Panel>
        </div>
      </div>
      <RightRail {...props} />
    </div>
  );
}

function QuickControlRow({
  label,
  detail,
  enabled,
  onToggle,
  disabled
}: {
  label: string;
  detail: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col justify-between min-h-[110px] relative">
      <div>
        <p className="text-sm font-bold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </div>
      <div className="mt-3 flex justify-between items-center">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
          enabled ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
          {enabled ? "ON" : "OFF"}
        </span>
        <Switch checked={enabled} onChange={onToggle} disabled={disabled} />
      </div>
      {disabled && (
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[0.5px] rounded-2xl flex items-center justify-center">
          <span className="text-[10px] font-black text-blue-600 animate-pulse bg-blue-50/90 px-2.5 py-1 rounded-full border border-blue-100 shadow-sm">Mengirim...</span>
        </div>
      )}
    </div>
  );
}

function MonitoringPage(props: PageProps) {
  const isTempDataWaiting = !props.deviceStatuses.esp32 || props.visibleTempEstimate === 0;
  const isSending = props.status === "sending";
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-5">
        <Panel title="Monitoring Sensor Real-time" subtitle={`Sumber data: ${props.telemetrySource}`}>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <ReadingRow 
              label="Suhu Ruangan" 
              value={isTempDataWaiting ? "Menunggu data..." : `${props.visibleTempEstimate.toFixed(1)}°C`} 
              status={isTempDataWaiting ? "Offline" : props.tempState} 
              percent={isTempDataWaiting ? 0 : props.tempPercent} 
              tone="blue" 
            />
            <ReadingRow label="Gas / Asap" value={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? "-" : `${props.gasPpm} PPM (${props.visibleGasEstimate} RAW)`} status={props.gasState} percent={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? 0 : props.gasPercent} tone="emerald" />
            <ReadingRow 
              label="Gerakan (PIR)" 
              value={!props.deviceStatuses.esp32 ? "Tidak Terhubung" : (props.pirDetected === null ? "Menunggu data PIR..." : (props.pirDetected ? "Gerakan Terdeteksi" : "Tidak Ada Gerakan"))}
              status={!props.deviceStatuses.esp32 ? "Offline" : (props.pirDetected === null ? "Menunggu data PIR..." : (props.pirDetected ? "Gerakan Terdeteksi" : "Tidak Ada Gerakan"))}
              percent={!props.deviceStatuses.esp32 ? 0 : (props.pirDetected ? 100 : 0)}
              tone="orange"
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <WarningCard
              title="Deteksi Peringatan Suhu"
              value={isTempDataWaiting ? "Menunggu data..." : `${props.visibleTempEstimate.toFixed(1)}°C`}
              threshold={`${TEMP_WARNING_C} C`}
              active={props.tempWarning}
              message={props.tempWarning ? `Peringatan suhu DS3231H terdeteksi, pembacaan ${props.visibleTempEstimate.toFixed(1)} C lebih dari batas ${TEMP_WARNING_C} C.` : `Aman, suhu DS3231H masih di batas aman ${TEMP_WARNING_C} C atau lebih rendah.`}
            />
            <WarningCard
              title="Deteksi Peringatan Gas"
              value={`${props.visibleGasEstimate} raw / ${props.gasPpm} PPM`}
              threshold={`${GAS_WARNING_RAW} raw`}
              active={props.gasWarning}
              message={props.gasWarning ? `Peringatan gas terdeteksi, estimasi ${props.visibleGasEstimate} raw melewati ambang ${GAS_WARNING_RAW} raw.` : "Gas/asap masih di bawah ambang peringatan."}
            />
          </div>
        </Panel>
        <Panel title="Kontrol Cepat Real-time" subtitle="Kontrol aktuator utama dari halaman monitoring.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <QuickControlRow
              label="Stop Kontak 1 (Kipas)"
              detail={props.relayState.socket1 ? "Kipas menyala" : "Kipas mati"}
              enabled={props.relayState.socket1}
              onToggle={() => props.toggleRelay("socket1")}
              disabled={isSending}
            />
            <QuickControlRow
              label="Stop Kontak 2 (Charger)"
              detail={props.relayState.socket2 ? "Charger aktif" : "Charger mati"}
              enabled={props.relayState.socket2}
              onToggle={() => props.toggleRelay("socket2")}
              disabled={isSending}
            />
            <QuickControlRow
              label="Relay Bluetooth"
              detail={props.relayState.ampli ? "Bluetooth aktif" : "Bluetooth mati"}
              enabled={props.relayState.ampli}
              onToggle={() => props.toggleRelay("ampli")}
              disabled={isSending}
            />
            <QuickControlRow
              label="Buzzer"
              detail={props.buzzerEnabled ? "Buzzer ON" : "Buzzer OFF"}
              enabled={props.buzzerEnabled}
              onToggle={() => {
                const next = !props.buzzerEnabled;
                props.setBuzzerEnabled(next);
                props.sendDeviceCommand("buzzer.set", { state: next }, `Buzzer ${next ? "aktif" : "mati"}`);
              }}
              disabled={isSending}
            />
            <div className="relative flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-sm font-bold text-slate-900">Test DFPlayer</p>
                <p className="mt-1 text-xs text-slate-500">Putar track 0001 untuk pengujian cepat.</p>
              </div>
              <button
                className="mt-3 h-9 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                disabled={isSending}
                onClick={() => props.sendDeviceCommand("voice.play", { track: 1 }, "Test DFPlayer")}
                type="button"
              >
                {isSending ? "Mengirim..." : "Putar 0001.mp3"}
              </button>
            </div>
          </div>
        </Panel>
        <Panel title="Grafik Suhu Ruangan" subtitle="Visual monitoring khusus sensor.">
          <TemperatureChart value={props.visibleTempEstimate} series={props.tempHistory} />
        </Panel>
      </div>
      <Panel title="Kontrol Sensor" subtitle="Kontrol dipindah khusus ke halaman monitoring.">
        <div className="grid gap-3">
          <ControlRow label="Sensor Gas" detail="Aktifkan atau nonaktifkan sensor gas." enabled={props.gasEnabled} onToggle={props.toggleGas} />
          <ControlRow label="Sensor Suhu" detail="Kontrol pembacaan suhu dari ESP32." enabled={props.temperatureEnabled} onToggle={props.toggleTemperature} />
          <ControlRow label="Sensor PIR (Gerakan)" detail="Aktifkan atau nonaktifkan sensor gerak PIR." enabled={props.pirEnabled} onToggle={props.togglePir} />
          <ControlRow label="Sleep Mode" detail="Matikan LCD & relay jika tidak ada gerakan 1 jam." enabled={props.sleepModeEnabled} onToggle={props.toggleSleepMode} />
          <ControlRow
            label="Alarm Buzzer"
            detail="Peringatan suara lokal saat bahaya."
            enabled={props.buzzerEnabled}
            onToggle={() => {
              const next = !props.buzzerEnabled;
              props.setBuzzerEnabled(next);
              props.publish("smartbox/buzzer/set", { enabled: next, pin: boardPins.buzzer }, `Buzzer ${next ? "aktif" : "mati"}`);
            }}
          />
        </div>
      </Panel>
    </div>
  );
}

function DevicesPage(props: PageProps) {
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [testTrack, setTestTrack] = useState(1);
  const isSending = props.status === "sending";

  return (
    <div className="grid gap-6">
      {/* Description Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-6 text-white shadow-xl shadow-blue-100/40">
        <h2 className="text-2xl font-black">Devices Control</h2>
        <p className="mt-2 text-sm text-blue-100 font-medium leading-relaxed max-w-2xl">
          Kelola stop kontak, relay Bluetooth, alarm buzzer, dan uji track suara DFPlayer secara real-time.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Device Status Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50 flex flex-col justify-between h-full min-h-[220px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Status Perangkat</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black border ${
                props.deviceStatuses.esp32 
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                  : "bg-red-50 text-red-500 border-red-200"
              }`}>
                <span className={`h-2 w-2 rounded-full ${props.deviceStatuses.esp32 ? "bg-emerald-500 animate-pulse" : "bg-red-400"}`} />
                {props.deviceStatuses.esp32 ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <div className="mt-5 grid gap-2">
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                <span className="font-semibold text-slate-500">IP ESP32</span>
                <span className="font-mono font-bold text-slate-800">{props.deviceStatuses.ip || "-"}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                <span className="font-semibold text-slate-500">Kekuatan Sinyal (RSSI)</span>
                <span className="font-bold text-slate-800">{props.deviceStatuses.rssi ? `${props.deviceStatuses.rssi} dBm` : "-"}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-slate-500">Last Seen</span>
                <span className="font-bold text-slate-800">{props.deviceStatuses.lastSeen || "-"}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-1.5 flex-wrap">
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${props.deviceStatuses.rtc ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>RTC DS3231</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${props.deviceStatuses.lcd ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>LCD I2C</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${props.deviceStatuses.dfPlayer ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>DFPlayer</span>
          </div>
        </div>

        {/* Controls Relay Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50">
          <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-4">Kontrol Relay</h3>
          <div className="grid gap-4">
            {/* Stop Kontak 1 */}
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Stop Kontak 1 (Kipas)</p>
                  <p className="text-xs text-slate-500">Auto mati setelah 1 menit</p>
                </div>
                <Switch checked={props.relayState.socket1} disabled={isSending} onChange={() => props.toggleRelay("socket1")} />
              </div>
              {props.relayState.socket1 && props.relayAutoOffAt.socket1 && (
                <AutoOffCountdown deadline={props.relayAutoOffAt.socket1} />
              )}
            </div>
            
            {/* Stop Kontak 2 */}
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Stop Kontak 2 (Charger)</p>
                  <p className="text-xs text-slate-500">Auto mati setelah 1 menit</p>
                </div>
                <Switch checked={props.relayState.socket2} disabled={isSending} onChange={() => props.toggleRelay("socket2")} />
              </div>
              {props.relayState.socket2 && props.relayAutoOffAt.socket2 && (
                <AutoOffCountdown deadline={props.relayAutoOffAt.socket2} />
              )}
            </div>

            {/* Relay Bluetooth */}
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Relay Bluetooth (Smartbox Assistant)</p>
                  <p className="text-xs text-slate-500">
                    {props.relayState.ampli ? "Bluetooth Aktif" : "Bluetooth Mati"}
                  </p>
                </div>
                <Switch checked={props.relayState.ampli} disabled={isSending} onChange={() => props.toggleRelay("ampli")} />
              </div>
            </div>
          </div>
        </div>

        {/* Buzzer and DFPlayer Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-4">Buzzer & Test Suara</h3>
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-3 mb-4">
              <div>
                <p className="text-sm font-bold text-slate-900">Buzzer Alarm</p>
                <p className="text-xs text-slate-500">Bunyi Peringatan</p>
              </div>
              <Switch checked={props.buzzerEnabled} disabled={isSending} onChange={() => {
                const next = !props.buzzerEnabled;
                props.setBuzzerEnabled(next);
                props.sendDeviceCommand("buzzer.set", { state: next }, `Buzzer ${next ? "aktif" : "mati"}`);
              }} />
            </div>
          </div>
          <div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
              <p className="text-sm font-bold text-slate-900 mb-2">Test DFPlayer Suara</p>
              <div className="flex gap-2">
                <select 
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold outline-none flex-1 focus:ring-2 focus:ring-blue-500/20"
                  value={testTrack}
                  onChange={(e) => setTestTrack(Number(e.target.value))}
                  disabled={isPlayingTest || isSending}
                >
                  {audioTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.id.toString().padStart(4, "0")} - {track.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    setIsPlayingTest(true);
                    await props.sendDeviceCommand("voice.play", { track: testTrack }, "Play Suara", "Perintah suara dikirim", "Gagal mengirim perintah");
                    setIsPlayingTest(false);
                  }}
                  disabled={isPlayingTest || isSending}
                  className="h-9 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-95 disabled:bg-slate-400"
                  type="button"
                >
                  {isPlayingTest || isSending ? "Mengirim..." : "Play"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AutoOffCountdown({ deadline }: { deadline: number }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [deadline]);

  if (secondsLeft <= 0) return null;

  return (
    <div className="mt-1 border-t border-slate-100 pt-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600">
        Mati otomatis dalam {secondsLeft} detik
      </p>
    </div>
  );
}

function AiPage(props: PageProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel title="AI Assistant" subtitle={props.mqttOnline ? "Online dan siap memberi ringkasan." : "Menunggu broker MQTT."}>
        <div className="grid gap-4">
          <div className="rounded-3xl bg-slate-100 p-5 text-sm leading-7 text-slate-700">
            <p className="font-bold text-slate-950">Halo! Saya SmartBox Assistant.</p>
            <p className="mt-2">Kondisi ruangan saat ini {props.tempState.toLowerCase()}, gas {props.gasState.toLowerCase()}, MQTT {props.mqttOnline ? "terhubung" : "offline"}, dan relay aktif {props.relayActiveCount} dari 3.</p>
          </div>
          {["Bagaimana kondisi ruangan saat ini?", "Apakah ada potensi bahaya?", "Tampilkan riwayat suhu hari ini"].map((question) => (
            <button key={question} className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-left text-sm font-bold text-blue-600 transition hover:bg-blue-50" type="button">
              {question}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Voice Command" subtitle="Kontrol suara dan clap command.">
        <ControlRow
          label="Voice Command"
          detail="Tepuk 1 kali mati, 2 kali hidup."
          enabled={props.voiceMode}
          onToggle={() => {
            const next = !props.voiceMode;
            props.setVoiceMode(next);
            props.publish("smartbox/voice/mode", { enabled: next }, `Voice command ${next ? "aktif" : "mati"}`);
          }}
        />
      </Panel>
    </div>
  );
}

function AlarmsPage(props: PageProps) {
  const [sendingAlarmId, setSendingAlarmId] = useState<string | null>(null);
  const [savingPirGreeting, setSavingPirGreeting] = useState(false);
  const [localPirGreetingTrack, setLocalPirGreetingTrack] = useState(props.pirGreetingTrack || 10);
  const [localPirGreetingStart, setLocalPirGreetingStart] = useState(props.pirGreetingStart || "07:00");
  const [localPirGreetingEnd, setLocalPirGreetingEnd] = useState(props.pirGreetingEnd || "22:00");
  const [localPirGreetingCooldown, setLocalPirGreetingCooldown] = useState(props.pirGreetingCooldown || 10);
  const [localPirGreetingPlayMode, setLocalPirGreetingPlayMode] = useState(props.pirGreetingPlayMode || "cooldown");
  const [localPirGreetingDays, setLocalPirGreetingDays] = useState<string[]>(props.pirGreetingDays);

  const daysOfWeek = [
    { id: "monday", label: "Sen" },
    { id: "tuesday", label: "Sel" },
    { id: "wednesday", label: "Rab" },
    { id: "thursday", label: "Kam" },
    { id: "friday", label: "Jum" },
    { id: "saturday", label: "Sab" },
    { id: "sunday", label: "Min" },
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalPirGreetingTrack(props.pirGreetingTrack || 10);
      setLocalPirGreetingStart(props.pirGreetingStart || "07:00");
      setLocalPirGreetingEnd(props.pirGreetingEnd || "22:00");
      setLocalPirGreetingCooldown(props.pirGreetingCooldown || 10);
      setLocalPirGreetingPlayMode(props.pirGreetingPlayMode || "cooldown");
      setLocalPirGreetingDays(props.pirGreetingDays);
    }, 0);
    return () => clearTimeout(timer);
  }, [
    props.pirGreetingCooldown,
    props.pirGreetingDays,
    props.pirGreetingEnd,
    props.pirGreetingPlayMode,
    props.pirGreetingStart,
    props.pirGreetingTrack,
  ]);

  async function sendAlarm(alarm: Alarm) {
    setSendingAlarmId(alarm.id);
    
    try {
      const response = await fetch("/api/alarms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: alarm.id,
          label: alarm.label,
          time: alarm.time,
          greeting: alarm.greeting,
          dfTrack: alarm.track,
          enabled: alarm.enabled,
        }),
      });
      if (!response.ok) throw new Error("Alarm ditolak API");

      await props.sendDeviceCommand(
        "alarm.set",
        {
          id: alarm.id,
          time: alarm.time,
          track: alarm.track,
          enabled: alarm.enabled,
        },
        `Alarm ${alarm.label} ${alarm.time}`,
        "Alarm tersimpan dan tersinkron ke ESP32",
        "Alarm tersimpan, tetapi sinkronisasi MQTT gagal"
      );
    } catch (err) {
      console.error("Gagal menyimpan alarm ke database:", err);
      props.notify("Gagal menyimpan alarm jadwal.", "error");
    } finally {
      setSendingAlarmId(null);
    }
  }

  async function toggleAlarmEnabled(alarm: Alarm) {
    const next = !alarm.enabled;
    props.updateAlarm(alarm.id, "enabled", next);
    props.notify(`Alarm ${alarm.label} ${next ? "aktif" : "mati"}`, "info");

    try {
      const response = await fetch("/api/alarms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: alarm.id,
          label: alarm.label,
          time: alarm.time,
          greeting: alarm.greeting,
          dfTrack: alarm.track,
          enabled: next,
        }),
      });
      if (!response.ok) throw new Error("Alarm ditolak API");
      await props.sendDeviceCommand(
        "alarm.set",
        { id: alarm.id, time: alarm.time, track: alarm.track, enabled: next },
        `Alarm ${alarm.label} ${next ? "aktif" : "mati"}`
      );
    } catch (err) {
      console.error("Gagal memperbarui status alarm di database:", err);
      props.updateAlarm(alarm.id, "enabled", !next);
      props.notify("Gagal memperbarui status alarm.", "error");
    }
  }

  async function savePirGreeting(enabled = props.pirGreetingEnabled) {
    setSavingPirGreeting(true);
    await props.updatePirGreetingConfig(
      enabled,
      localPirGreetingTrack,
      localPirGreetingStart,
      localPirGreetingEnd,
      localPirGreetingCooldown,
      localPirGreetingPlayMode,
      localPirGreetingDays
    );
    setSavingPirGreeting(false);
  }

  return (
    <div className="grid gap-5">
      <Panel title="Alarm Jadwal DFPlayer" subtitle="Alarm suara berjalan dengan timezone Asia/Jakarta dan tidak memuat jadwal stop kontak.">
        <div className="grid gap-3">
          {props.alarms.map((alarm) => (
            <div key={alarm.id} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100 xl:grid-cols-[auto_110px_minmax(180px,1fr)_260px_auto_auto] xl:items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <input className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" type="time" value={alarm.time} onChange={(event) => props.updateAlarm(alarm.id, "time", event.target.value)} />
              <input className="h-12 min-w-0 rounded-2xl border border-slate-200 px-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="Pesan pengingat..." value={alarm.greeting} onChange={(event) => props.updateAlarm(alarm.id, "greeting", event.target.value)} />
              <select className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" value={alarm.track} onChange={(event) => props.updateAlarm(alarm.id, "track", Number(event.target.value))}>
                {audioTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.id.toString().padStart(3, "0")} - {track.name.replace(/_/g, " ").replace(".mp3", "")}
                  </option>
                ))}
              </select>
              <div className="flex justify-end xl:justify-center">
                <Switch checked={alarm.enabled} onChange={() => toggleAlarmEnabled(alarm)} />
              </div>
              <button
                className="h-12 rounded-2xl bg-blue-600 px-6 text-sm font-black text-white transition hover:bg-blue-700 shadow-md shadow-blue-100 disabled:bg-slate-400"
                disabled={sendingAlarmId === alarm.id}
                onClick={() => sendAlarm(alarm)}
                type="button"
              >
                {sendingAlarmId === alarm.id ? "Mengirim" : "Kirim"}
              </button>
            </div>
          ))}
        </div>
      </Panel>


      <Panel title="Greeting Wakeup PIR" subtitle="PIR hanya mendeteksi gerakan; track 0010-0012 dipilih oleh pengguna, bukan klasifikasi gesture otomatis.">
        <div className="grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1">
              <span className="text-xs font-bold text-slate-500">Aktifkan Greeting PIR</span>
              <div className="flex h-11 items-center">
                <Switch checked={props.pirGreetingEnabled} disabled={savingPirGreeting} onChange={() => savePirGreeting(!props.pirGreetingEnabled)} />
              </div>
            </div>

            <div className="grid gap-1">
              <span className="text-xs font-bold text-slate-500">Track DFPlayer</span>
              <select 
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400"
                value={localPirGreetingTrack} 
                onChange={(event) => setLocalPirGreetingTrack(Number(event.target.value))}
              >
                {audioTracks.filter((track) => track.id >= 10 && track.id <= 12).map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name} - {track.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1">
              <span className="text-xs font-bold text-slate-500">Jam Mulai Sapa</span>
              <input 
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                type="time" 
                value={localPirGreetingStart} 
                onChange={(event) => setLocalPirGreetingStart(event.target.value)} 
              />
            </div>

            <div className="grid gap-1">
              <span className="text-xs font-bold text-slate-500">Jam Selesai Sapa</span>
              <input 
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                type="time" 
                value={localPirGreetingEnd} 
                onChange={(event) => setLocalPirGreetingEnd(event.target.value)} 
              />
            </div>

            <div className="grid gap-1">
              <span className="text-xs font-bold text-slate-500">Cooldown (detik)</span>
              <input
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                min={10}
                onChange={(event) => setLocalPirGreetingCooldown(Math.max(10, Number(event.target.value)))}
                type="number"
                value={localPirGreetingCooldown}
              />
            </div>

            <div className="grid gap-1">
              <span className="text-xs font-bold text-slate-500">Mode Putar</span>
              <select
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400"
                onChange={(event) => setLocalPirGreetingPlayMode(event.target.value)}
                value={localPirGreetingPlayMode}
              >
                <option value="cooldown">Cooldown</option>
                <option value="once_schedule">Sekali per jadwal</option>
                <option value="once_motion">Sekali per gerakan</option>
              </select>
            </div>
          </div>

          <div className="grid gap-2 border-t border-slate-200 pt-4">
            <span className="text-xs font-bold text-slate-500">Hari Aktif</span>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map((day) => {
                const active = localPirGreetingDays.includes(day.id);
                return (
                  <button
                    className={`h-9 rounded-xl px-3 text-xs font-bold transition ${
                      active ? "bg-blue-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
                    }`}
                    key={day.id}
                    onClick={() => setLocalPirGreetingDays((current) =>
                      current.includes(day.id) ? current.filter((item) => item !== day.id) : [...current, day.id]
                    )}
                    type="button"
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold text-slate-500">Trigger berhenti setelah jam selesai; audio yang sedang berjalan tidak dihentikan paksa.</span>
            <button
              className="h-11 rounded-xl bg-blue-600 px-6 text-sm font-black text-white transition hover:bg-blue-700 disabled:bg-slate-400"
              disabled={savingPirGreeting || localPirGreetingDays.length === 0}
              onClick={() => savePirGreeting()}
              type="button"
            >
              {savingPirGreeting ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="DFPlayer Audio Map" subtitle="Pilih file MP3 ini langsung pada setiap baris alarm jadwal.">
        <AudioMap />
      </Panel>
    </div>
  );
}

function HistoryPage(props: PageProps) {
  return (
    <Panel title="Riwayat Aktivitas (Neon DB)" subtitle="Semua event log tersinkronisasi dari database PostgreSQL Neon.">
      <div className="grid gap-3">
        {props.events.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500 py-4 text-center">Belum ada riwayat tercatat.</p>
        ) : (
          props.events.map((evt) => (
            <div key={evt.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-white border border-slate-200 p-4 text-sm shadow-sm">
              <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold mr-2 ${
                  evt.level === "WARNING" || evt.level === "CRITICAL" ? "bg-red-50 text-red-600 border border-red-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                }`}>
                  {evt.level}
                </span>
                <span className="font-bold text-slate-900">{evt.type}</span>
                <p className="mt-1 text-slate-600">{evt.message}</p>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {new Date(evt.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function SettingsPage(props: PageProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Pengaturan MQTT" subtitle="Status broker dan topic utama.">
        <div className="grid gap-3">
          <SettingRow label="Broker TCP" value={MQTT_BROKER_LABEL} />
          <SettingRow label="Broker WebSocket" value={DEFAULT_MQTT_WS_URL} />
          <SettingRow label="Telemetry Topic" value="smartbox/telemetry" />
          <SettingRow label="Status" value={props.mqttOnline ? "Terhubung" : "Offline"} />
        </div>
      </Panel>
      <Panel title="Ambang Sensor" subtitle="Nilai acuan peringatan di dashboard.">
        <div className="grid gap-3">
          <SettingRow label="Gas MQ-2" value="1800 raw" />
          <SettingRow label="Suhu Peringatan" value={`${TEMP_WARNING_C} C`} />
          <SettingRow label="Timer LED Alarm" value={`${props.boardLedScheduleEnabled ? "Aktif" : "Mati"} - ${BOARD_LED_DURATION_SECONDS} detik`} />
          <SettingRow label="Buzzer" value={props.buzzerEnabled ? "Aktif" : "Mati"} />
          <SettingRow label="Alarm Aktif" value={`${props.activeAlarms} jadwal`} />
        </div>
      </Panel>
    </div>
  );
}

function StatsGrid(props: PageProps) {
  const hasTemp = props.deviceStatuses.esp32 && props.deviceStatuses.rtc && props.visibleTempEstimate !== 0;
  const hasGas = props.deviceStatuses.esp32;

  const gasAccent = !hasGas 
    ? "cyan" 
    : (props.gasState === "Bahaya" 
      ? "red" 
      : (props.gasState === "Waspada" 
        ? "orange" 
        : "emerald"));

  return (
    <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard 
        label="Suhu Ruangan" 
        value={hasTemp ? `${props.visibleTempEstimate.toFixed(1)}°C` : "Menunggu data..."} 
        detail={hasTemp ? "Update realtime" : "DS3231 Tidak Terhubung"} 
        accent="blue" 
      />
      <StatCard 
        label="Status Gas/Asap" 
        value={hasGas ? (props.gasState === "Aman" ? `Aman (${props.gasPpm} PPM)` : `${props.gasState} (${props.gasPpm} PPM)`) : "Tidak Terhubung"} 
        detail={hasGas ? `Sensor RAW: ${props.visibleGasEstimate}` : "ESP32 Offline"} 
        accent={gasAccent} 
      />
      <StatCard 
        label="Gerakan (PIR)" 
        value={hasGas ? (props.pirDetected ? "Gerakan Terdeteksi" : "Tidak Ada Gerakan") : "Tidak Terhubung"} 
        detail={hasGas ? (props.pirDetected ? "Terdeteksi gerakan" : "Kondisi aman") : "ESP32 Offline"} 
        accent={props.pirDetected ? "red" : "emerald"} 
      />
      <StatCard label="Koneksi Perangkat" value={props.deviceStatuses.esp32 ? "Terhubung" : "Tidak Terhubung"} detail={props.deviceStatuses.esp32 ? `Relay aktif: ${props.relayActiveCount} / 3` : "Perangkat offline"} accent="indigo" />
    </section>
  );
}

function RightRail(props: PageProps) {
  return (
    <aside className="grid content-start gap-5">
      <Panel title="AI Assistant" subtitle={props.mqttOnline ? "Online" : "Menunggu broker"}>
        <div className="rounded-2xl bg-slate-100 p-4 text-sm leading-6 text-slate-700">
          <p className="font-semibold text-slate-900">Halo! Saya SmartBox Assistant.</p>
          <p className="mt-1">Kondisi ruangan saat ini {props.tempState.toLowerCase()}, gas {props.gasState.toLowerCase()}, dan MQTT {props.mqttOnline ? "terhubung" : "offline"}.</p>
        </div>
      </Panel>
      <Panel title="Aktivitas Terbaru (MQTT/DB)" subtitle="Log event realtime.">
        <div className="grid gap-3">
          {props.events.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400 py-2 text-center">Belum ada aktivitas.</p>
          ) : (
            props.events.slice(0, 5).map((evt) => (
              <Activity 
                key={evt.id} 
                label={`[${evt.level}] ${evt.message || evt.type}`} 
                time={new Date(evt.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} 
              />
            ))
          )}
        </div>
      </Panel>
    </aside>
  );
}

function parseTelemetry(message: string): TelemetryPayload {
  try {
    const parsed = JSON.parse(message) as unknown;
    const payload = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
    if (!isRecord(payload)) return {};
    return {
      gasEnabled: readBoolean(payload.gasSensorEnabled) ?? readBoolean(payload.gasEnabled),
      gasRaw: readNumber(payload.gasRaw),
      tempEnabled: readBoolean(payload.rtcReady) ?? readBoolean(payload.tempEnabled),
      temperatureC: readFirstNumber(payload, ["temperature", "temperatureC", "tempC", "temp", "suhuC", "suhu"]),
      flameDetected: readBoolean(payload.flameDetected),
      pirDetected: readBoolean(payload.pirDetected) ?? readBoolean(payload.motionDetected) ?? readBoolean(payload.motion),
      obstacleNear: readBoolean(payload.obstacleNear),
      rtcReady: readBoolean(payload.rtcReady),
      lcdReady: readBoolean(payload.lcdReady),
      dfPlayerReady: readBoolean(payload.dfPlayerReady),
      pirEnabled: readBoolean(payload.pirEnabled),
      sleepModeEnabled: readBoolean(payload.sleepModeEnabled),
      pirGreetingEnabled: readBoolean(payload.pirGreetingEnabled),
      pirGreetingTrack: readNumber(payload.pirGreetingTrack),
      pirGreetingStart: typeof payload.pirGreetingStart === "string" ? payload.pirGreetingStart : undefined,
      pirGreetingEnd: typeof payload.pirGreetingEnd === "string" ? payload.pirGreetingEnd : undefined,
      dfTrackCount: readNumber(payload.dfTrackCount),
      relaySchedules: Array.isArray(payload.relaySchedules) ? payload.relaySchedules : undefined,
      relay1: readBoolean(payload.relay1),
      relay2: readBoolean(payload.relay2),
      relay1AutoOffRemaining: readNumber(payload.relay1AutoOffRemaining),
      relay2AutoOffRemaining: readNumber(payload.relay2AutoOffRemaining),
      bluetoothRelay: readBoolean(payload.bluetoothRelay) ?? readBoolean(payload.ampRelay) ?? readBoolean(payload.bluetoothAudio),
      buzzer: readBoolean(payload.buzzer),
      gasLevel: typeof payload.gasLevel === "string" ? payload.gasLevel : undefined,
      gasDetected: readBoolean(payload.gasDetected),
      online: readBoolean(payload.online),
      ip: typeof payload.ip === "string" ? payload.ip : undefined,
      rssi: readNumber(payload.rssi),
    };
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }
  return undefined;
}

function readFirstNumber(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readNumber(payload[key]);
    if (typeof value === "number") return value;
  }
  return undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function roundTemperature(value: number) {
  return Math.round(value * 10) / 10;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
      <div className="mb-4">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function StatCard({ 
  label, 
  value, 
  detail, 
  accent 
}: { 
  label: string; 
  value: string; 
  detail: string; 
  accent: "blue" | "cyan" | "orange" | "indigo" | "violet" | "red" | "emerald";
}) {
  const accentClass = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    cyan: "text-cyan-600 bg-cyan-50 border-cyan-100",
    orange: "text-orange-600 bg-orange-50 border-orange-100",
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    violet: "text-violet-600 bg-violet-50 border-violet-100",
    red: "text-red-600 bg-red-50 border-red-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
  };

  const cardBorderClass = {
    blue: "border-slate-200 hover:border-slate-300 bg-white",
    cyan: "border-slate-200 hover:border-slate-300 bg-white",
    orange: "border-slate-200 hover:border-slate-300 bg-white",
    indigo: "border-slate-200 hover:border-slate-300 bg-white",
    violet: "border-slate-200 hover:border-slate-300 bg-white",
    emerald: "border-emerald-200 bg-emerald-50/20 hover:border-emerald-300",
    orange_warn: "border-orange-200 bg-orange-50/20 hover:border-orange-300",
    red: "border-red-200 bg-red-50/40 hover:border-red-300 animate-pulse",
  };

  // Map warning classes to specific accents
  const resolvedCardStyle = cardBorderClass[accent] || "border-slate-200 hover:border-slate-300 bg-white";

  const dotColor = {
    blue: "bg-blue-500",
    cyan: "bg-cyan-500",
    orange: "bg-orange-500",
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    red: "bg-red-500",
    emerald: "bg-emerald-500",
  };

  const icons = {
    blue: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v10.5a4.5 4.5 0 11-4 0V4a2 2 0 114 0z" />
      </svg>
    ),
    cyan: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 8h12M3 16h15" />
      </svg>
    ),
    orange: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.585A8 8 0 1120 12c0 2.13-.86 4.03-2.243 5.402z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    violet: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a1 1 0 100-2 1 1 0 000 2zM8 9h8a1.5 1.5 0 011.5 1.5v6M9 22V15m6 7v-7M12 9v6" />
      </svg>
    ),
    indigo: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    red: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    emerald: (
      <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <article className={`relative overflow-hidden rounded-3xl border p-6 shadow-sm shadow-slate-100/50 transition-all duration-200 hover:shadow-md flex flex-col justify-between h-full min-h-[160px] ${resolvedCardStyle}`}>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{label}</span>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${accentClass[accent]}`}>
          {icons[accent]}
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-2xl font-black tracking-tight text-slate-900 break-all">{value}</h3>
        <p className="mt-2 text-xs font-semibold text-slate-500 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor[accent] || "bg-emerald-500"} animate-pulse`}></span>
          {detail}
        </p>
      </div>
    </article>
  );
}

function TemperatureChart({ value, series = temperatureSeries }: { value: number; series?: number[] }) {
  const points = series.map((item, index) => `${30 + index * 32},${210 - (item - 24) * 18}`).join(" ");
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-white to-blue-50 p-2">
      <svg className="h-[270px] w-full" viewBox="0 0 620 270" role="img" aria-label="Grafik suhu ruangan">
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="30" x2="590" y1={50 + line * 40} y2={50 + line * 40} stroke="#dbeafe" strokeDasharray="5 5" />)}
        <polyline points={`30,230 ${points} 574,230`} fill="rgba(37,99,235,0.10)" stroke="none" />
        <polyline points={points} fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        {series.map((item, index) => <circle key={`${item}-${index}`} cx={30 + index * 32} cy={210 - (item - 24) * 18} r="4" fill="#2563eb" />)}
        <g>
          <rect x="410" y="70" width="126" height="54" rx="10" fill="#0f172a" />
          <text x="426" y="94" fill="white" fontSize="17" fontWeight="700">{value.toFixed(1)} C</text>
          <text x="426" y="114" fill="#cbd5e1" fontSize="12">Saat ini</text>
        </g>
      </svg>
    </div>
  );
}

function ReadingRow({ label, value, status, percent, tone }: { label: string; value: string; status: string; percent: number; tone: "blue" | "emerald" | "orange" }) {
  const color = { blue: "bg-blue-600", emerald: "bg-emerald-500", orange: "bg-orange-500" };
  const warning = status === "Peringatan" || status === "Waspada" || status === "Panas" || status === "Bahaya" || status === "Terdeteksi" || status === "Ada Gerakan" || status === "Gerakan Terdeteksi" || status === "Dekat";
  const offline = status === "Offline" || status === "Tidak Terhubung" || status.includes("Menunggu");
  const badgeClass = offline
    ? "bg-slate-100 text-slate-500"
    : (warning ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100/50 flex flex-col justify-between h-full min-h-[140px]">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <div className="mt-3 flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-2xl font-black text-slate-950 tracking-tight break-all">{value}</p>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClass} shrink-0`}>
            {status}
          </span>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all duration-500 ${offline ? "bg-slate-200" : (warning ? "bg-red-500" : color[tone])}`} style={{ width: `${offline ? 0 : Math.min(percent, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function WarningCard({
  title,
  value,
  threshold,
  active,
  message,
}: {
  title: string;
  value: string;
  threshold: string;
  active: boolean;
  message: string;
}) {
  return (
    <article className={`rounded-2xl border p-4 ${active ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-black ${active ? "text-red-700" : "text-slate-900"}`}>{title}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ambang: {threshold}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-red-600 text-white" : "bg-emerald-50 text-emerald-600"}`}>
          {active ? "Peringatan" : "Normal"}
        </span>
      </div>
      <div className="mt-4 grid gap-1">
        <p className="text-xs font-bold text-slate-500">Angka estimasi saat ini</p>
        <p className={`text-3xl font-black ${active ? "text-red-700" : "text-slate-950"}`}>{value}</p>
      </div>
      <p className={`mt-3 text-sm leading-6 ${active ? "text-red-700" : "text-slate-600"}`}>{message}</p>
    </article>
  );
}

function ControlRow({ label, detail, enabled, onToggle }: { label: string; detail: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-3">
      <div>
        <p className="text-sm font-bold text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
      <Switch checked={enabled} onChange={onToggle} />
    </div>
  );
}

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      aria-pressed={checked}
      className={`relative h-8 w-16 rounded-full p-1 transition ${checked ? "bg-blue-600" : "bg-slate-300"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      type="button"
    >
      <span className={`block h-6 w-6 rounded-full bg-white shadow transition ${checked ? "translate-x-8" : "translate-x-0"}`} />
      <span className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-black text-white ${checked ? "left-3" : "right-2"}`}>{checked ? "ON" : "OFF"}</span>
    </button>
  );
}

function AudioMap() {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {audioTracks.map((track) => (
        <div key={track.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-semibold text-slate-800">{track.name}</span>
          <span className="text-right text-slate-500">{track.use}</span>
        </div>
      ))}
    </div>
  );
}

function Activity({ label, time }: { label: string; time: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
      <span className="min-w-0 truncate font-semibold text-slate-700">{label}</span>
      <span className="text-xs font-bold text-slate-400">{time}</span>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <span className="font-bold text-slate-600">{label}</span>
      <span className="min-w-0 break-words font-mono text-xs font-bold text-slate-900">{value}</span>
    </div>
  );
}
