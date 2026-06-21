import type { TelemetryPayload } from "./smartbox-types";

/* ─── API helpers ─── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function sendMqttCommand(topic: string, payload: Record<string, unknown>) {
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

export async function sendDeviceCommandApi(deviceId: string, type: string, payload: Record<string, unknown>) {
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

/* ─── Telemetry parsing ─── */

export function parseTelemetry(message: string): TelemetryPayload {
  try {
    const parsed = JSON.parse(message) as unknown;
    const payload = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
    if (!isRecord(payload)) return {};
    return {
      gasEnabled: readBoolean(payload.gasSensorEnabled) ?? readBoolean(payload.gasEnabled),
      gasRaw: readNumber(payload.gasRaw),
      tempEnabled: readBoolean(payload.tempEnabled) ?? readBoolean(payload.tempSensorEnabled) ?? readBoolean(payload.rtcReady),
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
      relay1Owner: typeof payload.relay1Owner === "string" ? payload.relay1Owner : undefined,
      relay2Owner: typeof payload.relay2Owner === "string" ? payload.relay2Owner : undefined,
      bluetoothRelay: readBoolean(payload.bluetoothRelay) ?? readBoolean(payload.ampRelay) ?? readBoolean(payload.bluetoothAudio),
      buzzer: readBoolean(payload.buzzer),
      gasLevel: typeof payload.gasLevel === "string" ? payload.gasLevel : undefined,
      gasDetected: readBoolean(payload.gasDetected),
      gasThresholdPpm: readNumber(payload.gasThresholdPpm),
      tempThreshold: readNumber(payload.tempThreshold),
      gasBuzzerEnabled: readBoolean(payload.gasBuzzerEnabled),
      voiceMode: readBoolean(payload.voiceCommandEnabled) ?? readBoolean(payload.voiceMode),
      voiceCommandEnabled: readBoolean(payload.voiceCommandEnabled),
      voiceWakeActive: readBoolean(payload.voiceWakeActive),
      prioritySensor: readNumber(payload.prioritySensor),
      prioritySchedule: readNumber(payload.prioritySchedule),
      priorityVoice: readNumber(payload.priorityVoice),
      priorityManual: readNumber(payload.priorityManual),
      online: readBoolean(payload.online),
      ip: typeof payload.ip === "string" ? payload.ip : undefined,
      rssi: readNumber(payload.rssi),
    };
  } catch {
    return {};
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }
  return undefined;
}

export function readFirstNumber(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readNumber(payload[key]);
    if (typeof value === "number") return value;
  }
  return undefined;
}

export function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function roundTemperature(value: number) {
  return Math.round(value * 10) / 10;
}
