import { publishMessage } from "@/lib/mqtt-server";
import { commandTopic } from "@/lib/topics";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { track, reason } = body;

    if (typeof track !== "number" || track < 1 || track > 15) {
      return NextResponse.json(
        { error: "Track audio tidak valid. Harus angka 1-15." },
        { status: 400 }
      );
    }

    const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
    const topic = commandTopic(deviceId);

    const mqttPayload = {
      id: "cmd_voice_test",
      type: "voice.play",
      payload: {
        track,
        reason: reason || "manual_test",
      },
    };

    await publishMessage(topic, mqttPayload);

    return NextResponse.json({ ok: true, message: "Command voice.play berhasil dipublish" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memproses request voice play",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
