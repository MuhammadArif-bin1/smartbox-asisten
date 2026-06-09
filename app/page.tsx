"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

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
};

const views: Array<{ id: ViewId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "monitoring", label: "Monitoring" },
  { id: "devices", label: "Devices" },
  { id: "ai", label: "AI Assistant" },
  { id: "alarms", label: "Alarm Jadwal" },
  { id: "history", label: "Riwayat" },
  { id: "settings", label: "Pengaturan" },
];

const initialAlarms: Alarm[] = [
  { id: "morning", label: "Pagi", time: "07:00", greeting: "Pengingat aktivitas pagi", track: 1, enabled: true },
  { id: "noon", label: "Siang", time: "12:30", greeting: "Pengingat istirahat siang", track: 2, enabled: true },
  { id: "evening", label: "Malam", time: "19:30", greeting: "Pengingat istirahat malam", track: 3, enabled: true },
];

const audioTracks = [
  { id: 1, name: "001_selamat_pagi.mp3", use: "Alarm pagi" },
  { id: 2, name: "002_selamat_siang.mp3", use: "Alarm siang" },
  { id: 3, name: "003_selamat_sore.mp3", use: "Alarm sore" },
  { id: 4, name: "004_asap_terdeteksi.mp3", use: "Sensor MQ-2" },
  { id: 5, name: "005_suhu_panas.mp3", use: "Sensor suhu" },
  { id: 6, name: "006_sistem_hidup.mp3", use: "Voice command" },
  { id: 7, name: "007_sistem_mati.mp3", use: "Voice command" },
];

type BoardProfile = "ESP32_S3" | "ESP32_WROOM";

