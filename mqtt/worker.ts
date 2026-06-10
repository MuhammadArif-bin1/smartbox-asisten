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

async function ensureDevice(deviceId: string, isOnline: boolean = true) {
  try {
    return await prisma.device.upsert({
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
    });
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
    }
    
    else if (messageType === "telemetry") {
      const {
        temperature = 0,
        temperatureC,
        gasRaw = 0,
        gasDetected = false,
        gasLevel = "normal",
        temperatureHigh = false,
        pirDetected = false,
        motion,
        obstacleNear = false,
        relay1 = false,
        relay2 = false,
        bluetoothRelay = false,
        ampRelay,
        bluetoothAudio,
        buzzer = false,
        gasSensorEnabled = true,
      } = data;

      // Extract temperature value (support fallback keys)
      const finalTemperature = typeof temperature === "number" ? temperature : (typeof temperatureC === "number" ? temperatureC : 0);
      // Extract bluetoothRelay value (support fallback keys)
      const finalBluetooth = typeof bluetoothRelay === "boolean" 
        ? bluetoothRelay 
        : (typeof ampRelay === "boolean" 
          ? ampRelay 
          : (typeof bluetoothAudio === "boolean" ? bluetoothAudio : false));
      // Extract PIR detected value (support fallback keys)
      const finalPir = typeof pirDetected === "boolean" ? pirDetected : (typeof motion === "boolean" ? motion : false);

      await ensureDevice(deviceId, true);

      // Create new SensorReading record
      await prisma.sensorReading.create({
        data: {
          deviceId,
          temperature: finalTemperature,
          gasRaw: typeof gasRaw === "number" ? Math.round(gasRaw) : 0,
          gasDetected: Boolean(gasDetected),
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
      });

      console.log(`[Worker] Saved SensorReading for ${deviceId}: Temp=${finalTemperature}°C, GasRaw=${gasRaw}, Level=${gasLevel}`);
    }
    
    else if (messageType === "event") {
      const { level = "INFO", type = "generic", message = "" } = data;
      
      await ensureDevice(deviceId, true);

      await prisma.eventLog.create({
        data: {
          deviceId,
          level,
          type,
          message,
          payload: data,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        },
      });

      console.log(`[Worker] Logged EventLog for ${deviceId}: [${level}] ${type} - ${message}`);
    }
    
    else if (messageType === "ack") {
      const { id: commandId, message = "" } = data;
      
      await ensureDevice(deviceId, true);

      if (commandId) {
        const result = await prisma.deviceCommand.updateMany({
          where: {
            id: commandId,
            deviceId: deviceId,
          },
          data: {
            status: "ACK",
            ack: data,
            updatedAt: new Date(),
          },
        });

        if (result.count > 0) {
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
