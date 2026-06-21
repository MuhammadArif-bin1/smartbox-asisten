import "dotenv/config";
import mqtt from "mqtt";
import { prisma } from "../lib/prisma.js";

const brokerUrl = process.env.MQTT_URL || process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const username = process.env.MQTT_USERNAME || process.env.NEXT_PUBLIC_MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD || process.env.NEXT_PUBLIC_MQTT_PASSWORD;

console.log(`[Worker] Starting MQTT worker connecting to: ${brokerUrl}`);

const client = mqtt.connect(brokerUrl, {
  clientId: `smartbox-worker-${Math.round(Math.random() * 10000)}`,
  username,
  password,
  clean: true,
  reconnectPeriod: 5000,
});

/**
 * Helper function to retry Prisma queries if the database connection drops
 * (Useful for Neon DB auto-suspend wakeups)
 */
async function retryQuery<T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    console.warn(`[Worker] Database query failed (connection dropped), retrying in ${delay}ms... (Remaining retries: ${retries})`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryQuery(fn, retries - 1, delay * 2);
  }
}

async function ensureDevice(deviceId: string, isOnline: boolean = true) {
  try {
    return await retryQuery(() => prisma.device.upsert({
      where: { deviceId },
      update: {
        status: isOnline ? "online" : "offline",
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        id: deviceId, // Keep id = deviceId for backward compatibility
        deviceId,
        name: `SmartBox ${deviceId}`,
        status: isOnline ? "online" : "offline",
        lastSeenAt: new Date(),
      },
    }));
  } catch (err) {
    console.error(`[Worker] Error upserting device ${deviceId}:`, err);
  }
}

type ActuatorPatch = {
  relay1?: boolean;
  relay2?: boolean;
  bluetoothAudio?: boolean;
  buzzer?: boolean;
};

async function syncActuatorState(deviceId: string, patch: ActuatorPatch) {
  const now = new Date();

  await retryQuery(() => prisma.smartboxStatus.upsert({
    where: { deviceId },
    create: {
      deviceId,
      online: true,
      lastSeenAt: now,
      ...patch,
    },
    update: {
      online: true,
      lastSeenAt: now,
      ...patch,
    },
  })).catch((err) => {
    console.error(`[Worker] Error syncing actuator state for ${deviceId}:`, err);
  });

  const lastReading = await retryQuery(() => prisma.sensorReading.findFirst({
    where: { deviceId },
    orderBy: { createdAt: "desc" },
  })).catch(() => null);

  await retryQuery(() => prisma.sensorReading.create({
    data: {
      deviceId,
      temperature: lastReading?.temperature ?? 0,
      gasRaw: lastReading?.gasRaw ?? 0,
      gasDetected: lastReading?.gasDetected ?? false,
      gasLevel: lastReading?.gasLevel ?? "normal",
      temperatureHigh: lastReading?.temperatureHigh ?? false,
      pirDetected: lastReading?.pirDetected ?? false,
      obstacleNear: lastReading?.obstacleNear ?? false,
      relay1: patch.relay1 ?? lastReading?.relay1 ?? false,
      relay2: patch.relay2 ?? lastReading?.relay2 ?? false,
      bluetoothRelay: patch.bluetoothAudio ?? lastReading?.bluetoothRelay ?? false,
      buzzer: patch.buzzer ?? lastReading?.buzzer ?? false,
      gasSensorEnabled: lastReading?.gasSensorEnabled ?? true,
      createdAt: now,
    },
  })).catch((err) => {
    console.error(`[Worker] Error saving actuator SensorReading for ${deviceId}:`, err);
  });
}

client.on("connect", () => {
  console.log("[Worker] Connected to MQTT broker!");
  
  // Subscribe to wildcard topics to support dynamic devices
  client.subscribe("smartbox/+/telemetry", { qos: 1 });
  client.subscribe("smartbox/+/event", { qos: 1 });
  client.subscribe("smartbox/+/ack", { qos: 1 });
  client.subscribe("smartbox/+/status", { qos: 1 });
  client.subscribe("smartbox/+/cmd", { qos: 1 });
  
  console.log("[Worker] Subscribed to wildcard topics: smartbox/+/telemetry, event, ack, status, cmd");
});

