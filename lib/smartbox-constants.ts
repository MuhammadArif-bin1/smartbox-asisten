import type { BoardProfile, RelayId, Alarm, ViewId } from "./smartbox-types";

/* ─── Navigation views ─── */
export const views: Array<{ id: ViewId; label: string; href: string }> = [
  { id: "dashboard", label: "Dashboard", href: "/admin" },
  { id: "monitoring", label: "Monitoring", href: "/admin/monitoring" },
  { id: "devices", label: "Devices Control", href: "/admin/devices" },
  { id: "ai", label: "AI Assistant", href: "/admin/ai" },
  { id: "alarms", label: "Alarm Jadwal", href: "/admin/alarms" },
  { id: "history", label: "Riwayat", href: "/admin/history" },
  { id: "settings", label: "Pengaturan", href: "/admin/settings" },
];

/* ─── Default alarms ─── */
export const initialAlarms: Alarm[] = [
  { id: "morning", label: "Pagi", time: "07:00", greeting: "Pengingat aktivitas pagi", track: 4, enabled: true },
  { id: "noon", label: "Siang", time: "12:30", greeting: "Pengingat istirahat siang", track: 5, enabled: true },
  { id: "evening", label: "Malam", time: "19:30", greeting: "Pengingat istirahat malam", track: 6, enabled: true },
];

/* ─── Audio tracks (DFPlayer) ─── */
export const audioTracks = [
  { id: 1, name: "0001.mp3", label: "Smartbox siap digunakan", use: "Sistem utama" },
  { id: 2, name: "0002.mp3", label: "Jam dan suhu real-time", use: "Sistem utama" },
  { id: 3, name: "0003.mp3", label: "Bluetooth diaktifkan", use: "Bluetooth/audio" },
  { id: 4, name: "0004.mp3", label: "Selamat pagi tuan", use: "Alarm" },
  { id: 5, name: "0005.mp3", label: "Selamat siang tuan", use: "Alarm" },
  { id: 6, name: "0006.mp3", label: "Selamat sore tuan", use: "Alarm" },
  { id: 7, name: "0007.mp3", label: "Asap terdeteksi", use: "Sensor MQ-2" },
  { id: 8, name: "0008.mp3", label: "Gas terdeteksi", use: "Sensor MQ-2" },
  { id: 9, name: "0009.mp3", label: "Suhu terdeteksi", use: "Sensor DS3231" },
  { id: 10, name: "0010.mp3", label: "Gerakan berjalan", use: "Sensor PIR" },
  { id: 11, name: "0011.mp3", label: "Gerakan melompat", use: "Sensor PIR" },
  { id: 12, name: "0012.mp3", label: "Gerakan melambaikan tangan", use: "Sensor PIR" },
  { id: 13, name: "0013.mp3", label: "Bluetooth dimatikan", use: "Bluetooth/audio" },
  { id: 14, name: "0014.mp3", label: "Hallo Aero", use: "KWS/Sistem" },
  { id: 15, name: "0015.mp3", label: "Perkenalan Aero", use: "Sistem utama" },
];

/* ─── Board pin profiles ─── */
export const selectedBoardProfile: BoardProfile = process.env.NEXT_PUBLIC_BOARD_PROFILE === "ESP32_WROOM" ? "ESP32_WROOM" : "ESP32_S3";

export const boardPinProfiles = {
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

export const boardPins = boardPinProfiles[selectedBoardProfile];

/* ─── Relay controls ─── */
export const relayControls: Array<{ id: RelayId; label: string; detail: string; pin: string; mqttKey: string }> = [
  { id: "socket1", label: "Stop Kontak 1", detail: "Relay beban utama", pin: boardPins.relaySocket1, mqttKey: "socket_1" },
  { id: "socket2", label: "Stop Kontak 2", detail: "Relay beban cadangan", pin: boardPins.relaySocket2, mqttKey: "socket_2" },
  { id: "ampli", label: "Bluetooth Ampli", detail: "Power amplifier audio", pin: boardPins.relayAmpli, mqttKey: "bluetooth_ampli" },
];

/* ─── Days of week ─── */
export const daysOfWeek = [
  { id: "monday", label: "Sen" },
  { id: "tuesday", label: "Sel" },
  { id: "wednesday", label: "Rab" },
  { id: "thursday", label: "Kam" },
  { id: "friday", label: "Jum" },
  { id: "saturday", label: "Sab" },
  { id: "sunday", label: "Min" },
];

/* ─── Sensor thresholds & chart defaults ─── */
export const temperatureSeries = [28, 28.6, 29.1, 30, 30.5, 30.2, 29.4, 28.8, 28.2, 27.6, 26.8, 25.8, 25.4, 25.6, 26.4, 27.2, 27.8, 27.2];
export const defaultGasSeries = [120, 140, 150, 160, 200, 220, 210, 180, 160, 150, 140, 130, 120, 130, 140, 150, 160, 150];

export const TEMP_WARNING_C = 35;
export const GAS_WARNING_RAW = 1800;
export const BOARD_LED_DURATION_SECONDS = 10;

/* ─── MQTT / Network ─── */
export const DEFAULT_MQTT_WS_URL = "ws://192.168.1.12:9001";
export const MQTT_BROKER_LABEL = "mqtt://192.168.1.12:1883";

/* ─── Auth ─── */
export const DASHBOARD_PASSWORD = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || "smartbox123";