const selectedBoardProfile: BoardProfile = process.env.NEXT_PUBLIC_BOARD_PROFILE === "ESP32_WROOM" ? "ESP32_WROOM" : "ESP32_S3";
const boardPinProfiles = {
  ESP32_S3: {
    label: "ESP32-S3",
    boardLed: "GPIO 48",
    gas: "GPIO 1",
    buzzer: "GPIO 2",
    relaySocket1: "GPIO 35",
    relaySocket2: "GPIO 36",
    relayAmpli: "GPIO 37",
    groups: [
      ["DFPlayer TX/RX", "GPIO 16 / 17"],
      ["PT8211 BCK/DIN/WS", "GPIO 12 / 13 / 14"],
      ["Mic INMP441", "GPIO 5 / 4 / 6"],
      ["RTC + LCD I2C", "GPIO 8 / 9"],
      ["Push button", "GPIO 10 / 11 / 15"],
      ["PIR + IR", "GPIO 41 / 42"],
      ["Buzzer + MQ-2", "GPIO 2 / 1"],
      ["Relay", "GPIO 35 / 36 / 37"],
      ["LED 12V PWM", "GPIO 18"],
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

const pinGroups = boardPins.groups;

const temperatureSeries = [28, 28.6, 29.1, 30, 30.5, 30.2, 29.4, 28.8, 28.2, 27.6, 26.8, 25.8, 25.4, 25.6, 26.4, 27.2, 27.8, 27.2];
const TEMP_WARNING_C = 37;
const GAS_WARNING_RAW = 1800;
const BOARD_LED_PIN = boardPins.boardLed;
const BOARD_LED_DURATION_SECONDS = 10;
const DEFAULT_MQTT_WS_URL = "ws://192.168.1.12:9001";
const MQTT_BROKER_LABEL = "mqtt://192.168.1.12:1883";
const DASHBOARD_PASSWORD = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || "smartbox123";

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

export default function Home() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [alarms, setAlarms] = useState(initialAlarms);
  const [gasEnabled, setGasEnabled] = useState(true);
  const [temperatureEnabled, setTemperatureEnabled] = useState(true);
  const [gasEstimate, setGasEstimate] = useState(0);
  const [tempEstimate, setTempEstimate] = useState(0);
  const [telemetrySource, setTelemetrySource] = useState("Offline");
  const [mqttRealtime, setMqttRealtime] = useState<"connecting" | "online" | "offline">("connecting");
  const [mqttApiOnline, setMqttApiOnline] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [buzzerEnabled, setBuzzerEnabled] = useState(false);
  const [boardLedScheduleEnabled, setBoardLedScheduleEnabled] = useState(true);
  const [relayState, setRelayState] = useState<Record<RelayId, boolean>>({ socket1: true, socket2: false, ampli: true });
  const [status, setStatus] = useState<CommandStatus>("idle");
  const [lastCommand, setLastCommand] = useState("Belum ada command dikirim");
  const [toast, setToast] = useState<Toast | null>(null);
  const [pirEnabled, setPirEnabled] = useState(true);
  const [sleepModeEnabled, setSleepModeEnabled] = useState(false);
  const [pirGreetingEnabled, setPirGreetingEnabled] = useState(false);
  const [pirGreetingTrack, setPirGreetingTrack] = useState(1);
  const [pirGreetingStart, setPirGreetingStart] = useState("07:00");
  const [pirGreetingEnd, setPirGreetingEnd] = useState("22:00");
  const [dfTrackCount, setDfTrackCount] = useState(7);
  const [relaySchedules, setRelaySchedules] = useState<Array<{ id: string; relay: number; enabled: boolean; timeRange: string }>>([]);
  const [deviceStatus, setDeviceStatus] = useState({
    esp32: false,
    rtc: false,
    lcd: false,
    dfPlayer: false,
  });
  const [lastTelemetryTime, setLastTelemetryTime] = useState<number>(0);
  const [tempHistory, setTempHistory] = useState(temperatureSeries);
  const [flameDetected, setFlameDetected] = useState(false);
  const [pirDetected, setPirDetected] = useState(false);
  const [obstacleNear, setObstacleNear] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const activeAlarms = useMemo(() => alarms.filter((alarm) => alarm.enabled).length, [alarms]);

  useEffect(() => {
    setIsAuthenticated(false);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    let client: import("mqtt").MqttClient | undefined;
    let cancelled = false;
    const wsUrl = process.env.NEXT_PUBLIC_MQTT_WS_URL || DEFAULT_MQTT_WS_URL;

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
          client?.subscribe("smartbox/telemetry");
          client?.subscribe("smartbox/status");
        });

        client.on("message", (topic, payload) => {
          if (topic === "smartbox/status") {
            try {
              const data = JSON.parse(payload.toString()) as { online?: boolean };
              const isOnline = data.online === true;
              setDeviceStatus((current) => ({
                ...current,
                esp32: isOnline,
                rtc: isOnline ? current.rtc : false,
                lcd: isOnline ? current.lcd : false,
                dfPlayer: isOnline ? current.dfPlayer : false,
              }));
              if (!isOnline) {
                setTelemetrySource("Offline");
              }
            } catch (e) {
              console.error(e);
            }
          } else if (topic === "smartbox/telemetry") {
            const telemetry = parseTelemetry(payload.toString());
            setLastTelemetryTime(Date.now());
            setTelemetrySource("ESP32 telemetry");

            setDeviceStatus((current) => ({
              ...current,
              esp32: true,
              rtc: typeof telemetry.rtcReady === "boolean" ? telemetry.rtcReady : current.rtc,
              lcd: typeof telemetry.lcdReady === "boolean" ? telemetry.lcdReady : current.lcd,
              dfPlayer: typeof telemetry.dfPlayerReady === "boolean" ? telemetry.dfPlayerReady : current.dfPlayer,
            }));

            if (typeof telemetry.gasEnabled === "boolean") setGasEnabled(telemetry.gasEnabled);
            if (typeof telemetry.tempEnabled === "boolean") setTemperatureEnabled(telemetry.tempEnabled);
            if (typeof telemetry.gasRaw === "number") setGasEstimate(Math.max(0, Math.min(4095, Math.round(telemetry.gasRaw))));
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
            if (Array.isArray(telemetry.relaySchedules)) setRelaySchedules(telemetry.relaySchedules);
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
    if (telemetrySource !== "ESP32 telemetry") return;

    const checkTimeout = setInterval(() => {
      const now = Date.now();
      if (lastTelemetryTime > 0 && now - lastTelemetryTime > 10000) {
        setTelemetrySource("Offline");
        setDeviceStatus({
          esp32: false,
          rtc: false,
          lcd: false,
          dfPlayer: false,
        });
      }
    }, 2000);

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
  const gasWarning = hasGasSensor && gasEnabled && visibleGasEstimate >= GAS_WARNING_RAW;
  const tempWarning = hasTempSensor && temperatureEnabled && visibleTempEstimate > TEMP_WARNING_C;
  const gasState = !hasGasSensor ? "Tidak Terhubung" : (gasEnabled ? (gasWarning ? "Peringatan" : "Aman") : "Nonaktif");
  const tempState = !hasTempSensor ? "Tidak Terhubung" : (temperatureEnabled ? (tempWarning ? "Peringatan" : "Aman") : "Nonaktif");
  const mqttOnline = mqttRealtime === "online" || mqttApiOnline;
  const relayActiveCount = relayControls.filter((relay) => relayState[relay.id]).length;

  // Load and save relay schedules to localStorage when offline
  useEffect(() => {
    if (!isAuthenticated) return;
    const savedSchedules = window.localStorage.getItem("smartbox-relay-schedules");
    if (savedSchedules) {
      try {
        setRelaySchedules(JSON.parse(savedSchedules));
      } catch (e) {
        console.error(e);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    window.localStorage.setItem("smartbox-relay-schedules", JSON.stringify(relaySchedules));
  }, [isAuthenticated, relaySchedules]);

  // Fetch alarms from Neon DB via Prisma on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadAlarms() {
      try {
        const response = await fetch("/api/alarms");
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const mapped = data.map((item: any) => ({
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

  // Fetch telemetry history from Neon DB on mount and poll every 8 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;

    async function loadTelemetryHistory() {
      try {
        const response = await fetch("/api/telemetry");
        if (response.ok && active) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const history = data.map((item: any) => item.temperatureC || 28);
            setTempHistory(history);
            
            const latest = data[data.length - 1];
            if (latest) {
              if (typeof latest.temperatureC === "number") setTempEstimate(latest.temperatureC);
              if (typeof latest.gasRaw === "number") setGasEstimate(latest.gasRaw);
              if (typeof latest.gasEnabled === "boolean") setGasEnabled(latest.gasEnabled);
              if (typeof latest.tempEnabled === "boolean") setTemperatureEnabled(latest.tempEnabled);
              if (typeof latest.flameDetected === "boolean") setFlameDetected(latest.flameDetected);
              if (typeof latest.pirDetected === "boolean") setPirDetected(latest.pirDetected);
              if (typeof latest.obstacleNear === "boolean") setObstacleNear(latest.obstacleNear);
              
              const lastTime = new Date(latest.createdAt).getTime();
              const now = Date.now();
              // If the database record is newer than 90 seconds, we count the device as active
              const isRecent = (now - lastTime) < 90000;
              
              if (isRecent) {
                setTelemetrySource((prev) => {
                  if (prev !== "ESP32 telemetry") {
                    return "Neon DB Sync";
                  }
                  return prev;
                });
                setDeviceStatus((current) => {
                  if (!current.esp32) {
                    return {
                      ...current,
                      esp32: true,
                      rtc: latest.tempEnabled ?? true,
                      lcd: true,
                      dfPlayer: true,
                    };
                  }
                  return current;
                });
              } else {
                setTelemetrySource((prev) => {
                  if (prev === "Neon DB Sync") {
                    return "Offline";
                  }
                  return prev;
                });
                setDeviceStatus((current) => {
                  if (current.esp32 && telemetrySource === "Neon DB Sync") {
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
      } catch (err) {
        console.error("Gagal memuat riwayat telemetry:", err);
      }
    }

    loadTelemetryHistory();
    const interval = setInterval(loadTelemetryHistory, 8000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, telemetrySource]);

  // Web Audio API browser warning sound
  useEffect(() => {
    if (!isAuthenticated) return;
    const isWarning = gasWarning || tempWarning;
    if (!isWarning) return;

    let audioCtx: AudioContext | null = null;
    let intervalId: number | null = null;

    function playBeep() {
      try {
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
    setTempHistory((current) => [...current.slice(1), visibleTempEstimate]);
  }, [isAuthenticated, telemetrySource, temperatureEnabled, visibleTempEstimate]);

  function notify(message: string, tone: Toast["tone"] = "info") {
    setToast({ id: Date.now(), message, tone });
  }

  async function publish(topic: string, payload: Record<string, unknown>, label: string) {
    setStatus("sending");
    setLastCommand(label);
    try {
      await sendMqttCommand(topic, payload);
      setStatus("sent");
      notify(`${label} berhasil dikirim`, "success");
      return true;
    } catch {
      setStatus("error");
      notify(`${label} gagal dikirim. Periksa koneksi MQTT.`, "error");
      return false;
    }
  }

  function updateAlarm(id: string, field: keyof Alarm, value: string | number | boolean) {
    setAlarms((current) => current.map((alarm) => alarm.id === id ? { ...alarm, [field]: value } : alarm));
  }

  function toggleGas() {
    const next = !gasEnabled;
    setGasEnabled(next);
    if (next && gasEstimate === 0) setGasEstimate(720);
    publish("smartbox/sensor/gas", { enabled: next, pin: boardPins.gas, estimateRaw: next ? gasEstimate : 0, threshold: GAS_WARNING_RAW }, `Sensor gas ${next ? "aktif" : "mati"}`);
  }

  function toggleTemperature() {
    const next = !temperatureEnabled;
    setTemperatureEnabled(next);
    if (next && tempEstimate === 0) setTempEstimate(37);
    publish("smartbox/sensor/temperature", { enabled: next, estimateC: next ? tempEstimate : 0, thresholdC: TEMP_WARNING_C }, `Sensor suhu ${next ? "aktif" : "mati"}`);
  }

  function toggleRelay(relayId: RelayId) {
    const relay = relayControls.find((item) => item.id === relayId);
    const next = !relayState[relayId];
    setRelayState((current) => ({ ...current, [relayId]: next }));
    publish("smartbox/relay/set", { relay: relay?.mqttKey ?? relayId, enabled: next, pin: relay?.pin }, `${relay?.label ?? relayId} ${next ? "aktif" : "mati"}`);
  }

  function togglePir() {
    const next = !pirEnabled;
    setPirEnabled(next);
    const cmdTopic = `smartbox/${process.env.NEXT_PUBLIC_DEVICE_ID || 'smartbox-001'}/cmd`;
    publish(cmdTopic, { type: "pirSensor.set", payload: { enabled: next } }, `Sensor PIR ${next ? "aktif" : "mati"}`);
  }

  function toggleSleepMode() {
    const next = !sleepModeEnabled;
    setSleepModeEnabled(next);
    const cmdTopic = `smartbox/${process.env.NEXT_PUBLIC_DEVICE_ID || 'smartbox-001'}/cmd`;
    publish(cmdTopic, { type: "sleepMode.set", payload: { enabled: next } }, `Sleep Mode ${next ? "aktif" : "mati"}`);
  }

  function updatePirGreetingConfig(enabled: boolean, track: number, start: string, end: string) {
    setPirGreetingEnabled(enabled);
    setPirGreetingTrack(track);
    setPirGreetingStart(start);
    setPirGreetingEnd(end);
    const cmdTopic = `smartbox/${process.env.NEXT_PUBLIC_DEVICE_ID || 'smartbox-001'}/cmd`;
    publish(cmdTopic, {
      type: "pirGreeting.set",
      payload: { enabled, track, start, end }
    }, "Update PIR Greeting");
  }

  function saveRelaySchedule(sch: { id: string; relay: number; start: string; end: string; enabled: boolean }) {
    setRelaySchedules((current) => {
      const timeRange = `${sch.start}-${sch.end}`;
      const existing = current.find((item) => item.id === sch.id);
      if (existing) {
        return current.map((item) =>
          item.id === sch.id ? { ...item, relay: sch.relay, enabled: sch.enabled, timeRange } : item
        );
      }
      return [...current, { id: sch.id, relay: sch.relay, enabled: sch.enabled, timeRange }];
    });

    const cmdTopic = `smartbox/${process.env.NEXT_PUBLIC_DEVICE_ID || 'smartbox-001'}/cmd`;
    publish(cmdTopic, {
      type: "relaySchedule.set",
      payload: { id: sch.id, relay: sch.relay, start: sch.start, end: sch.end, enabled: sch.enabled }
    }, `Simpan jadwal ${sch.id}`);
  }

  function deleteRelaySchedule(id: string) {
    setRelaySchedules(current => current.filter(s => s.id !== id));
    const cmdTopic = `smartbox/${process.env.NEXT_PUBLIC_DEVICE_ID || 'smartbox-001'}/cmd`;
    publish(cmdTopic, {
      type: "relaySchedule.delete",
      payload: { id }
    }, `Hapus jadwal ${id}`);
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (passwordInput === DASHBOARD_PASSWORD) {
      window.localStorage.setItem("smartbox-authenticated", "true");
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
  toggleRelay: (relayId: RelayId) => void;
  toggleTemperature: () => void;
  deviceStatuses: { esp32: boolean; rtc: boolean; lcd: boolean; dfPlayer: boolean };
  pirEnabled: boolean;
  sleepModeEnabled: boolean;
  pirGreetingEnabled: boolean;
  pirGreetingTrack: number;
  pirGreetingStart: string;
  pirGreetingEnd: string;
  dfTrackCount: number;
  relaySchedules: Array<{ id: string; relay: number; enabled: boolean; timeRange: string }>;
  togglePir: () => void;
  toggleSleepMode: () => void;
  updatePirGreetingConfig: (enabled: boolean, track: number, start: string, end: string) => void;
  saveRelaySchedule: (sch: { id: string; relay: number; start: string; end: string; enabled: boolean }) => void;
  deleteRelaySchedule: (id: string) => void;
  flameDetected: boolean;
  pirDetected: boolean;
  obstacleNear: boolean;
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
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-5">
        <StatsGrid {...props} />
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <Panel title="Grafik Suhu Ruangan" subtitle="Ringkasan suhu 24 jam terakhir.">
            <TemperatureChart value={props.visibleTempEstimate} />
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

function MonitoringPage(props: PageProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-5">
        <Panel title="Monitoring Sensor Real-time" subtitle={`Sumber data: ${props.telemetrySource}`}>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <ReadingRow label="Suhu Ruangan" value={props.tempState === "Tidak Terhubung" || props.tempState === "Offline" ? "-" : `${props.visibleTempEstimate.toFixed(1)} C`} status={props.tempState} percent={props.tempState === "Tidak Terhubung" || props.tempState === "Offline" ? 0 : props.tempPercent} tone="blue" />
            <ReadingRow label="Gas / Asap" value={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? "-" : `${props.gasPpm} PPM (${props.visibleGasEstimate} RAW)`} status={props.gasState} percent={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? 0 : props.gasPercent} tone="emerald" />
            <ReadingRow label="Api" value={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? "-" : (props.flameDetected ? "Terdeteksi" : "Tidak Ada")} status={props.gasState === "Tidak Terhubung" ? "Tidak Terhubung" : (props.gasState === "Offline" ? "Offline" : (props.flameDetected ? "Bahaya" : "Normal"))} percent={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? 0 : (props.flameDetected ? 100 : 0)} tone="orange" />
            <ReadingRow label="Gerakan (PIR)" value={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? "-" : (props.pirDetected ? "Terdeteksi" : "Tidak Ada")} status={props.gasState === "Tidak Terhubung" ? "Tidak Terhubung" : (props.gasState === "Offline" ? "Offline" : (props.pirDetected ? "Ada Gerakan" : "Aman"))} percent={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? 0 : (props.pirDetected ? 100 : 0)} tone="orange" />
            <ReadingRow label="Halangan (IR)" value={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? "-" : (props.obstacleNear ? "Terdeteksi" : "Tidak Ada")} status={props.gasState === "Tidak Terhubung" ? "Tidak Terhubung" : (props.gasState === "Offline" ? "Offline" : (props.obstacleNear ? "Dekat" : "Jauh"))} percent={props.gasState === "Tidak Terhubung" || props.gasState === "Offline" ? 0 : (props.obstacleNear ? 100 : 0)} tone="blue" />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <WarningCard
              title="Deteksi Peringatan Suhu"
              value={`${props.visibleTempEstimate.toFixed(1)} C`}
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
  return (
    <div className="grid gap-5">
      <Panel title="Kontrol Relay" subtitle="3 relay utama sekarang berada di halaman Devices.">
        <div className="grid gap-4 md:grid-cols-3">
          {relayControls.map((relay) => (
            <RelayCard key={relay.id} label={relay.label} detail={relay.detail} pin={relay.pin} enabled={props.relayState[relay.id]} onToggle={() => props.toggleRelay(relay.id)} />
          ))}
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Status Perangkat" subtitle="Modul utama pada SmartBox.">
          <DeviceList statuses={props.deviceStatuses} />
        </Panel>
        <Panel title={`Pinout ${boardPins.label}`} subtitle="Ringkasan koneksi modul.">
          <PinoutList />
        </Panel>
      </div>
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

  // Local states for Relay Schedules
  const [localSchedules, setLocalSchedules] = useState<Array<{ id: string; relay: number; start: string; end: string; enabled: boolean }>>([]);

  useEffect(() => {
    if (props.relaySchedules) {
      const mapped = props.relaySchedules.map(s => {
        const [start, end] = s.timeRange.split("-");
        return {
          id: s.id,
          relay: s.relay,
          start: start || "07:00",
          end: end || "08:00",
          enabled: s.enabled
        };
      });
      setLocalSchedules(mapped);
    }
  }, [props.relaySchedules]);

  function updateLocalSch(id: string, field: string, value: any) {
    setLocalSchedules(current => current.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  function addScheduleRow() {
    const newSch = {
      id: `sch${Math.round(Math.random() * 1000)}`,
      relay: 1,
      start: "07:00",
      end: "08:00",
      enabled: true
    };
    props.saveRelaySchedule(newSch);
  }

  // Local states for PIR Greeting configuration
  const [localPirGreetingTrack, setLocalPirGreetingTrack] = useState(props.pirGreetingTrack || 1);
  const [localPirGreetingStart, setLocalPirGreetingStart] = useState(props.pirGreetingStart || "07:00");
  const [localPirGreetingEnd, setLocalPirGreetingEnd] = useState(props.pirGreetingEnd || "22:00");

  useEffect(() => {
    setLocalPirGreetingTrack(props.pirGreetingTrack || 1);
    setLocalPirGreetingStart(props.pirGreetingStart || "07:00");
    setLocalPirGreetingEnd(props.pirGreetingEnd || "22:00");
  }, [props.pirGreetingTrack, props.pirGreetingStart, props.pirGreetingEnd]);

  const dynamicTracks = useMemo(() => {
    const list = [...audioTracks];
    const maxTrack = props.dfTrackCount || 7;
    for (let i = 8; i <= maxTrack; i++) {
      list.push({
        id: i,
        name: `Track ${i.toString().padStart(3, "0")}.mp3`,
        use: "Custom Audio SD Card"
      });
    }
    return list;
  }, [props.dfTrackCount]);

  async function sendAlarm(alarm: Alarm) {
    setSendingAlarmId(alarm.id);
    
    // Save updated alarm configurations to Neon DB
    try {
      await fetch("/api/alarms", {
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
    } catch (err) {
      console.error("Gagal menyimpan alarm ke database:", err);
    }

    await props.publish(
      "smartbox/alarm/set",
      {
        ...alarm,
        timezone: "Asia/Indonesia",
        boardLedTimer: {
          enabled: props.boardLedScheduleEnabled,
          pin: BOARD_LED_PIN,
          durationMs: BOARD_LED_DURATION_SECONDS * 1000,
          turnOffAfterMs: BOARD_LED_DURATION_SECONDS * 1000,
        },
      },
      `Alarm ${alarm.label} ${alarm.time}`,
    );
    setSendingAlarmId(null);
  }

  function toggleBoardLedSchedule() {
    const next = !props.boardLedScheduleEnabled;
    props.setBoardLedScheduleEnabled(next);
    props.notify(`Timer LED papan ESP32 ${next ? "aktif" : "mati"}`, "info");
  }

  async function toggleAlarmEnabled(alarm: Alarm) {
    const next = !alarm.enabled;
    props.updateAlarm(alarm.id, "enabled", next);
    props.notify(`Alarm ${alarm.label} ${next ? "aktif" : "mati"}`, "info");

    // Save toggle state to Neon DB
    try {
      await fetch("/api/alarms", {
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
    } catch (err) {
      console.error("Gagal memperbarui status alarm di database:", err);
    }

    props.publish(
      "smartbox/alarm/set",
      {
        ...alarm,
        enabled: next,
        timezone: "Asia/Indonesia",
        boardLedTimer: {
          enabled: props.boardLedScheduleEnabled,
          pin: BOARD_LED_PIN,
          durationMs: BOARD_LED_DURATION_SECONDS * 1000,
          turnOffAfterMs: BOARD_LED_DURATION_SECONDS * 1000,
        },
      },
      `Alarm ${alarm.label} ${next ? "aktif" : "mati"}`,
    );
  }

  return (
    <div className="grid gap-5">
      <Panel title="Timer LED Papan ESP32" subtitle="Lampu papan menyala saat jadwal alarm aktif, lalu mati otomatis setelah 10 detik.">
        <div className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-base font-black text-slate-950">LED timer mengikuti alarm jadwal</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Saat alarm dikirim ke ESP32, payload membawa perintah LED {BOARD_LED_PIN} menyala selama {BOARD_LED_DURATION_SECONDS} detik, lalu mati otomatis.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-600">Pin: {BOARD_LED_PIN}</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-600">Durasi: {BOARD_LED_DURATION_SECONDS} detik</span>
            </div>
          </div>
          <Switch checked={props.boardLedScheduleEnabled} onChange={toggleBoardLedSchedule} />
        </div>
      </Panel>

      <Panel title="Alarm Jadwal" subtitle="Semua pengaturan alarm dipusatkan di halaman ini.">
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

      <Panel title="Jadwal Stop Kontak (Relay)" subtitle="Jadwal otomatis menyalakan dan mematikan relay/stop kontak berdasarkan rentang waktu.">
        <div className="grid gap-3">
          {localSchedules.length === 0 ? (
            <p className="py-4 text-center text-sm font-semibold text-slate-500">Belum ada jadwal. Tambahkan jadwal baru di bawah.</p>
          ) : (
            localSchedules.map((sch) => (
              <div key={sch.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[150px_160px_160px_90px_90px_90px] xl:items-center">
                <div>
                  <p className="text-sm font-black text-slate-950">ID: {sch.id}</p>
                  <p className="text-xs text-slate-500">Asia/Jakarta</p>
                </div>
                
                <select 
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" 
                  value={sch.relay} 
                  onChange={(event) => updateLocalSch(sch.id, "relay", Number(event.target.value))}
                >
                  <option value={1}>Stop Kontak 1</option>
                  <option value={2}>Stop Kontak 2</option>
                </select>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">ON</span>
                  <input 
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" 
                    type="time" 
                    value={sch.start} 
                    onChange={(event) => updateLocalSch(sch.id, "start", event.target.value)} 
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">OFF</span>
                  <input 
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" 
                    type="time" 
                    value={sch.end} 
                    onChange={(event) => updateLocalSch(sch.id, "end", event.target.value)} 
                  />
                </div>

                <Switch checked={sch.enabled} onChange={() => updateLocalSch(sch.id, "enabled", !sch.enabled)} />

                <div className="flex gap-2">
                  <button
                    className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 w-full"
                    onClick={() => props.saveRelaySchedule(sch)}
                    type="button"
                  >
                    Simpan
                  </button>
                  <button
                    className="h-11 rounded-xl bg-red-100 text-red-600 px-4 text-sm font-black transition hover:bg-red-200"
                    onClick={() => props.deleteRelaySchedule(sch.id)}
                    type="button"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))
          )}
          
          <button
            className="mt-2 h-11 w-full md:w-auto md:px-6 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600 transition text-sm font-black"
            onClick={addScheduleRow}
            type="button"
          >
            + Tambah Jadwal Baru
          </button>
        </div>
      </Panel>

      <Panel title="Greeting Wakeup (PIR)" subtitle="Atur pemutaran greeting suara otomatis di DFPlayer saat mendeteksi gerakan.">
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 lg:items-center">
            
            <div className="grid gap-1">
              <span className="text-xs font-bold text-slate-500">Aktifkan Greeting PIR</span>
              <div className="flex h-11 items-center">
                <Switch checked={props.pirGreetingEnabled} onChange={() => props.updatePirGreetingConfig(!props.pirGreetingEnabled, localPirGreetingTrack, localPirGreetingStart, localPirGreetingEnd)} />
              </div>
            </div>

            <div className="grid gap-1">
              <span className="text-xs font-bold text-slate-500">Jalur Suara (Track DFPlayer)</span>
              <select 
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400"
                value={localPirGreetingTrack} 
                onChange={(event) => setLocalPirGreetingTrack(Number(event.target.value))}
              >
                {dynamicTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.id.toString().padStart(3, "0")} - {track.name}
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

          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 pt-3">
            <span className="text-xs font-semibold text-slate-500">
              * Cooldown otomatis 1 menit diterapkan setelah greeting diputar.
            </span>
            <button
              className="h-11 rounded-xl bg-blue-600 px-6 text-sm font-black text-white transition hover:bg-blue-700"
              onClick={() => props.updatePirGreetingConfig(props.pirGreetingEnabled, localPirGreetingTrack, localPirGreetingStart, localPirGreetingEnd)}
              type="button"
            >
              Simpan Pengaturan PIR Greeting
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
  const logs = [
    `Suhu ruangan: ${props.visibleTempEstimate.toFixed(1)} C`,
    `Kadar gas: ${props.gasPpm} PPM`,
    `MQTT: ${props.mqttOnline ? "Terhubung" : "Offline"}`,
    `Command terakhir: ${props.lastCommand}`,
    `Telemetry: ${props.telemetrySource}`,
  ];

  return (
    <Panel title="Riwayat Aktivitas" subtitle="Log ringkas status dan command terakhir.">
      <div className="grid gap-3">
        {logs.map((log, index) => <Activity key={log} label={log} time={index === 0 ? "baru saja" : props.status} />)}
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
  const hasTemp = props.deviceStatuses.esp32 && props.deviceStatuses.rtc;
  const hasGas = props.deviceStatuses.esp32;
  return (
    <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <StatCard 
        label="Suhu Ruangan" 
        value={hasTemp ? `${props.visibleTempEstimate.toFixed(1)} C` : "-"} 
        detail={hasTemp ? "Update realtime" : "DS3231 Tidak Terhubung"} 
        accent="blue" 
      />
      <StatCard 
        label="Status Gas/Asap" 
        value={hasGas ? (props.gasState === "Aman" ? `Aman (${props.gasPpm} PPM)` : `${props.gasState} (${props.gasPpm} PPM)`) : "Tidak Terhubung"} 
        detail={hasGas ? `Sensor RAW: ${props.visibleGasEstimate}` : "ESP32 Offline"} 
        accent="cyan" 
      />
      <StatCard 
        label="Status Api" 
        value={hasGas ? (props.flameDetected ? "Terdeteksi" : "Tidak Ada") : "Tidak Terhubung"} 
        detail={hasGas ? (props.flameDetected ? "Bahaya Kebakaran!" : "Sensor normal") : "ESP32 Offline"} 
        accent="orange" 
      />
      <StatCard 
        label="Gerakan (PIR)" 
        value={hasGas ? (props.pirDetected ? "Terdeteksi" : "Aman") : "Tidak Terhubung"} 
        detail={hasGas ? (props.pirDetected ? "Terdeteksi gerakan" : "Kondisi aman") : "ESP32 Offline"} 
        accent="violet" 
      />
      <StatCard 
        label="Halangan (IR)" 
        value={hasGas ? (props.obstacleNear ? "Terdeteksi" : "Tidak Ada") : "Tidak Terhubung"} 
        detail={hasGas ? (props.obstacleNear ? "Objek mendekat" : "Jalur bersih") : "ESP32 Offline"} 
        accent="indigo" 
      />
      <StatCard label="Koneksi Perangkat" value={props.deviceStatuses.esp32 ? `${props.relayActiveCount} / 3` : "- / -"} detail={`Alarm aktif: ${props.activeAlarms}`} accent="indigo" />
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
      <Panel title="Aktivitas Terbaru" subtitle="Log ringkas sistem.">
        <div className="grid gap-3">
          <Activity label={`Suhu ruangan: ${props.visibleTempEstimate.toFixed(1)} C`} time="baru saja" />
          <Activity label={`Kadar gas: ${props.gasPpm} PPM`} time="baru saja" />
          <Activity label={props.lastCommand} time={props.status} />
          <Activity label={`Telemetry: ${props.telemetrySource}`} time={props.mqttOnline ? "online" : "offline"} />
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
      gasEnabled: readBoolean(payload.gasEnabled),
      gasRaw: readNumber(payload.gasRaw),
      tempEnabled: readBoolean(payload.tempEnabled),
      temperatureC: readFirstNumber(payload, ["temperatureC", "temperature", "tempC", "temp", "suhuC", "suhu"]),
      flameDetected: readBoolean(payload.flameDetected),
      pirDetected: readBoolean(payload.pirDetected),
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

function StatCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: "blue" | "cyan" | "orange" | "indigo" | "violet" }) {
  const accentClass = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    cyan: "text-cyan-600 bg-cyan-50 border-cyan-100",
    orange: "text-orange-600 bg-orange-50 border-orange-100",
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    violet: "text-violet-600 bg-violet-50 border-violet-100",
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
  };

  return (
    <article className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-100/50 transition-all duration-200 hover:shadow-md hover:border-slate-300 flex flex-col justify-between h-full min-h-[160px]">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{label}</span>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${accentClass[accent]}`}>
          {icons[accent]}
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-2xl font-black tracking-tight text-slate-900 break-all">{value}</h3>
        <p className="mt-2 text-xs font-semibold text-slate-500 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
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
  const warning = status === "Peringatan" || status === "Waspada" || status === "Panas" || status === "Bahaya" || status === "Terdeteksi" || status === "Ada Gerakan" || status === "Dekat";
  const offline = status === "Offline" || status === "Tidak Terhubung";
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

function RelayCard({ label, detail, pin, enabled, onToggle }: { label: string; detail: string; pin: string; enabled: boolean; onToggle: () => void }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black text-slate-950">{label}</p>
          <p className="mt-1 text-sm text-slate-500">{detail}</p>
        </div>
        <span className={`h-3 w-3 rounded-full ${enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
      </div>
      <p className="mt-4 font-mono text-xs font-bold text-blue-600">{pin}</p>
      <button className={`mt-4 h-11 w-full rounded-xl text-sm font-black text-white shadow-sm transition ${enabled ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-400 hover:bg-slate-500"}`} onClick={onToggle} type="button">
        {enabled ? "Relay ON" : "Relay OFF"}
      </button>
    </article>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button aria-pressed={checked} className={`relative h-8 w-16 rounded-full p-1 transition ${checked ? "bg-blue-600" : "bg-slate-300"}`} onClick={onChange} type="button">
      <span className={`block h-6 w-6 rounded-full bg-white shadow transition ${checked ? "translate-x-8" : "translate-x-0"}`} />
      <span className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-black text-white ${checked ? "left-3" : "right-2"}`}>{checked ? "ON" : "OFF"}</span>
    </button>
  );
}

function DeviceList({ statuses = { esp32: false, rtc: false, lcd: false, dfPlayer: false } }: { statuses?: { esp32: boolean; rtc: boolean; lcd: boolean; dfPlayer: boolean } }) {
  const devices = [
    { name: "ESP32 Controller", detail: "Mikrokontroler utama", online: statuses.esp32 },
    { name: "RTC DS3231 (I2C)", detail: "Real-time clock jam", online: statuses.rtc },
    { name: "LCD 16x2 (I2C)", detail: "Karakter display", online: statuses.lcd },
    { name: "DFPlayer Mini", detail: "Modul MP3 player", online: statuses.dfPlayer },
    { name: "Mosquitto Broker", detail: "MQTT TCP & WebSocket", online: true },
  ];
  return (
    <div className="grid gap-2">
      {devices.map((device) => (
        <div key={device.name} className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
          <div>
            <p className="text-sm font-bold text-slate-900">{device.name}</p>
            <p className="text-xs text-slate-500">{device.detail}</p>
          </div>
          <span className={`text-sm font-bold ${device.online ? "text-emerald-600" : "text-red-500"}`}>
            {device.online ? "Online" : "Offline"}
          </span>
        </div>
      ))}
    </div>
  );
}

function PinoutList() {
  return (
    <div className="grid gap-2">
      {pinGroups.map(([name, pin]) => (
        <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-medium text-slate-700">{name}</span>
          <span className="font-mono text-xs font-bold text-blue-600">{pin}</span>
        </div>
      ))}
    </div>
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