client.on("message", async (topic, message) => {
  const payloadStr = message.toString();
  console.log(`[Worker] Message received on ${topic}`);
  console.log(`[Worker] Payload: ${payloadStr}`);
  
  try {
    const parts = topic.split("/");
    if (parts.length < 3) {
      console.warn(`[Worker] Ignored message with invalid topic structure: ${topic}`);
      return;
    }
    
    const deviceId = parts[1];
    const messageType = parts[2];
    const data = JSON.parse(payloadStr);

    if (messageType === "cmd") {
      console.log(`[Worker] Command published to ${topic}`);
      // Bug 4 fix: invalidasi cache saat ada perubahan jadwal relay
      const cmdType = data.type || "";
      if (cmdType.startsWith("relaySchedule.")) {
        invalidateSchedulesCache();
      }
    }

    else if (messageType === "status") {
      const isOnline = data.online === true;
      console.log(`[Worker] Device ${deviceId} status changed to: ${isOnline ? "ONLINE" : "OFFLINE"}`);
      await ensureDevice(deviceId, isOnline);

      // Sync to SmartboxStatus
      await retryQuery(() => prisma.smartboxStatus.upsert({
        where: { deviceId },
        create: {
          deviceId,
          online: isOnline,
          lastSeenAt: new Date(),
        },
        update: {
          online: isOnline,
          lastSeenAt: new Date(),
        }
      })).catch((err) => {
        console.error(`[Worker] Error syncing SmartboxStatus status:`, err);
      });
    }
    
    else if (messageType === "telemetry") {
      const {
        temperature,
        temperatureC,
        gasRaw = 0,
        gasDetected = false,
        gasLevel = "normal",
        temperatureHigh = false,
        pirDetected,
        motion,
        motionDetected,
        obstacleNear = false,
        relay1 = false,
        relay2 = false,
        bluetoothRelay,
        ampRelay,
        bluetoothAudio,
        buzzer = false,
        gasSensorEnabled,
        gasEnabled,
        tempSensorEnabled,
        tempEnabled,
      } = data;

      // Extract temperature value (support fallback keys)
      const finalTemperature = typeof temperatureC === "number" 
        ? temperatureC 
        : (typeof temperature === "number" ? temperature : 0);
      // Extract bluetoothRelay value (support fallback keys)
      const finalBluetooth = typeof bluetoothRelay === "boolean" 
        ? bluetoothRelay 
        : (typeof ampRelay === "boolean" 
          ? ampRelay 
          : (typeof bluetoothAudio === "boolean" ? bluetoothAudio : false));
      // Extract PIR detected value (support fallback keys)
      const previousStatus = typeof pirDetected === "boolean" || typeof motionDetected === "boolean" || typeof motion === "boolean"
        ? null
        : await retryQuery(() => prisma.smartboxStatus.findUnique({
            where: { deviceId },
            select: { pirDetected: true },
          })).catch(() => null);
      const finalPir = typeof pirDetected === "boolean"
        ? pirDetected
        : (typeof motionDetected === "boolean"
          ? motionDetected
          : (typeof motion === "boolean" ? motion : (previousStatus?.pirDetected ?? false)));
      const finalGasDetected = Boolean(gasDetected) || gasLevel === "gas" || gasLevel === "smoke";
      const finalGasSensorEnabled = typeof gasSensorEnabled === "boolean" ? gasSensorEnabled : (typeof gasEnabled === "boolean" ? gasEnabled : true);
      const finalTempSensorEnabled = typeof tempSensorEnabled === "boolean" ? tempSensorEnabled : (typeof tempEnabled === "boolean" ? tempEnabled : true);

      await ensureDevice(deviceId, true);

      // Create new SensorReading record
      await retryQuery(() => prisma.sensorReading.create({
        data: {
          deviceId,
          temperature: finalTemperature,
          gasRaw: typeof gasRaw === "number" ? Math.round(gasRaw) : 0,
          gasDetected: finalGasDetected,
          gasLevel: gasLevel || "normal",
          temperatureHigh: Boolean(temperatureHigh),
          pirDetected: finalPir,
          obstacleNear: Boolean(obstacleNear),
          relay1: Boolean(relay1),
          relay2: Boolean(relay2),
          bluetoothRelay: finalBluetooth,
          buzzer: Boolean(buzzer),
          gasSensorEnabled: finalGasSensorEnabled,
          tempSensorEnabled: finalTempSensorEnabled,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        },
      })).catch((err) => {
        console.error(`[Worker] Error saving SensorReading:`, err);
      });

      // Update/Sync SmartboxStatus singleton
      await retryQuery(() => prisma.smartboxStatus.upsert({
        where: { deviceId },
        create: {
          deviceId,
          online: true,
          lastSeenAt: new Date(),
          gasRaw: typeof gasRaw === "number" ? Math.round(gasRaw) : 0,
          gasLevel: gasLevel || "normal",
          smokeDetected: gasLevel === "smoke",
          gasDetected: gasLevel === "gas",
          temperatureC: finalTemperature,
          temperatureHigh: Boolean(temperatureHigh),
          pirDetected: finalPir,
          obstacleNear: Boolean(obstacleNear),
          relay1: Boolean(relay1),
          relay2: Boolean(relay2),
          bluetoothAudio: finalBluetooth,
          buzzer: Boolean(buzzer),
          dfPlayerReady: data.dfPlayerReady ?? false,
          gasSensorEnabled: finalGasSensorEnabled,
          tempSensorEnabled: finalTempSensorEnabled,
        },
        update: {
          online: true,
          lastSeenAt: new Date(),
          gasRaw: typeof gasRaw === "number" ? Math.round(gasRaw) : 0,
          gasLevel: gasLevel || "normal",
          smokeDetected: gasLevel === "smoke",
          gasDetected: gasLevel === "gas",
          temperatureC: finalTemperature,
          temperatureHigh: Boolean(temperatureHigh),
          pirDetected: finalPir,
          obstacleNear: Boolean(obstacleNear),
          relay1: Boolean(relay1),
          relay2: Boolean(relay2),
          bluetoothAudio: finalBluetooth,
          buzzer: Boolean(buzzer),
          dfPlayerReady: data.dfPlayerReady ?? false,
          gasSensorEnabled: finalGasSensorEnabled,
          tempSensorEnabled: finalTempSensorEnabled,
        }
      })).catch((err) => {
        console.error(`[Worker] Error updating SmartboxStatus telemetry:`, err);
      });

      console.log(`[Worker] Saved SensorReading & updated SmartboxStatus for ${deviceId}: Temp=${finalTemperature}°C, GasRaw=${gasRaw}, Level=${gasLevel}`);
    }
    
    else if (messageType === "event") {
      const { level = "INFO", type = "generic", message = "" } = data;
      const payloadObj = data.payload && typeof data.payload === "object" ? data.payload : {};
      
      await ensureDevice(deviceId, true);

      const actuatorPatch: ActuatorPatch = {};
      if (type === "relay.updated") {
        if (payloadObj.relay === 1 && typeof payloadObj.state === "boolean") actuatorPatch.relay1 = payloadObj.state;
        if (payloadObj.relay === 2 && typeof payloadObj.state === "boolean") actuatorPatch.relay2 = payloadObj.state;
      } else if (type === "relay1.auto_off") {
        actuatorPatch.relay1 = false;
      } else if (type === "relay2.auto_off") {
        actuatorPatch.relay2 = false;
      } else if (type === "bluetooth.on") {
        actuatorPatch.bluetoothAudio = true;
      } else if (type === "bluetooth.off" || type === "bluetooth.auto_off") {
        actuatorPatch.bluetoothAudio = false;
      } else if (type === "buzzer.updated" && typeof payloadObj.state === "boolean") {
        actuatorPatch.buzzer = payloadObj.state;
      }

      if (Object.keys(actuatorPatch).length > 0) {
        await syncActuatorState(deviceId, actuatorPatch);
        console.log(`[Worker] Synced actuator state for ${deviceId}: ${JSON.stringify(actuatorPatch)}`);
      }

      // Handle PIR motion event for fast real-time status update in database
      if (type === "pir.motion") {
        const pirDetectedVal = typeof payloadObj.pirDetected === "boolean" 
          ? payloadObj.pirDetected 
          : (typeof data.pirDetected === "boolean" ? data.pirDetected : true);
        
        console.log(`[Worker] Direct PIR injection: device ${deviceId} pirDetected=${pirDetectedVal}`);
        
        // 1. Update singleton SmartboxStatus
        await retryQuery(() => prisma.smartboxStatus.upsert({
          where: { deviceId },
          create: {
            deviceId,
            online: true,
            lastSeenAt: new Date(),
            pirDetected: pirDetectedVal,
          },
          update: {
            online: true,
            lastSeenAt: new Date(),
            pirDetected: pirDetectedVal,
          }
        })).catch((err) => {
          console.error(`[Worker] Error updating SmartboxStatus for PIR event:`, err);
        });

        // 2. Insert SensorReading to immediately sync frontend readings poll
        const lastReading = await prisma.sensorReading.findFirst({
          where: { deviceId },
          orderBy: { createdAt: "desc" },
        });

        await retryQuery(() => prisma.sensorReading.create({
          data: {
            deviceId,
            temperature: lastReading?.temperature ?? 28.0,
            gasRaw: lastReading?.gasRaw ?? 0,
            gasDetected: lastReading?.gasDetected ?? false,
            gasLevel: lastReading?.gasLevel ?? "normal",
            temperatureHigh: lastReading?.temperatureHigh ?? false,
            pirDetected: pirDetectedVal,
            obstacleNear: lastReading?.obstacleNear ?? false,
            relay1: lastReading?.relay1 ?? false,
            relay2: lastReading?.relay2 ?? false,
            bluetoothRelay: lastReading?.bluetoothRelay ?? false,
            buzzer: lastReading?.buzzer ?? false,
            gasSensorEnabled: lastReading?.gasSensorEnabled ?? true,
            createdAt: new Date(),
          },
        })).catch((err) => {
          console.error(`[Worker] Error saving SensorReading for PIR event:`, err);
        });

        if (pirDetectedVal) {
          await handlePirGreeting(deviceId).catch((err) => {
            console.error(`[Worker] Error in handlePirGreeting:`, err);
          });
        }
      }

      await retryQuery(() => prisma.eventLog.create({
        data: {
          deviceId,
          level,
          type,
          message,
          payload: data,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        },
      })).catch((err) => {
        console.error(`[Worker] Error logging EventLog:`, err);
      });

      console.log(`[Worker] Logged EventLog for ${deviceId}: [${level}] ${type} - ${message}`);
    }
    
    else if (messageType === "ack") {
      const { id: commandId, message = "" } = data;
      
      await ensureDevice(deviceId, true);

      if (commandId) {
        const result = await retryQuery(() => prisma.deviceCommand.updateMany({
          where: {
            id: commandId,
            deviceId: deviceId,
          },
          data: {
            status: "ACK",
            ack: data,
            updatedAt: new Date(),
          },
        })).catch((err) => {
          console.error(`[Worker] Error updating DeviceCommand:`, err);
          return { count: 0 };
        });

        if (result && result.count > 0) {
          console.log(`[Worker] Updated DeviceCommand ${commandId} to ACK. Message: ${message}`);
        } else {
          console.warn(`[Worker] ACK received for command ${commandId} but command was not found in DB`);
        }
      } else {
        console.warn(`[Worker] Received ACK on topic [${topic}] but missing command ID ('id')`);
      }
    }
  } catch (err) {
    console.error(`[Worker] Error processing message on topic [${topic}]:`, err);
  }
});

