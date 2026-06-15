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
        gasSensorEnabled = true,
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
          gasSensorEnabled: Boolean(gasSensorEnabled),
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

async function checkRelaySchedules() {
  try {
    const { weekday, hour, minute, date } = getJakartaDateTime();
    const timeStr = `${hour}:${minute}`;
    
    // Fetch all enabled relay schedules
    const schedules = await retryQuery(() => prisma.relaySchedule.findMany({
      where: { enabled: true },
    })).catch((err) => {
      console.error("[Worker Schedule] Error fetching schedules:", err);
      return [];
    });

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

async function checkAlarmSchedules() {
  console.log("[Worker] Alarm schedule check running");
  try {
    const { weekday, hour, minute, date } = getJakartaDateTime();
    const timeStr = `${hour}:${minute}`;

    const schedules = await retryQuery(() => prisma.alarmSchedule.findMany({
      where: { active: true },
    })).catch((err) => {
      console.error("[Worker Alarm] Error fetching alarm schedules:", err);
      return [];
    });

    const targetDeviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
    const topic = `smartbox/${targetDeviceId}/cmd`;
    await ensureDevice(targetDeviceId, true);

    for (const schedule of schedules) {
      if (schedule.time !== timeStr) {
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

      const command = {
        id: "cmd_alarm_voice_play",
        type: "voice.play",
        payload: {
          track: schedule.track,
          reason: "schedule_alarm",
          label: schedule.name,
        },
      };

      client.publish(topic, JSON.stringify(command), { qos: 1 });
      
      console.log(`[Worker] Alarm schedule triggered: ${schedule.name}`);
      console.log(`[Worker] Publish voice.play to smartbox/${targetDeviceId}/cmd`);
      console.log(`[Worker] Track DFPlayer: ${String(schedule.track).padStart(4, "0")}`);

      await retryQuery(() => prisma.eventLog.create({
        data: {
          deviceId: targetDeviceId,
          level: "INFO",
          type: "alarm.triggered",
          message: "Alarm jadwal dipicu dan suara DFPlayer diputar.",
          payload: {
            track: schedule.track,
            name: schedule.name,
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

// Run schedules every 30 seconds. Date is included in each trigger key so
// schedules can run again on the next active day without repeating per minute.
setInterval(runSchedulers, 30 * 1000);
setTimeout(runSchedulers, 3000);
