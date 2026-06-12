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
async function retryQuery<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
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

client.on("connect", () => {
  console.log("[Worker] Connected to MQTT broker!");
  
  // Subscribe to wildcard topics to support dynamic devices
  client.subscribe("smartbox/+/telemetry", { qos: 1 });
  client.subscribe("smartbox/+/event", { qos: 1 });
  client.subscribe("smartbox/+/ack", { qos: 1 });
  client.subscribe("smartbox/+/status", { qos: 1 });
  
  console.log("[Worker] Subscribed to wildcard topics: smartbox/+/telemetry, event, ack, status");
});

client.on("message", async (topic, message) => {
  const payloadStr = message.toString();
  console.log(`[Worker] Message received on [${topic}]: ${payloadStr}`);
  
  try {
    const parts = topic.split("/");
    if (parts.length < 3) {
      console.warn(`[Worker] Ignored message with invalid topic structure: ${topic}`);
      return;
    }
    
    const deviceId = parts[1];
    const messageType = parts[2];
    const data = JSON.parse(payloadStr);

    if (messageType === "status") {
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
      
      await ensureDevice(deviceId, true);

      // Handle PIR motion event for fast real-time status update in database
      if (type === "pir.motion") {
        const payloadObj = data.payload || {};
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
  const hour = map.hour || "00";
  const minute = map.minute || "00";
  const date = `${map.year || "0000"}-${map.month || "00"}-${map.day || "00"}`;
  
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
  try {
    const { weekday, hour, minute, date } = getJakartaDateTime();
    const timeStr = `${hour}:${minute}`;
    const weekdayCode = weekday.slice(0, 3).toUpperCase();
    const alarms = await retryQuery(() => prisma.alarm.findMany({
      where: { enabled: true },
    })).catch((err) => {
      console.error("[Worker Alarm] Error fetching alarms:", err);
      return [];
    });

    const targetDeviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
    const topic = `smartbox/${targetDeviceId}/cmd`;
    await ensureDevice(targetDeviceId, true);

    for (const alarm of alarms) {
      const repeatDays = alarm.repeatDays.map((day) => day.toUpperCase());
      if (alarm.time !== timeStr || !repeatDays.includes(weekdayCode)) {
        continue;
      }

      const triggerKey = `${date}:${timeStr}`;
      if (lastAlarmTrigger.get(alarm.id) === triggerKey) {
        continue;
      }
      lastAlarmTrigger.set(alarm.id, triggerKey);

      const command = {
        id: `schedule_alarm_${alarm.id}_${date.replaceAll("-", "")}_${timeStr.replace(":", "")}`,
        type: "alarm.trigger",
        payload: {
          track: alarm.dfTrack,
          time: timeStr,
          scheduleId: alarm.id,
          name: alarm.label,
          source: "schedule",
        },
      };

      client.publish(topic, JSON.stringify(command), { qos: 1 });
      console.log(`[Worker Alarm] Triggered track ${alarm.dfTrack} for alarm: ${alarm.label}`);

      await retryQuery(() => prisma.eventLog.create({
        data: {
          deviceId: targetDeviceId,
          level: "INFO",
          type: "alarm.schedule_triggered",
          message: `Alarm '${alarm.label}' memicu track ${alarm.dfTrack}`,
          payload: {
            track: alarm.dfTrack,
            time: timeStr,
            scheduleId: alarm.id,
            source: "schedule",
          },
        },
      })).catch((err) => console.error("[Worker Alarm] Error writing EventLog:", err));
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