client.on("error", (err) => {
  console.error("[Worker] MQTT client connection error:", err);
});

client.on("close", () => {
  console.log("[Worker] MQTT connection closed.");
});

// Keep-Alive / Heartbeat untuk menjaga database Neon tetap aktif (tidak tertidur/suspend)
const DB_KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 menit
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("[Worker] Database keep-alive ping berhasil (Neon DB tetap aktif).");
  } catch (err) {
    console.warn("[Worker] Database keep-alive ping gagal:", err);
  }
}, DB_KEEP_ALIVE_INTERVAL_MS);

// ------------------------------------------------------------------
// BACKGROUND SCHEDULER UNTUK RELAY SCHEDULE
// ------------------------------------------------------------------
const lastRelayTrigger = new Map<string, string>();
const lastAlarmTrigger = new Map<string, string>();

// Cache arrays to prevent database spamming when checking every second
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRelaySchedules: any[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAlarmSchedules: any[] = [];
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

// Bug 4 fix: Paksa invalidasi cache saat jadwal dihapus/diubah
function invalidateSchedulesCache() {
  lastCacheFetchTime = 0;
  cachedRelaySchedules = [];
  console.log("[Worker Cache] Schedule cache invalidated (force refresh on next check).");
}

async function refreshSchedulesCacheIfNeeded() {
  const now = Date.now();
  if (now - lastCacheFetchTime < CACHE_TTL_MS && cachedRelaySchedules.length > 0) {
    return;
  }
  try {
    const relaySchedules = await retryQuery(() => prisma.relaySchedule.findMany({
      where: { enabled: true },
    })).catch((err) => {
      console.error("[Worker Schedule] Error fetching schedules for cache:", err);
      return null;
    });

    const alarmSchedules = await retryQuery(() => prisma.alarmSchedule.findMany({
      where: { active: true },
    })).catch((err) => {
      console.error("[Worker Alarm] Error fetching alarm schedules for cache:", err);
      return null;
    });

    if (relaySchedules !== null) {
      cachedRelaySchedules = relaySchedules;
    }
    if (alarmSchedules !== null) {
      cachedAlarmSchedules = alarmSchedules;
    }
    lastCacheFetchTime = now;
  } catch (err) {
    console.error("[Worker Cache] Unhandled error during cache refresh:", err);
  }
}

function getJakartaDateTime() {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    hourCycle: "h23",
  };
  const formatter = new Intl.DateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(new Date());
  
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  
  const weekday = map.weekday ? map.weekday.toLowerCase() : "";
  const hour = String(parseInt(map.hour || "0", 10)).padStart(2, "0");
  const minute = String(parseInt(map.minute || "0", 10)).padStart(2, "0");
  const month = String(parseInt(map.month || "0", 10)).padStart(2, "0");
  const day = String(parseInt(map.day || "0", 10)).padStart(2, "0");
  const date = `${map.year || "0000"}-${month}-${day}`;
  
  return { weekday, hour, minute, date };
}

