/**
 * /api/smartbox/status - Status singleton terkini Smartbox
 *
 * GET    - Ambil status terkini
 * POST   - Update status (dari MQTT worker atau API)
 * PUT    - Update sebagian status (patch)
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get("deviceId") || "smartbox-001";

    const status = await prisma.smartboxStatus.findUnique({
      where: { deviceId },
    });

    if (!status) {
      return NextResponse.json({
        success: true,
        deviceId,
        status: null,
        message: "Status belum tersedia. Tunggu telemetry pertama dari ESP32.",
      });
    }

    return NextResponse.json({
      success: true,
      deviceId,
      status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[STATUS GET] Error:", message);
    return NextResponse.json(
      { error: "Gagal mengambil status", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      deviceId = "smartbox-001",
      online,
      firmwareVersion,
      ssid,
      ip,
      backendIp,
      mac,
      rssi,
      gasRaw,
      gasLevel,
      smokeDetected,
      gasDetected,
      temperatureC,
      temperatureHigh,
      pirDetected,
      obstacleNear,
      relay1,
      relay2,
      bluetoothAudio,
      buzzer,
      mq2Baseline,
      smokeThreshold,
      gasThreshold,
      dfPlayerReady,
      lastTrackPlayed,
      lastAiQuery,
      lastAiResponse,
    } = body;

    const now = new Date();

    const status = await prisma.smartboxStatus.upsert({
      where: { deviceId },
      create: {
        deviceId,
        online: online ?? false,
        lastSeenAt: now,
        firmwareVersion: firmwareVersion ?? null,
        ssid: ssid ?? null,
        ip: ip ?? null,
        backendIp: backendIp ?? null,
        mac: mac ?? null,
        rssi: rssi ?? null,
        gasRaw: gasRaw ?? null,
        gasLevel: gasLevel ?? "normal",
        smokeDetected: smokeDetected ?? false,
        gasDetected: gasDetected ?? false,
        temperatureC: temperatureC ?? null,
        temperatureHigh: temperatureHigh ?? false,
        pirDetected: pirDetected ?? false,
        obstacleNear: obstacleNear ?? false,
        relay1: relay1 ?? false,
        relay2: relay2 ?? false,
        bluetoothAudio: bluetoothAudio ?? false,
        buzzer: buzzer ?? false,
        mq2Baseline: mq2Baseline ?? null,
        smokeThreshold: smokeThreshold ?? null,
        gasThreshold: gasThreshold ?? null,
        dfPlayerReady: dfPlayerReady ?? false,
        lastTrackPlayed: lastTrackPlayed ?? null,
        lastAiQuery: lastAiQuery ?? null,
        lastAiResponse: lastAiResponse ?? null,
        lastAiAt: lastAiQuery ? now : null,
        lastVoiceAt: lastTrackPlayed ? now : null,
      },
      update: {
        lastSeenAt: now,
        ...(online !== undefined ? { online } : {}),
        ...(firmwareVersion !== undefined ? { firmwareVersion } : {}),
        ...(ssid !== undefined ? { ssid } : {}),
        ...(ip !== undefined ? { ip } : {}),
        ...(backendIp !== undefined ? { backendIp } : {}),
        ...(mac !== undefined ? { mac } : {}),
        ...(rssi !== undefined ? { rssi } : {}),
        ...(gasRaw !== undefined ? { gasRaw } : {}),
        ...(gasLevel !== undefined ? { gasLevel } : {}),
        ...(smokeDetected !== undefined ? { smokeDetected } : {}),
        ...(gasDetected !== undefined ? { gasDetected } : {}),
        ...(temperatureC !== undefined ? { temperatureC } : {}),
        ...(temperatureHigh !== undefined ? { temperatureHigh } : {}),
        ...(pirDetected !== undefined ? { pirDetected } : {}),
        ...(obstacleNear !== undefined ? { obstacleNear } : {}),
        ...(relay1 !== undefined ? { relay1 } : {}),
        ...(relay2 !== undefined ? { relay2 } : {}),
        ...(bluetoothAudio !== undefined ? { bluetoothAudio } : {}),
        ...(buzzer !== undefined ? { buzzer } : {}),
        ...(mq2Baseline !== undefined ? { mq2Baseline } : {}),
        ...(smokeThreshold !== undefined ? { smokeThreshold } : {}),
        ...(gasThreshold !== undefined ? { gasThreshold } : {}),
        ...(dfPlayerReady !== undefined ? { dfPlayerReady } : {}),
        ...(lastTrackPlayed !== undefined
          ? { lastTrackPlayed, lastVoiceAt: now }
          : {}),
        ...(lastAiQuery !== undefined
          ? {
              lastAiQuery,
              lastAiResponse: lastAiResponse ?? null,
              lastAiAt: now,
            }
          : {}),
      },
    });

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[STATUS POST] Error:", message);
    return NextResponse.json(
      { error: "Gagal update status", detail: message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  // Alias ke POST untuk kompatibilitas
  return POST(req);
}
