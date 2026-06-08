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

// Throttling maps to prevent spamming the database with normal telemetry
// Saves telemetry every 30 seconds, unless a warning is triggered.
const lastSavedTelemetry = new Map<string, number>();

client.on("connect", () => {
  console.log("[Worker] Connected to MQTT broker!");
  
  // Subscribe to device status (online/offline) and telemetry topics
  client.subscribe("smartbox/status", { qos: 1 });
  client.subscribe("smartbox/telemetry", { qos: 1 });
  
  console.log("[Worker] Subscribed to smartbox/status and smartbox/telemetry");
});

client.on("message", async (topic, message) => {
  const payloadStr = message.toString();
  console.log(`[Worker] Message received on [${topic}]: ${payloadStr}`);
  
  try {
    const data = JSON.parse(payloadStr);

    if (topic === "smartbox/status") {
      const { deviceId, online } = data;
      if (!deviceId) {
        console.warn("[Worker] Missing deviceId in status message");
        return;
      }
      
      console.log(`[Worker] Device ${deviceId} status changed to: ${online ? "ONLINE" : "OFFLINE"}`);
      
      // Update device online status in database
      await prisma.device.upsert({
        where: { id: deviceId },
        update: {
          online: Boolean(online),
          updatedAt: new Date(),
        },
        create: {
          id: deviceId,
          name: "SmartBox Assistant S3",
          mqttBase: `smartbox/${deviceId}`,
          online: Boolean(online),
        },
      });
    }
    
    else if (topic === "smartbox/telemetry") {
      // The updated ESP32 telemetry will include deviceId, gasRaw, temperatureC, gasDetected, pirDetected, obstacleNear etc.
      const {
        deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001",
        gasEnabled = true,
        gasRaw = null,
        gasDetected = false,
        tempEnabled = true,
        temperatureC = null,
        flameDetected = false,
        pirDetected = false,
        obstacleNear = false,
      } = data;
      
      // Check if we should write this snapshot to the database.
      // We write if:
      // 1. A warning state is detected (critical event, write immediately).
      // 2. Or, at least 30 seconds have passed since the last saved telemetry snapshot for this device.
      const now = Date.now();
      const lastSavedTime = lastSavedTelemetry.get(deviceId) || 0;
      const timeDiff = now - lastSavedTime;
      const isWarning = Boolean(gasDetected) || (typeof temperatureC === "number" && temperatureC > 37.0);
      
      if (isWarning || timeDiff >= 30000) {
        console.log(`[Worker] Saving telemetry snapshot for ${deviceId} to DB (Warning: ${isWarning}, Time elapsed: ${Math.round(timeDiff / 1000)}s)`);
        
        // Ensure device is marked online
        await prisma.device.upsert({
          where: { id: deviceId },
          update: {
            online: true,
            updatedAt: new Date(),
          },
          create: {
            id: deviceId,
            name: "SmartBox Assistant S3",
            mqttBase: `smartbox/${deviceId}`,
            online: true,
          },
        });
        
        // Create sensor snapshot record
        const snapshot = await prisma.sensorSnapshot.create({
          data: {
            deviceId,
            gasEnabled: Boolean(gasEnabled),
            gasRaw: typeof gasRaw === "number" ? Math.round(gasRaw) : null,
            gasDetected: Boolean(gasDetected),
            tempEnabled: Boolean(tempEnabled),
            temperatureC: typeof temperatureC === "number" ? temperatureC : null,
            flameDetected: Boolean(flameDetected),
            pirDetected: Boolean(pirDetected),
            obstacleNear: Boolean(obstacleNear),
          },
        });
        
        // Update the last saved timestamp
        lastSavedTelemetry.set(deviceId, now);
        
        // Create warnings events if they occurred
        if (Boolean(gasDetected)) {
          await prisma.deviceEvent.create({
            data: {
              deviceId,
              type: "GAS_WARNING",
              severity: "critical",
              message: `Sensor MQ-2 mendeteksi gas berbahaya! Kadar: ${gasRaw} raw.`,
            },
          });
          console.log(`[Worker] Logged GAS_WARNING event for ${deviceId}`);
        }
        
        if (typeof temperatureC === "number" && temperatureC > 37.0) {
          await prisma.deviceEvent.create({
            data: {
              deviceId,
              type: "TEMP_WARNING",
              severity: "warning",
              message: `Suhu ruangan panas terdeteksi: ${temperatureC}°C.`,
            },
          });
          console.log(`[Worker] Logged TEMP_WARNING event for ${deviceId}`);
        }
      } else {
        // Just print a micro log, don't hit database to prevent Neon DB connection/write overload
        console.log(`[Worker] Telemetry for ${deviceId} ignored (throttled). Next DB save in ${Math.round((30000 - timeDiff) / 1000)}s`);
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