async function handlePirGreeting(deviceId: string) {
  try {
    const { weekday, hour, minute } = getJakartaDateTime();
    const currentMinutes = parseInt(hour, 10) * 60 + parseInt(minute, 10);

    const activeSchedules = await retryQuery(() => prisma.greetingVoiceSchedule.findMany({
      where: { active: true },
    }));

    if (activeSchedules.length === 0) {
      console.log(`[Worker PIR Greeting] No active greeting voice schedules found.`);
      return;
    }

    const now = new Date();

    for (const schedule of activeSchedules) {
      let activeDays: string[] = [];
      try {
        activeDays = JSON.parse(schedule.days);
      } catch (e) {
        console.error(`[Worker PIR Greeting] Error parsing days for schedule ${schedule.id}:`, e);
        continue;
      }
      activeDays = activeDays.map(d => d.toLowerCase());

      if (!activeDays.includes(weekday)) {
        continue;
      }

      const [startH, startM] = schedule.startTime.split(":").map(Number);
      const [endH, endM] = schedule.endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let isWithinTimeRange = false;
      if (startMinutes <= endMinutes) {
        isWithinTimeRange = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        isWithinTimeRange = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }

      if (!isWithinTimeRange) {
        continue;
      }

      const cooldownMs = schedule.cooldown * 1000;
      if (schedule.lastRunAt) {
        const lastRunTime = new Date(schedule.lastRunAt).getTime();
        const diffMs = now.getTime() - lastRunTime;
        if (diffMs < cooldownMs) {
          console.log(`[Worker PIR Greeting] Schedule ${schedule.name} is in cooldown. Remaining: ${Math.round((cooldownMs - diffMs) / 1000)}s`);
          continue;
        }
      }

      let tracksList: number[] = [];
      try {
        tracksList = JSON.parse(schedule.tracks);
      } catch (e) {
        console.error(`[Worker PIR Greeting] Error parsing tracks for schedule ${schedule.id}:`, e);
        continue;
      }

      if (tracksList.length === 0) {
        for (let t = 25; t <= 40; t++) {
          tracksList.push(t);
        }
      }

      let selectedTrack = 25;

      if (schedule.mode === "random") {
        const rndIdx = Math.floor(Math.random() * tracksList.length);
        selectedTrack = tracksList[rndIdx];
      } else {
        const lastTrack = schedule.lastTrackPlayed;
        let nextIdx = 0;
        if (lastTrack !== null && lastTrack !== undefined) {
          const lastIdx = tracksList.indexOf(lastTrack);
          if (lastIdx !== -1) {
            nextIdx = (lastIdx + 1) % tracksList.length;
          }
        }
        selectedTrack = tracksList[nextIdx];
      }

      const topic = `smartbox/${deviceId}/cmd`;
      const payload = {
        id: `greeting_voice_${schedule.id}_${Date.now()}`,
        type: "voice.play",
        payload: {
          track: selectedTrack,
          reason: "greeting_voice",
          scheduleId: schedule.id,
        },
      };

      client.publish(topic, JSON.stringify(payload), { qos: 1 });
      console.log(`[Worker PIR Greeting] Triggered track ${selectedTrack} for schedule: ${schedule.name}`);

      await retryQuery(() => prisma.eventLog.create({
        data: {
          deviceId,
          level: "INFO",
          type: "greeting_voice.played",
          message: `Jadwal '${schedule.name}' memutar sapaan suara track ${selectedTrack}`,
          payload: {
            track: selectedTrack,
            scheduleId: schedule.id,
            mode: schedule.mode,
            time: `${hour}:${minute}`,
          },
        },
      })).catch(err => console.error("[Worker PIR Greeting] Error writing EventLog:", err));

      await retryQuery(() => prisma.greetingVoiceSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          lastTrackPlayed: selectedTrack,
        },
      })).catch(err => console.error("[Worker PIR Greeting] Error updating schedule status:", err));

      break;
    }
  } catch (err) {
    console.error("[Worker PIR Greeting] Error processing greeting voice:", err);
  }
}

