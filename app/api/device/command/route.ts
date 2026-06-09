import { prisma } from "@/lib/prisma";
import { publishMessage } from "@/lib/mqtt-server";
import { commandTopic } from "@/lib/topics";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceId, type, payload } = body;

    if (!deviceId || !type || typeof payload === "undefined") {
      return NextResponse.json({ error: "Field deviceId, type, dan payload wajib diisi" }, { status: 400 });
    }

    // Ensure the device exists
    await prisma.device.upsert({
      where: { deviceId },
      update: { lastSeenAt: new Date() },
      create: {
        id: deviceId, // Keep id = deviceId for backward compatibility
        deviceId,
        name: `SmartBox ${deviceId}`,
        status: "online",
        lastSeenAt: new Date(),
      },
    });

    // 1. Simpan command ke DeviceCommand dengan status PENDING
    const command = await prisma.deviceCommand.create({
      data: {
        deviceId,
        type,
        payload: payload ?? {},
        status: "PENDING",
      },
    });

    const topic = commandTopic(deviceId);

    // Prepare MQTT payload containing the database ID so the ESP32 can send an ACK with this ID
    const mqttPayload = {
      id: command.id,
      deviceId,
      type,
      payload,
    };

    // 2. Publish command ke MQTT topic
    try {
      await publishMessage(topic, mqttPayload);
      
      // 3. Update status command menjadi SENT
      const updatedCommand = await prisma.deviceCommand.update({
        where: { id: command.id },
        data: {
          status: "SENT",
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({ ok: true, command: updatedCommand });
    } catch (mqttError) {
      console.error("[API Command] Failed to publish MQTT message:", mqttError);
      
      // If MQTT publish fails, update status to FAILED
      const failedCommand = await prisma.deviceCommand.update({
        where: { id: command.id },
        data: {
          status: "FAILED",
          updatedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          error: "Gagal mengirim command via MQTT",
          detail: mqttError instanceof Error ? mqttError.message : "Unknown error",
          command: failedCommand,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memproses request command",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
