import type { FormEvent } from "react";

/* ─── View / Navigation ─── */
export type ViewId = "dashboard" | "monitoring" | "devices" | "ai" | "alarms" | "history" | "settings";

/* ─── Command ─── */
export type CommandStatus = "idle" | "sending" | "sent" | "error";

/* ─── Relay ─── */
export type RelayId = "socket1" | "socket2" | "ampli";

/* ─── Toast ─── */
export type Toast = {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
};

/* ─── Alarm ─── */
export type Alarm = {
  id: string;
  label: string;
  time: string;
  greeting: string;
  track: number;
  enabled: boolean;
};

/* ─── AlarmSchedule (DB model) ─── */
export type AlarmSchedule = {
  id: string;
  name: string;
  time: string;
  track: number;
  active: boolean;
  days: string;
  buzzerActive: boolean;
  buzzerDuration: number;
  buzzerDelay: number;
  repeatCount: number;
  repeatDelay: number;
  lastRunAt?: string | null;
};

/* ─── Telemetry payload from MQTT / ESP32 ─── */
export type TelemetryPayload = {
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
  gasThresholdPpm?: number;
  tempThreshold?: number;
  ip?: string;
  rssi?: number;
};

/* ─── Board Profile ─── */
export type BoardProfile = "ESP32_S3" | "ESP32_WROOM";

/* ─── Device Status ─── */
export type DeviceStatuses = {
  esp32: boolean;
  rtc: boolean;
  lcd: boolean;
  dfPlayer: boolean;
  ip?: string;
  rssi?: number;
  lastSeen?: string;
};

/* ─── Relay Schedule (DB model) ─── */
export type RelaySchedule = {
  id: string;
  name: string;
  relayNumber: number;
  startTime: string;
  endTime: string;
  days: string;
  enabled: boolean;
};

/* ─── Event Log ─── */
export type EventLogEntry = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  level: string;
};

/* ─── Smartbox Context value (exposed by useSmartbox) ─── */
export type SmartboxContextValue = {
  /* auth */
  isAuthenticated: boolean;
  authChecked: boolean;
  passwordInput: string;
  loginError: string;
  setPasswordInput: (value: string) => void;
  submitLogin: (event: FormEvent<HTMLFormElement>) => void;

  /* sensor state */
  gasEnabled: boolean;
  temperatureEnabled: boolean;
  visibleGasEstimate: number;
  visibleTempEstimate: number;
  gasPpm: number;
  gasPercent: number;
  tempPercent: number;
  gasWarning: boolean;
  tempWarning: boolean;
  gasState: string;
  tempState: string;
  flameDetected: boolean;
  pirDetected: boolean | null;
  obstacleNear: boolean;
  pirEnabled: boolean;
  sleepModeEnabled: boolean;
  gasThresholdPpm: number;
  tempThreshold: number;

  /* PIR greeting */
  pirGreetingEnabled: boolean;
  pirGreetingTrack: number;
  pirGreetingStart: string;
  pirGreetingEnd: string;
  pirGreetingCooldown: number;
  pirGreetingDays: string[];
  pirGreetingPlayMode: string;

  /* device */
  deviceStatuses: DeviceStatuses;
  dfTrackCount: number;
  telemetrySource: string;
  tempHistory: number[];
  gasHistory: number[];

  /* relay */
  relayState: Record<RelayId, boolean>;
  relayAutoOffAt: { socket1: number | null; socket2: number | null };
  relayActiveCount: number;
  relaySchedules: RelaySchedule[];

  /* alarms */
  alarms: Alarm[];
  alarmSchedules: AlarmSchedule[];
  activeAlarms: number;

  /* mqtt / command */
  mqttOnline: boolean;
  status: CommandStatus;
  lastCommand: string;
  voiceMode: boolean;
  buzzerEnabled: boolean;
  boardLedScheduleEnabled: boolean;

  /* events */
  events: EventLogEntry[];

  /* toast */
  toast: Toast | null;
  notify: (message: string, tone?: Toast["tone"]) => void;

  /* actions */
  publish: (topic: string, payload: Record<string, unknown>, label: string) => Promise<boolean>;
  sendDeviceCommand: (type: string, payload: Record<string, unknown>, label: string, successMsg?: string, errorMsg?: string) => Promise<boolean>;
  toggleGas: () => void;
  toggleTemperature: () => void;
  toggleRelay: (relayId: RelayId) => Promise<void>;
  togglePir: () => void;
  toggleSleepMode: () => void;
  updateAlarm: (id: string, field: keyof Alarm, value: string | number | boolean) => void;
  updateGasThreshold: (ppm: number) => Promise<void>;
  updateTempThreshold: (threshold: number) => Promise<void>;
  setBuzzerEnabled: (enabled: boolean) => void;
  setBoardLedScheduleEnabled: (enabled: boolean) => void;
  setVoiceMode: (enabled: boolean) => void;
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
  onSaveSchedule: (sch: {
    id?: string;
    name: string;
    time: string;
    track: number;
    active: boolean;
    days: string;
    buzzerActive: boolean;
    buzzerDuration: number;
    buzzerDelay: number;
    repeatCount: number;
    repeatDelay: number;
  }) => Promise<void>;
  onDeleteSchedule: (id: string) => Promise<void>;
  onToggleScheduleActive: (id: string, currentActive: boolean) => Promise<void>;
  onTestPlayVoice: (track: number) => Promise<void>;
  setToast: (toast: Toast | null) => void;
};