async function checkRelaySchedules() {
  try {
    await refreshSchedulesCacheIfNeeded();
    const { weekday, hour, minute, date } = getJakartaDateTime();
    const timeStr = `${hour}:${minute}`;
    
    const schedules = cachedRelaySchedules;

    const targetDeviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
    const topic = `smartbox/${targetDeviceId}/cmd`;
    await ensureDevice(targetDeviceId, true);

    for (const schedule of schedules) {
      let activeDays: string[] = [];
      try {
        activeDays = typeof schedule.days === "string" 
          ? JSON.parse(schedule.days) 
          : (Array.isArray(schedule.days) ? schedule.days : []);
      } catch (e) {
        console.error(`[Worker Schedule] Error parsing days for schedule ${schedule.id}:`, e);
        continue;
      }

      // Convert days array to lowercase to be safe
      activeDays = activeDays.map(d => d.toLowerCase());

      if (activeDays.includes(weekday)) {
        // Check ON trigger
        if (schedule.startTime === timeStr) {
          const triggerKey = `${date}:${timeStr}:on`;
          const stateKey = `${schedule.id}:on`;
          if (lastRelayTrigger.get(stateKey) !== triggerKey) {
            lastRelayTrigger.set(stateKey, triggerKey);
            
            const payload = {
              id: `schedule_relay${schedule.relayNumber}_on`,
              type: "relay.set",
              payload: {
                relay: schedule.relayNumber,
                state: true,
                source: "schedule",
                scheduleId: schedule.id,
              },
            };

            client.publish(topic, JSON.stringify(payload), { qos: 1 });
            console.log(`[Worker Schedule] Triggered Relay ${schedule.relayNumber} ON for schedule: ${schedule.name}`);
            
            // Play voice track for relay ON (Relay 1 -> 8, Relay 2 -> 10)
            const voiceTrack = schedule.relayNumber === 1 ? 8 : 10;
            const voiceCmd = {
              id: `schedule_relay${schedule.relayNumber}_voice_on_${Date.now()}`,
              type: "voice.play",
              payload: {
                track: voiceTrack,
                reason: "relay_schedule_on"
              }
            };
            client.publish(topic, JSON.stringify(voiceCmd), { qos: 1 });

            // Log event to DB with exact fields requested
            await retryQuery(() => prisma.eventLog.create({
              data: {
                deviceId: targetDeviceId,
                level: "INFO",
                type: "relay.scheduled_on",
                message: `Jadwal '${schedule.name}' menyalakan Relay ${schedule.relayNumber}`,
                payload: {
                  relayNumber: schedule.relayNumber,
                  state: true,
                  source: "schedule",
                  time: timeStr,
                  scheduleId: schedule.id,
                },
              },
            })).catch(err => console.error("[Worker Schedule] Error writing EventLog:", err));
          }
        }
        // Check OFF trigger
        if (schedule.endTime === timeStr) {
          const triggerKey = `${date}:${timeStr}:off`;
          const stateKey = `${schedule.id}:off`;
          if (lastRelayTrigger.get(stateKey) !== triggerKey) {
            lastRelayTrigger.set(stateKey, triggerKey);

            const payload = {
              id: `schedule_relay${schedule.relayNumber}_off`,
              type: "relay.set",
              payload: {
                relay: schedule.relayNumber,
                state: false,
                source: "schedule",
                scheduleId: schedule.id,
              },
            };

            client.publish(topic, JSON.stringify(payload), { qos: 1 });
            console.log(`[Worker Schedule] Triggered Relay ${schedule.relayNumber} OFF for schedule: ${schedule.name}`);

            // Play voice track for relay OFF (Relay 1 -> 9, Relay 2 -> 11)
            const voiceTrackOff = schedule.relayNumber === 1 ? 9 : 11;
            const voiceCmdOff = {
              id: `schedule_relay${schedule.relayNumber}_voice_off_${Date.now()}`,
              type: "voice.play",
              payload: {
                track: voiceTrackOff,
                reason: "relay_schedule_off"
              }
            };
            client.publish(topic, JSON.stringify(voiceCmdOff), { qos: 1 });

            // Log event to DB with exact fields requested
            await retryQuery(() => prisma.eventLog.create({
              data: {
                deviceId: targetDeviceId,
                level: "INFO",
                type: "relay.scheduled_off",
                message: `Jadwal '${schedule.name}' mematikan Relay ${schedule.relayNumber}`,
                payload: {
                  relayNumber: schedule.relayNumber,
                  state: false,
                  source: "schedule",
                  time: timeStr,
                  scheduleId: schedule.id,
                },
              },
            })).catch(err => console.error("[Worker Schedule] Error writing EventLog:", err));
          }
        }
      }
    }
  } catch (err) {
    console.error("[Worker Schedule] Unhandled error in checkRelaySchedules:", err);
  }
}

