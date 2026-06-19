import { prisma } from "@/lib/prisma";
import mqtt from "mqtt";
import { NextResponse } from "next/server";

type MqttRequest = {
  topic?: string;
  payload?: Record<string, unknown>;
};

export const runtime = "nodejs";

const defaultBrokerUrl = "mqtts://6559400ba6c741398aa7048b471d5a31.s1.eu.hivemq.cloud:8883";

export async function GET() {
  const brokerUrl = process.env.MQTT_URL || process.env.MQTT_BROKER_URL || defaultBrokerUrl;
  const clientIdPrefix = process.env.MQTT_CLIENT_ID || "smartbox-web";
  const clientId = `${clientIdPrefix}-status-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const username = process.env.MQTT_USERNAME || process.env.NEXT_PUBLIC_MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD || process.env.NEXT_PUBLIC_MQTT_PASSWORD;

  try {
    await connectMqtt({ brokerUrl, clientId, username, password });
    return NextResponse.json({ online: true, brokerUrl });
  } catch (error) {
    return NextResponse.json(
      {
        online: false,
        brokerUrl,
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 200 },
    );
  }
}

export async function POST(request: Request) {
  let body: MqttRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  if (!body.topic || typeof body.topic !== "string") {
    return NextResponse.json({ error: "Field topic wajib diisi" }, { status: 400 });
  }

  const brokerUrl = process.env.MQTT_URL || process.env.MQTT_BROKER_URL || defaultBrokerUrl;
  const clientIdPrefix = process.env.MQTT_CLIENT_ID || "smartbox-web";
  const clientId = `${clientIdPrefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const username = process.env.MQTT_USERNAME || process.env.NEXT_PUBLIC_MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD || process.env.NEXT_PUBLIC_MQTT_PASSWORD;
  const payloadData = body.payload ?? {};
  const payload = JSON.stringify({
    source: "smartbox-web",
    sentAt: new Date().toISOString(),
    data: payloadData,
  });

  try {
    await publishMqtt({ brokerUrl, clientId, username, password, topic: body.topic, payload });

    // Log control command to database as a DeviceEvent
    try {
      const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
      let eventType = "COMMAND_SENT";
      let message = `Command dikirim ke topic: ${body.topic}`;

      if (body.topic === "smartbox/relay/set") {
        eventType = "RELAY_CONTROL";
        const relayKey = payloadData.relay;
        const enabled = payloadData.enabled;
        message = `Kontrol relay: ${relayKey} diatur ke ${enabled ? "ON" : "OFF"}`;
      } else if (body.topic === "smartbox/buzzer/set") {
        eventType = "BUZZER_CONTROL";
        const enabled = payloadData.enabled;
        message = `Buzzer lokal diatur ke ${enabled ? "ON" : "OFF"}`;
      } else if (body.topic === "smartbox/voice/mode") {
        eventType = "VOICE_MODE_CONTROL";
        const enabled = payloadData.enabled;
        message = `Mode voice command diatur ke ${enabled ? "AKTIF" : "NONAKTIF"}`;
      }

      await prisma.deviceEvent.create({
        data: {
          deviceId,
          type: eventType,
          severity: "info",
          message,
          topic: body.topic,
          payload: JSON.parse(JSON.stringify(payloadData)),
        },
      });
    } catch (dbError) {
      console.error("Gagal mencatat DeviceEvent ke database:", dbError);
    }

    return NextResponse.json({ ok: true, topic: body.topic });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal publish MQTT",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}


function publishMqtt({
  brokerUrl,
  clientId,
  username,
  password,
  topic,
  payload,
}: {
  brokerUrl: string;
  clientId: string;
  username?: string;
  password?: string;
  topic: string;
  payload: string;
}) {
  return new Promise<void>((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      clean: true,
      connectTimeout: 3000,
      reconnectPeriod: 0,
    });

    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error("Timeout koneksi MQTT"));
    }, 4500);

    client.on("connect", () => {
      client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
        clearTimeout(timeout);
        client.end(true);

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    client.on("error", (error) => {
      clearTimeout(timeout);
      client.end(true);
      reject(error);
    });
  });
}

function connectMqtt({
  brokerUrl,
  clientId,
  username,
  password,
}: {
  brokerUrl: string;
  clientId: string;
  username?: string;
  password?: string;
}) {
  return new Promise<void>((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      clean: true,
      connectTimeout: 3000,
      reconnectPeriod: 0,
    });

    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error("Timeout koneksi MQTT"));
    }, 4500);

    client.on("connect", () => {
      clearTimeout(timeout);
      client.end(true);
      resolve();
    });

    client.on("error", (error) => {
      clearTimeout(timeout);
      client.end(true);
      reject(error);
    });
  });
}