async function triggerAlarmSequence(schedule: any, topic: string, targetDeviceId: string) {
  const repeatCount = schedule.repeatCount || 1;
  const repeatDelay = schedule.repeatDelay || 5;

  console.log(`[Worker] Starting alarm sequence for "${schedule.name}" with ${repeatCount} repetitions`);

  for (let i = 0; i < repeatCount; i++) {
    console.log(`[Worker] Alarm "${schedule.name}" repetition ${i + 1} of ${repeatCount}`);

    if (schedule.buzzerActive) {
      // 1. Turn buzzer ON
      const buzOnCmd = {
        id: `cmd_alarm_buz_on_${Date.now()}`,
        type: "buzzer.set",
        payload: { state: true }
      };
      client.publish(topic, JSON.stringify(buzOnCmd), { qos: 1 });
      console.log(`[Worker] Alarm Buzzer ON for ${schedule.buzzerDuration}s`);

      // 2. Wait for buzzerDuration seconds
      await new Promise(resolve => setTimeout(resolve, (schedule.buzzerDuration || 5) * 1000));

      // 3. Turn buzzer OFF
      const buzOffCmd = {
        id: `cmd_alarm_buz_off_${Date.now()}`,
        type: "buzzer.set",
        payload: { state: false }
      };
      client.publish(topic, JSON.stringify(buzOffCmd), { qos: 1 });
      console.log(`[Worker] Alarm Buzzer OFF`);

      // 4. Wait for buzzerDelay seconds before playing the voice
      await new Promise(resolve => setTimeout(resolve, (schedule.buzzerDelay || 2) * 1000));
    }

    // 5. Play voice track
    const voiceCmd = {
      id: `cmd_alarm_voice_${Date.now()}`,
      type: "voice.play",
      payload: {
        track: schedule.track,
        reason: "schedule_alarm",
        label: schedule.name,
      },
    };
    client.publish(topic, JSON.stringify(voiceCmd), { qos: 1 });
    console.log(`[Worker] Alarm Voice track ${schedule.track} played`);

    // 6. If not the last repetition, wait for repeatDelay seconds before starting the next sequence
    if (i < repeatCount - 1) {
      console.log(`[Worker] Waiting repeat delay of ${repeatDelay}s before next repetition`);
      await new Promise(resolve => setTimeout(resolve, repeatDelay * 1000));
    }
  }
  console.log(`[Worker] Alarm sequence finished for "${schedule.name}"`);
}

async function checkAlarmSchedules() {
  try {
    await refreshSchedulesCacheIfNeeded();
    const { weekday, hour, minute, date } = getJakartaDateTime();
    const timeStr = `${hour}:${minute}`;

    const schedules = cachedAlarmSchedules;

    const targetDeviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
    const topic = `smartbox/${targetDeviceId}/cmd`;
    await ensureDevice(targetDeviceId, true);

    for (const schedule of schedules) {
      if (schedule.time !== timeStr) {
        continue;
      }

      let activeDays: string[] = [];
      try {
        if (schedule.days) {
          activeDays = JSON.parse(schedule.days);
        } else {
          activeDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        }
      } catch {
        activeDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      }

      if (activeDays.length > 0 && !activeDays.includes(weekday)) {
        continue;
      }

      const triggerKey = `${date}:${timeStr}`;
      if (lastAlarmTrigger.get(schedule.id) === triggerKey) {
        continue;
      }

      // Check if lastRunAt is within the current minute
      if (schedule.lastRunAt) {
        const lastRun = new Date(schedule.lastRunAt);
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        });
        const parts = formatter.formatToParts(lastRun);
        const map: Record<string, string> = {};
        for (const part of parts) {
          map[part.type] = part.value;
        }
        const lastRunTimeStr = `${map.hour}:${map.minute}`;
        const lastRunDateStr = lastRun.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

        if (lastRunTimeStr === timeStr && lastRunDateStr === date) {
          lastAlarmTrigger.set(schedule.id, triggerKey);
          continue;
        }
      }

      lastAlarmTrigger.set(schedule.id, triggerKey);

      await retryQuery(() => prisma.alarmSchedule.update({
        where: { id: schedule.id },
        data: { lastRunAt: new Date() },
      })).catch((err) => console.error("[Worker Alarm] Error updating lastRunAt:", err));

      // Update local memory cache object too
      schedule.lastRunAt = new Date();

      // Trigger the alarm sequence in tandem asynchronously
      triggerAlarmSequence(schedule, topic, targetDeviceId).catch((err) => {
        console.error(`[Worker Alarm] Error running alarm sequence for ${schedule.name}:`, err);
      });

      console.log(`[Worker] Alarm schedule triggered: ${schedule.name}`);

      await retryQuery(() => prisma.eventLog.create({
        data: {
          deviceId: targetDeviceId,
          level: "INFO",
          type: "alarm.triggered",
          message: `Alarm jadwal "${schedule.name}" dipicu.`,
          payload: {
            track: schedule.track,
            name: schedule.name,
            buzzerActive: schedule.buzzerActive,
            repeatCount: schedule.repeatCount,
          },
        },
      })).catch((err) => console.error("[Worker Alarm] Error writing EventLog:", err));
      
      console.log(`[Worker] Event saved: alarm.triggered`);
    }
  } catch (err) {
    console.error("[Worker Alarm] Unhandled error in checkAlarmSchedules:", err);
  }
}

async function runSchedulers() {
  await Promise.all([checkRelaySchedules(), checkAlarmSchedules()]);
}

// Run schedules every 1 second. Date is included in each trigger key so
// schedules can run again on the next active day without repeating per minute.
setInterval(runSchedulers, 1000);
setTimeout(runSchedulers, 1000);
